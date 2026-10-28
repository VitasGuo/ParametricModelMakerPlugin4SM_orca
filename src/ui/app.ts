/**
 * 应用主控制器：布局、状态同步、AI 调用、导出与弹窗。
 */

import '../styles/app.css';
import type { AiRequest, AiResponse, RerollContext } from '../core/types.js';
import { EXAMPLES } from '../core/examples.js';
import { injectParams } from '../core/scad-parser.js';
import { chat } from '../ai/pipeline.js';
import { verifyScad } from '../ai/verify.js';
import { loadConfig, saveConfig } from '../ai/config.js';
import { PROVIDERS, type WebModelConfig } from '../ai/providers.js';
import { compile } from '../engine/compiler.js';
import {
  downloadArrayBuffer,
  downloadBlob,
  downloadProjectJson,
  safeName,
  saveProject,
} from '../storage/projects.js';
import { getCjkFont, initCjkFont } from '../storage/fonts.js';
import { Store, type AppState, type ChatEntry } from '../state/store.js';
import { langToggleLabel, toggleLang } from '../i18n.js';
import { Viewer, type ViewName } from '../viewer/viewer.js';
import { CodeEditor } from '../editor/editor.js';
import { ChatPanel } from './chat.js';
import { ParamPanel } from './params.js';
import { button, el, clear } from './dom.js';
import { openSettingsModal } from './settings.js';
import { openExamplesModal } from './examples.js';
import { openProjectsModal } from './projects.js';
import { openBatchModal } from './batch.js';
import { toast } from './toast.js';

export class App {
  private readonly store = new Store();
  private readonly viewer: Viewer;
  private readonly editor: CodeEditor;
  private readonly chatPanel: ChatPanel;
  private readonly paramPanel: ParamPanel;

  private readonly projectName: HTMLInputElement;
  private readonly statusBadge: HTMLElement;
  private readonly configBadge: HTMLButtonElement;
  private readonly dimensions: HTMLElement;
  private readonly emptyOverlay: HTMLElement;
  private readonly codeDrawer: HTMLElement;
  private readonly codeStatus: HTMLElement;
  private readonly codeLog: HTMLElement;

  private config: WebModelConfig | null = loadConfig();
  private lastOutput: ArrayBuffer | null = null;
  private wireframe = false;
  private codeWasOpen = false;

  constructor(root: HTMLElement) {
    root.replaceChildren();
    root.className = 'app';

    // ---------- topbar ----------
    this.projectName = el('input', 'project-name');
    this.projectName.value = this.store.state.project.name;
    this.projectName.addEventListener('change', () => this.store.renameProject(this.projectName.value));
    this.projectName.addEventListener('blur', () => this.store.renameProject(this.projectName.value));

    this.statusBadge = el('span', 'badge', ['等待生成']);
    this.configBadge = el('button', 'badge err', ['未配置模型']);
    this.configBadge.type = 'button';
    this.configBadge.addEventListener('click', () => this.openSettings());

    const fileButton = button('文件', 'btn', () => this.toggleMenu());
    const exportMenu = el('div', 'menu');
    exportMenu.style.display = 'none';
    exportMenu.append(
      menuItem('新建', () => this.newProject()),
      menuItem('打开', () => this.openProjects()),
      menuItem('保存', () => this.saveCurrent()),
      menuItem('导出 STL', () => this.exportStl()),
      menuItem('导出 3MF', () => void this.export3mf()),
      menuItem('导出 .scad（含当前参数）', () => this.exportScad()),
      menuItem('导出项目 JSON', () => downloadProjectJson(this.store.state.project))
    );
    const menuWrap = el('div', 'menu-wrap', [fileButton, exportMenu]);
    this.exportMenu = exportMenu;
    document.addEventListener('click', (event) => {
      if (!menuWrap.contains(event.target as Node)) exportMenu.style.display = 'none';
    });

    const langBtn = button(langToggleLabel(), 'btn', () => toggleLang());
    langBtn.setAttribute('data-lang-toggle', '');
    langBtn.setAttribute('data-i18n-skip', '');

    const topbar = el('div', 'topbar', [
      el('div', 'brand', [el('div', 'brand-mark', ['PM']), el('span', '', ['AI 参数化模型'])]),
      this.projectName,
      this.configBadge,
      this.statusBadge,
      el('span', 'topbar-spacer'),
      el('div', 'topbar-group', [
        menuWrap,
        button('范例', 'btn', () => this.openExamples()),
        button('设置', 'btn', () => this.openSettings()),
        langBtn,
        button('代码', 'btn', () => this.store.toggleCode()),
      ]),
    ]);

    // ---------- viewer ----------
    const viewControls = el('div', 'view-controls', [
      this.viewButton('ISO', 'iso'),
      this.viewButton('正', 'front'),
      this.viewButton('顶', 'top'),
      this.viewButton('右', 'right'),
    ]);
    this.dimensions = el('div', 'viewer-dimensions');
    const toolbar = el('div', 'viewer-toolbar', [
      viewControls,
      el('span', 'spacer'),
      button('重新编译', 'btn btn-sm', () => this.store.compileNow()),
      button('线框', 'btn btn-sm', () => this.toggleWireframe()),
      button('截图', 'btn btn-sm', () => void this.saveScreenshot()),
    ]);
    const viewerCanvas = el('div', 'viewer-canvas');
    this.emptyOverlay = el('div', 'viewer-empty', [this.buildEmptyCard()]);
    const viewerEl = el('div', 'viewer', [viewerCanvas, toolbar, this.dimensions, this.emptyOverlay]);

    // ---------- panels ----------
    const left = el('div', 'panel panel-left');
    const right = el('div', 'panel panel-right');

    // ---------- code drawer ----------
    this.codeDrawer = el('div', 'code-drawer hidden');
    this.codeStatus = el('span', 'badge', ['']);
    const codeEditorEl = el('div', 'code-editor');
    this.codeLog = el('div', 'code-log');
    const codeHead = el('div', 'code-head', [
      el('span', 'panel-title', ['SCAD 源码']),
      this.codeStatus,
      el('span', 'topbar-spacer'),
      button('关闭', 'btn btn-sm btn-ghost', () => this.store.setCodeOpen(false)),
    ]);
    this.codeDrawer.append(codeHead, codeEditorEl, this.codeLog);

    const main = el('div', 'main', [left, viewerEl, right]);
    root.append(topbar, main, this.codeDrawer);

    this.viewer = new Viewer(viewerCanvas);
    this.editor = new CodeEditor({
      parent: codeEditorEl,
      initialSource: this.store.state.project.source,
      onChange: (source) => this.store.setSource(source),
    });
    this.paramPanel = new ParamPanel(right, this.store);
    this.chatPanel = new ChatPanel({
      container: left,
      store: this.store,
      onSend: (text) => this.handleSend(text),
      onReroll: (entry) => this.handleReroll(entry),
      onExamples: () => this.openExamples(),
      onSettings: () => this.openSettings(),
    });

    this.store.subscribe((state) => this.onState(state));

    void initCjkFont().then((font) => {
      if (font && /\btext\s*\(/.test(this.store.state.project.source)) this.store.compileNow();
    });

    if (!this.config?.apiKey) {
      this.store.addChat({
        role: 'system',
        text: '尚未配置模型：点右上角「设置」填入 Provider / 模型 / API Key。纯静态网页，Key 只存在本机浏览器。',
      });
    }
  }

  private readonly exportMenu: HTMLElement;

  private onState(state: AppState): void {
    if (document.activeElement !== this.projectName) this.projectName.value = state.project.name;

    const configured = !!this.config?.apiKey;
    const meta = this.config ? PROVIDERS[this.config.provider] : null;
    const needsProxy = configured && meta?.cors === 'proxy' && !this.config?.proxyUrl;
    if (!configured) {
      this.configBadge.style.display = '';
      this.configBadge.className = 'badge err';
      this.configBadge.textContent = '未配置模型';
    } else if (needsProxy) {
      this.configBadge.style.display = '';
      this.configBadge.className = 'badge busy';
      this.configBadge.textContent = '需代理';
    } else {
      this.configBadge.style.display = 'none';
    }

    this.updateStatus(state);
    this.updateViewer(state);
    this.updateEditor(state);
    this.updateCodeDrawer(state);
    this.paramPanel.render(state);
    this.chatPanel.render(state);

    this.emptyOverlay.style.display = this.shouldShowEmpty(state) ? '' : 'none';
  }

  private updateStatus(state: AppState): void {
    if (state.compiling) {
      this.statusBadge.className = 'badge busy';
      this.statusBadge.textContent = '编译中…';
      this.statusBadge.title = '';
    } else if (state.compileError) {
      this.statusBadge.className = 'badge err';
      this.statusBadge.textContent = '编译失败';
      this.statusBadge.title = state.compileError;
    } else if (state.compile?.ok) {
      this.statusBadge.className = 'badge ok';
      this.statusBadge.textContent = `编译成功 ${state.compile.durationMs} ms`;
      this.statusBadge.title = '';
    } else if (!state.project.source.trim()) {
      this.statusBadge.className = 'badge';
      this.statusBadge.textContent = '等待生成';
      this.statusBadge.title = '';
    } else {
      this.statusBadge.className = 'badge';
      this.statusBadge.textContent = '等待编译';
      this.statusBadge.title = '';
    }

    const summary = state.compile?.summary;
    if (summary) {
      const [x = 0, y = 0, z = 0] = summary.size;
      this.dimensions.textContent =
        `${x.toFixed(1)} × ${y.toFixed(1)} × ${z.toFixed(1)} mm · ` +
        `${(summary.volumeMm3 / 1000).toFixed(2)} cm³ · ${summary.triangles} 面`;
    } else {
      this.dimensions.textContent = '';
    }

    this.codeStatus.className = state.compileError ? 'badge err' : state.compiling ? 'badge busy' : 'badge ok';
    this.codeStatus.textContent = state.compiling
      ? '编译中…'
      : state.compileError
        ? '编译失败'
        : state.compile?.ok
          ? `${state.compile.durationMs} ms`
          : '';

    this.renderLog(state);
  }

  private updateViewer(state: AppState): void {
    const output = state.compile?.ok ? state.compile.output : undefined;
    if (output) {
      if (output !== this.lastOutput) {
        this.lastOutput = output;
        this.viewer.loadStl(output);
      }
      return;
    }
    if (!state.project.source.trim()) {
      this.lastOutput = null;
      this.viewer.clearModel();
    }
    // 编译失败时保留上一次成功预览，避免用户看到黑屏
  }

  private updateEditor(state: AppState): void {
    if (this.editor.getSource() !== state.project.source) {
      this.editor.setSource(state.project.source);
    }
  }

  private updateCodeDrawer(state: AppState): void {
    this.codeDrawer.classList.toggle('hidden', !state.codeOpen);
    if (state.codeOpen && !this.codeWasOpen) {
      requestAnimationFrame(() => this.editor.requestMeasure());
    }
    this.codeWasOpen = state.codeOpen;
  }

  private renderLog(state: AppState): void {
    clear(this.codeLog);
    if (state.compiling) {
      this.codeLog.appendChild(el('div', 'warn', ['编译中…']));
      return;
    }
    if (state.compile?.messages.length) {
      for (const message of state.compile.messages.slice(0, 100)) {
        this.codeLog.appendChild(
          el('div', message.level === 'error' ? 'err' : message.level === 'warn' ? 'warn' : '', [
            message.line ? `[第 ${message.line} 行] ${message.text}` : message.text,
          ])
        );
      }
      return;
    }
    if (state.compileError) {
      this.codeLog.appendChild(el('div', 'err', [state.compileError]));
      return;
    }
    if (state.compile?.ok) {
      this.codeLog.appendChild(el('div', '', ['编译成功，无警告。']));
    }
  }

  private shouldShowEmpty(state: AppState): boolean {
    if (!state.project.source.trim()) return true;
    return !state.compile && !state.compiling && !state.compileError;
  }

  private buildEmptyCard(): HTMLElement {
    const chips = el('div', 'chips');
    for (const example of EXAMPLES.slice(0, 5)) {
      chips.appendChild(
        button(example.name, 'chip', () => {
          this.loadExample(example);
        })
      );
    }
    chips.appendChild(button('浏览全部范例', 'chip', () => this.openExamples()));
    return el('div', 'viewer-empty-card', [
      el('h2', '', ['用一句话生成可打印的模型']),
      el('p', '', [
        '直接告诉 AI 你想要什么，或从范例开始改。所有模型在浏览器内用 OpenSCAD 编译，导出 STL / 3MF。',
      ]),
      chips,
    ]);
  }

  private handleSend(text: string): boolean {
    if (this.store.state.aiBusy) return false;
    if (!this.config?.apiKey) {
      toast('先配置模型和 API Key', 'error');
      this.openSettings();
      return false;
    }
    const meta = PROVIDERS[this.config.provider];
    if (meta.cors === 'proxy' && !this.config.proxyUrl) {
      toast(`${meta.label} 在浏览器里需要代理；请填写代理地址，或改用 OpenRouter`, 'error');
      this.openSettings();
      return false;
    }
    void this.runAi(text);
    return true;
  }

  private async runAi(userMessage: string, reroll?: RerollContext): Promise<void> {
    if (!this.config) return;
    const history = this.store.aiHistory();
    if (reroll) {
      this.store.addChat({ role: 'system', text: '按验证反馈重抽…' });
    } else {
      this.store.addChat({ role: 'user', text: userMessage });
    }
    this.store.setAiBusy(true);

    try {
      const source = this.store.state.project.source;
      const request: AiRequest = {
        userMessage,
        state: {
          scadSource: source,
          paramValues: this.store.state.project.paramValues,
          previewScreenshot:
            this.store.state.compile?.ok && this.viewer.hasModel()
              ? this.viewer.captureContactSheet()
              : '',
          capturedAt: Date.now(),
        },
        history,
        rerollContext: reroll,
      };
      const response = await chat(request, this.config, (candidate, values) =>
        verifyScad(candidate, values, { screenshot: true })
      );
      this.appendAiResponse(response);
      this.applyAction(response);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.store.addChat({ role: 'assistant', text: '', error: message });
      toast(message, 'error');
    } finally {
      this.store.setAiBusy(false);
    }
  }

  private appendAiResponse(response: AiResponse): void {
    const action = response.action;
    const text =
      action?.type === 'clarify'
        ? action.question
        : action?.type === 'explain'
          ? action.text
          : response.narration;
    this.store.addChat({
      role: 'assistant',
      text: text || '',
      error: response.error,
      verification: response.verification,
      rerollContext: response.rerollContext,
      actionType: action?.type,
    });
  }

  private applyAction(response: AiResponse): void {
    const action = response.action;
    if (!action) return;

    switch (action.type) {
      case 'replaceSource':
        this.store.replaceSource(action.scad);
        if (response.verification?.status === 'failed') {
          toast('已写入源码，但真实引擎验证未通过；可点「重抽」', 'error');
        } else {
          toast('已写入源码并重新编译');
        }
        break;
      case 'updateParams':
        for (const [name, value] of Object.entries(action.values)) this.store.setParam(name, value);
        toast('参数已更新');
        break;
      case 'batchVariants':
        this.openBatchVariants(action.variants);
        break;
      case 'explain':
      case 'clarify':
        break;
      default:
        break;
    }
  }

  private openBatchVariants(variants: Array<Record<string, string | number | boolean>>): void {
    if (variants.length === 0) return;
    const state = this.store.state;
    openBatchModal({
      source: state.project.source,
      params: state.params,
      currentValues: state.project.paramValues,
      variants,
      onApply: (values) => {
        for (const [name, value] of Object.entries(values)) this.store.setParam(name, value);
        toast('已应用该组参数');
      },
    });
  }

  private handleReroll(entry: ChatEntry): void {
    if (!entry.rerollContext) return;
    void this.runAi(entry.rerollContext.userMessage, entry.rerollContext);
  }

  private openSettings(): void {
    openSettingsModal(
      this.config,
      (cfg) => {
        this.config = cfg;
        saveConfig(cfg);
        toast('设置已保存');
        this.onState(this.store.state);
      },
      () => this.store.compileNow()
    );
  }

  private openExamples(): void {
    openExamplesModal((example) => this.loadExample(example));
  }

  private loadExample(example: (typeof EXAMPLES)[number]): void {
    this.store.replaceSource(example.code);
    this.store.addChat({ role: 'system', text: `已载入范例：${example.name}` });
    toast(`已载入「${example.name}」`);
  }

  private openProjects(): void {
    openProjectsModal(this.store.state.project, (project) => {
      this.store.loadProject(project);
      this.lastOutput = null;
      this.viewer.clearModel();
      toast(`已打开「${project.name}」`);
    });
  }

  private saveCurrent(): void {
    saveProject(this.store.state.project);
    toast('项目已保存到本机');
  }

  private newProject(): void {
    if (this.store.state.project.source.trim() && !window.confirm('新建项目会清空当前编辑内容，继续？')) {
      return;
    }
    this.store.newProject();
    this.lastOutput = null;
    this.viewer.clearModel();
    this.editor.setSource('');
    toast('已新建项目');
  }

  private exportStl(): void {
    const output = this.store.state.compile?.ok ? this.store.state.compile.output : undefined;
    if (!output) {
      toast('当前没有可导出的 STL，请先编译成功', 'error');
      return;
    }
    downloadArrayBuffer(output, `${safeName(this.store.state.project.name)}.stl`, 'model/stl');
    toast('STL 已开始下载');
  }

  private async export3mf(): Promise<void> {
    const { source, paramValues, name } = this.store.state.project;
    if (!source.trim()) {
      toast('当前没有模型', 'error');
      return;
    }
    toast('正在编译 3MF…');
    try {
      const font = getCjkFont();
      const result = await compile({
        source,
        defines: paramValues,
        format: '3mf',
        timeoutMs: 25_000,
        fonts: font ? [{ name: font.name, data: font.data }] : undefined,
      });
      if (!result.ok || !result.output) {
        toast(result.messages.find((m) => m.level === 'error')?.text ?? '3MF 导出失败', 'error');
        return;
      }
      downloadArrayBuffer(result.output, `${safeName(name)}.3mf`, 'model/3mf');
      toast('3MF 已开始下载');
    } catch (e) {
      toast(e instanceof Error ? e.message : '3MF 导出失败', 'error');
    }
  }

  private exportScad(): void {
    const { source, paramValues, name } = this.store.state.project;
    if (!source.trim()) {
      toast('当前没有源码', 'error');
      return;
    }
    const baked = injectParams(source, paramValues);
    downloadBlob(new Blob([baked], { type: 'text/plain' }), `${safeName(name)}.scad`);
    toast('SCAD 已开始下载');
  }

  private async saveScreenshot(): Promise<void> {
    if (!this.viewer.hasModel()) {
      toast('当前没有模型', 'error');
      return;
    }
    const dataUrl = this.viewer.screenshot();
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    downloadBlob(blob, `${safeName(this.store.state.project.name)}.png`);
    toast('截图已开始下载');
  }

  private toggleWireframe(): void {
    this.wireframe = !this.wireframe;
    this.viewer.setWireframe(this.wireframe);
  }

  private toggleMenu(): void {
    this.exportMenu.style.display = this.exportMenu.style.display === 'none' ? '' : 'none';
  }

  private setView(view: ViewName): void {
    this.viewer.setView(view);
  }

  // 供 viewButton 闭包使用
  private viewButton(label: string, view: ViewName): HTMLButtonElement {
    return button(label, '', () => this.setView(view));
  }
}

function menuItem(label: string, onClick: () => void): HTMLButtonElement {
  return button(label, '', onClick);
}
