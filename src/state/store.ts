/**
 * 应用状态与编译编排。
 *
 * 单一可变状态 + 订阅；UI 组件不直接互调，只通过 Store 方法改状态。
 * 源码/参数变化后 350ms 防抖自动编译，新的编译会递增 generation，
 * 旧 Worker 的结果返回时直接丢弃。
 */

import type { AiVerification, ChatMessage, RerollContext, ScadParam } from '../core/types.js';
import { parseCustomizer } from '../core/scad-parser.js';
import { coerceParamValue, mergeParamValues, valuesFromParams } from '../engine/defines.js';
import { compile } from '../engine/compiler.js';
import type { CompileResult, ParamValue, ParamValues } from '../engine/types.js';
import { getCjkFont } from '../storage/fonts.js';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatEntry {
  id: string;
  role: ChatRole;
  text: string;
  /** 验证徽标（仅 AI 生成/修改时）。 */
  verification?: AiVerification;
  /** 验证失败/解析失败时，用于"重抽"。 */
  rerollContext?: RerollContext;
  /** 解析失败等错误文案。 */
  error?: string;
  /** 本条消息对应的动作类型（调试/图标用）。 */
  actionType?: string;
}

export interface ProjectState {
  id: string;
  name: string;
  source: string;
  paramValues: ParamValues;
  chat: ChatEntry[];
  updatedAt: number;
}

export interface AppState {
  project: ProjectState;
  params: ScadParam[];
  hiddenGroups: string[];
  compile: CompileResult | null;
  compiling: boolean;
  compileError: string | null;
  codeOpen: boolean;
  examplesOpen: boolean;
  settingsOpen: boolean;
  aiBusy: boolean;
  lastAiMessage: string | null;
}

type Listener = (state: AppState) => void;

const STARTER_SOURCE = `/* [尺寸] */
size = 40; // [20:5:120]
wall = 3; // [1:0.5:8]

/* [Hidden] */
$fn = 64;

difference() {
  cube(size, center = true);
  cube([size - wall * 2, size - wall * 2, size + 2], center = true);
}
`;

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class Store {
  private listeners = new Set<Listener>();
  private compileTimer: number | null = null;
  private compileGeneration = 0;
  private disposed = false;

  state: AppState;

  constructor() {
    const source = STARTER_SOURCE;
    const parsed = parseCustomizer(source);
    this.state = {
      project: {
        id: uid(),
        name: '未命名项目',
        source,
        paramValues: valuesFromParams(parsed.params),
        chat: [
          {
            id: uid(),
            role: 'assistant',
            text: '先改右侧参数看效果，或在左侧直接说想要什么模型，例如「做一个仿瓷器的高足碗」。',
          },
        ],
        updatedAt: Date.now(),
      },
      params: parsed.params,
      hiddenGroups: parsed.hiddenGroups,
      compile: null,
      compiling: false,
      compileError: null,
      codeOpen: false,
      examplesOpen: false,
      settingsOpen: false,
      aiBusy: false,
      lastAiMessage: null,
    };
    this.scheduleCompile(0);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    if (this.disposed) return;
    for (const listener of this.listeners) listener(this.state);
  }

  private patch(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private patchProject(patch: Partial<ProjectState>): void {
    this.state = {
      ...this.state,
      project: { ...this.state.project, ...patch, updatedAt: Date.now() },
    };
    this.emit();
  }

  /** 用户/编辑器改源码：重新解析参数并合并已改值。 */
  setSource(source: string): void {
    if (source === this.state.project.source) return;
    const parsed = parseCustomizer(source);
    const paramValues = mergeParamValues(parsed.params, this.state.project.paramValues);
    this.state = {
      ...this.state,
      project: { ...this.state.project, source, paramValues, updatedAt: Date.now() },
      params: parsed.params,
      hiddenGroups: parsed.hiddenGroups,
    };
    this.emit();
    this.scheduleCompile();
  }

  /** 参数面板改值。 */
  setParam(name: string, value: ParamValue): void {
    const param = this.state.params.find((p) => p.name === name);
    if (!param) return;
    const coerced = coerceParamValue(param, value);
    if (this.state.project.paramValues[name] === coerced) return;
    this.patchProject({ paramValues: { ...this.state.project.paramValues, [name]: coerced } });
    this.scheduleCompile();
  }

  resetParams(): void {
    this.patchProject({ paramValues: valuesFromParams(this.state.params) });
    this.scheduleCompile();
  }

  /** 外部动作（AI replaceSource / 范例载入）。 */
  replaceSource(source: string): void {
    this.setSource(source);
  }

  renameProject(name: string): void {
    this.patchProject({ name: name.trim() || '未命名项目' });
  }

  addChat(entry: Omit<ChatEntry, 'id'> & { id?: string }): string {
    const id = entry.id ?? uid();
    this.patchProject({ chat: [...this.state.project.chat, { ...entry, id }] });
    return id;
  }

  updateChat(id: string, patch: Partial<ChatEntry>): void {
    this.patchProject({
      chat: this.state.project.chat.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
  }

  clearChat(): void {
    this.patchProject({ chat: [] });
  }

  setCodeOpen(open: boolean): void {
    this.patch({ codeOpen: open });
  }

  toggleCode(): void {
    this.patch({ codeOpen: !this.state.codeOpen });
  }

  setExamplesOpen(open: boolean): void {
    this.patch({ examplesOpen: open });
  }

  setSettingsOpen(open: boolean): void {
    this.patch({ settingsOpen: open });
  }

  setAiBusy(busy: boolean): void {
    this.patch({ aiBusy: busy });
  }

  setLastAiMessage(message: string | null): void {
    this.patch({ lastAiMessage: message });
  }

  newProject(): void {
    this.compileGeneration++;
    const parsed = parseCustomizer('');
    this.state = {
      ...this.state,
      project: {
        id: uid(),
        name: '未命名项目',
        source: '',
        paramValues: valuesFromParams(parsed.params),
        chat: [],
        updatedAt: Date.now(),
      },
      params: [],
      hiddenGroups: [],
      compile: null,
      compiling: false,
      compileError: null,
    };
    this.emit();
  }

  loadProject(project: ProjectState): void {
    this.compileGeneration++;
    const parsed = parseCustomizer(project.source);
    this.state = {
      ...this.state,
      project: { ...project, updatedAt: Date.now() },
      params: parsed.params,
      hiddenGroups: parsed.hiddenGroups,
      compile: null,
      compiling: false,
      compileError: null,
    };
    this.emit();
    if (project.source.trim()) this.scheduleCompile(0);
  }

  /** 手动触发编译（工具栏按钮 / AI 应用后）。 */
  compileNow(): void {
    this.scheduleCompile(0);
  }

  private scheduleCompile(delay = 350): void {
    // 立即作废所有在途编译：防抖窗口内旧 Worker 返回时不能覆盖新状态
    this.compileGeneration++;
    if (this.compileTimer !== null) window.clearTimeout(this.compileTimer);
    this.compileTimer = window.setTimeout(() => {
      this.compileTimer = null;
      void this.runCompile();
    }, delay);
  }

  private async runCompile(): Promise<void> {
    const generation = this.compileGeneration;
    const source = this.state.project.source;
    if (!source.trim()) {
      this.patch({ compile: null, compiling: false, compileError: null });
      return;
    }

    this.patch({ compiling: true, compileError: null });

    try {
      const font = getCjkFont();
      const result = await compile({
        source,
        defines: this.state.project.paramValues,
        format: 'stl',
        timeoutMs: 25_000,
        fonts: font ? [{ name: font.name, data: font.data }] : undefined,
      });
      if (generation !== this.compileGeneration) return;
      this.patch({
        compile: result,
        compiling: false,
        compileError: result.ok ? null : firstError(result),
      });
    } catch (e) {
      if (generation !== this.compileGeneration) return;
      this.patch({
        compile: null,
        compiling: false,
        compileError: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /** AI 历史：只保留 user/assistant 文本。 */
  aiHistory(): ChatMessage[] {
    return this.state.project.chat
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text }))
      .slice(-10);
  }

  dispose(): void {
    this.disposed = true;
    if (this.compileTimer !== null) window.clearTimeout(this.compileTimer);
    this.listeners.clear();
  }
}

function firstError(result: CompileResult): string {
  const error = result.messages.find((m) => m.level === 'error');
  if (error) return error.line ? `${error.text}（第 ${error.line} 行）` : error.text;
  return result.empty ? '模型为空：编译成功但没有生成任何几何体' : '编译失败';
}

export { STARTER_SOURCE };
