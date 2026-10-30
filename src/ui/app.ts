/**
 * 应用主控制器：布局、状态同步、AI 调用、导出与侧栏。
 */

import '../styles/app.css';
import type { AiRequest, AiResponse, RerollContext } from '../core/types.js';
import { EXAMPLES } from '../core/examples.js';
import { injectParams } from '../core/scad-parser.js';
import { chat } from '../ai/pipeline.js';
import { verifyScad } from '../ai/verify.js';
import { loadConfig, saveConfig } from '../ai/config.js';
import { PROVIDERS, isMultimodal, type WebModelConfig } from '../ai/providers.js';
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
import { logger } from '../core/logger.js';
import { autoNameSource, pushHistory } from '../storage/history.js';
import { APP_AUTHOR, APP_VERSION, REPO_URL } from '../version.js';
import { Viewer, type ViewName } from '../viewer/viewer.js';
import { CodeEditor } from '../editor/editor.js';
import { ChatPanel } from './chat.js';
import { ParamPanel } from './params.js';
import { button, el, clear } from './dom.js';
import { openSettingsPanel } from './settings.js';
import { openExamplesPanel } from './examples.js';
import { openProjectsPanel } from './projects.js';
import { openBatchPanel } from './batch.js';
import { openHistoryPanel } from './history.js';
import { openImageImportPanel } from './image-import.js';
import { openLogsPanel } from './logs.js';
import { openAboutPanel } from './about.js';
import { openPartsPanel } from './parts.js';
import { splitMeshParts } from '../core/mesh-parts.js';
import { toast, confirmBar } from './toast.js';

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
  private readonly codePane: HTMLElement;
  private readonly viewerEl: HTMLElement;
  private readonly codeStatus: HTMLElement;
  private readonly codeLog: HTMLElement;
  private readonly previewTab: HTMLButtonElement;
  private readonly codeTab: HTMLButtonElement;

  private config: WebModelConfig | null = loadConfig();
  private lastOutput: ArrayBuffer | null = null;
  private wireframe = false;
  private codeWasOpen = false;
  private readonly chatImages = new Map<string, string[]>();

  constructor(root: HTMLElement) {
    root.replaceChildren();
    root.className = 'app';

    // ---------- topbar（macOS 风格：左侧菜单 / 居中标题 / 右侧状态） ----------
    this.projectName = el('input', 'project-name');
    this.projectName.value = this.store.state.project.name;
    // change 已覆盖 Enter 与失焦两种提交，blur 会造成双重 rename
    this.projectName.addEventListener('change', () => this.store.renameProject(this.projectName.value));

    this.statusBadge = el('span', 'badge', ['等待生成']);
    this.configBadge = el('button', 'badge err', ['未配置模型']);
    this.configBadge.type = 'button';
    this.configBadge.addEventListener('click', () => this.openSettings());

    const brandIcon = el('img', 'brand-mark', []);
    brandIcon.src = './icon.svg';
    brandIcon.alt = '';

    const menuBar = el('div', 'menubar', [
      buildMenu('文件', [
        { label: '新建项目', action: () => this.newProject() },
        { label: '打开…', action: () => this.openProjects() },
        { label: '从图片生成像素画…', action: () => this.openImageImport() },
        { label: '保存项目', action: () => this.saveCurrent() },
        { label: '保存当前版本到历史', action: () => this.snapshotCurrent() },
        { label: '历史版本…', action: () => this.openHistory() },
        'divider',
        { label: '导出 STL', action: () => this.exportStl() },
        { label: '分件导出…', action: () => this.openPartsExport() },
        { label: '导出 3MF', action: () => void this.export3mf() },
        { label: '导出 .scad（含当前参数）', action: () => this.exportScad() },
        { label: '导出项目 JSON', action: () => downloadProjectJson(this.store.state.project) },
      ]),
      buildMenu('视图', [
        { label: '3D 预览', action: () => this.store.setCodeOpen(false) },
        { label: '源代码', action: () => this.store.setCodeOpen(true) },
        'divider',
        { label: '重新编译', action: () => this.store.compileNow() },
        { label: '线框', action: () => this.toggleWireframe() },
        { label: '截图', action: () => void this.saveScreenshot() },
      ]),
      buildMenu('帮助', [
        { label: '运行日志', action: () => openLogsPanel() },
        { label: '关于', action: () => openAboutPanel() },
      ]),
    ]);

    const langBtn = button(langToggleLabel(), 'btn', () => toggleLang());
    langBtn.setAttribute('data-lang-toggle', '');
    langBtn.setAttribute('data-i18n-skip', '');

    const topbar = el('div', 'topbar', [
      el('div', 'brand', [brandIcon, el('span', 'brand-name', ['AI 参数化模型'])]),
      menuBar,
      el('div', 'topbar-center', [this.projectName]),
      el('div', 'topbar-group', [
        this.configBadge,
        this.statusBadge,
        langBtn,
        iconButton('gear', '设置', () => this.openSettings()),
      ]),
    ]);

    // ---------- ribbon：常驻工具栏（Office 式，常用操作单击可达） ----------
    const ribbon = el('div', 'ribbon', [
      el('div', 'ribbon-group', [
        ribbonButton('新建', '新建项目', () => this.newProject()),
        ribbonButton('打开', '打开已保存的项目（Ctrl/⌘ + O）', () => this.openProjects()),
        ribbonButton('保存', '保存项目（Ctrl/⌘ + S）', () => this.saveCurrent()),
        ribbonButton('历史', '历史版本', () => this.openHistory()),
        ribbonButton('快照', '保存当前版本到历史', () => this.snapshotCurrent()),
      ]),
      el('span', 'ribbon-sep'),
      el('div', 'ribbon-group', [
        ribbonButton('图片转像素画', '从图片生成像素画', () => this.openImageImport()),
      ]),
      el('span', 'ribbon-sep'),
      el('div', 'ribbon-group', [
        ribbonButton('导出 STL', '导出 STL', () => this.exportStl(), true),
        ribbonButton('分件导出', '按零件导出 STL（装配体）', () => this.openPartsExport()),
        ribbonButton('3MF', '导出 3MF', () => void this.export3mf()),
        ribbonButton('SCAD', '导出 .scad（含当前参数）', () => this.exportScad()),
        ribbonButton('JSON', '导出项目 JSON', () => downloadProjectJson(this.store.state.project)),
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
    this.viewerEl = el('div', 'viewer', [viewerCanvas, toolbar, this.dimensions, this.emptyOverlay]);

    // ---------- center tabs + code pane ----------
    this.codeStatus = el('span', 'badge', ['']);
    const codeEditorEl = el('div', 'code-editor');
    this.codeLog = el('div', 'code-log');
    this.codePane = el('div', 'code-pane hidden', [
      el('div', 'code-head', [
        el('span', 'panel-title', ['SCAD 源码']),
        this.codeStatus,
        el('span', 'spacer'),
        el('span', 'code-hint', ['可直接编辑，Ctrl/⌘ + S 保存项目']),
      ]),
      codeEditorEl,
      this.codeLog,
    ]);

    this.previewTab = this.centerTab('3D 预览', false);
    this.codeTab = this.centerTab('源代码', true);
    const center = el('div', 'center', [
      el('div', 'center-tabs', [this.previewTab, this.codeTab]),
      this.viewerEl,
      this.codePane,
    ]);

    // ---------- panels ----------
    const left = el('div', 'panel panel-left');
    const right = el('div', 'panel panel-right');

    const main = el('div', 'main', [left, center, right]);
    const repoLink = el('a', 'statusbar-link', ['GitHub']);
    repoLink.href = REPO_URL;
    repoLink.target = '_blank';
    repoLink.rel = 'noreferrer noopener';
    repoLink.title = REPO_URL;

    const footer = el('div', 'statusbar', [
      el('span', '', [`AI 参数化模型 v${APP_VERSION}`]),
      el('span', 'spacer'),
      el('span', '', [`开发者 ${APP_AUTHOR} · GPL-2.0`]),
      el('span', 'statusbar-sep', ['·']),
      repoLink,
    ]);
    root.append(el('div', 'header', [topbar, ribbon]), main, footer);

    // 快捷键：Ctrl/Cmd + S 保存项目，Ctrl/Cmd + O 打开项目
    document.addEventListener('keydown', (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        this.saveCurrent();
      } else if (key === 'o') {
        event.preventDefault();
        this.openProjects();
      }
    });

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
      onSend: (text, images, thumbs) => this.handleSend(text, images, thumbs),
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
        text: '尚未配置模型：点右上角齿轮「设置」填入 Provider / 模型 / API Key。纯静态网页，Key 只存在本机浏览器。',
      });
    }

    logger.info('app', '应用启动', `v${APP_VERSION} · ${APP_AUTHOR}`);
  }

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
    this.updateCenterView(state);
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

  private updateCenterView(state: AppState): void {
    this.previewTab.classList.toggle('active', !state.codeOpen);
    this.codeTab.classList.toggle('active', state.codeOpen);
    this.codePane.classList.toggle('hidden', !state.codeOpen);
    this.viewerEl.classList.toggle('pane-hidden', state.codeOpen);
    // 源码页签遮挡预览时暂停 rAF 渲染循环，省电省 GPU
    this.viewer.setVisible(!state.codeOpen);
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

  private handleSend(text: string, images: string[], thumbs: string[]): boolean {
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
    if (images.length > 0 && !isMultimodal(this.config)) {
      toast('当前模型不支持图片输入，图片不会被读取；请换用 Claude / GPT-4o / GLM-4V 等视觉模型', 'error');
    }
    void this.runAi(text, undefined, images, thumbs);
    return true;
  }

  private async runAi(
    userMessage: string,
    reroll?: RerollContext,
    images: string[] = [],
    thumbs: string[] = []
  ): Promise<void> {
    if (!this.config) return;
    const started = performance.now();
    logger.info(
      'ai',
      reroll ? '按验证反馈重抽' : 'AI 生成请求',
      `${this.config.provider}/${this.config.model} · ${userMessage.length} 字符 · ${images.length} 张图`
    );
    const history = this.store.aiHistory();
    if (reroll) {
      this.store.addChat({ role: 'system', text: '按验证反馈重抽…' });
    } else {
      const entryId = this.store.addChat({ role: 'user', text: userMessage, images: thumbs });
      if (images.length > 0) {
        // 原图按聊天条目 id 缓存，供"重抽"复用；只留最近 10 条，避免大图常驻内存
        this.chatImages.set(entryId, images);
        while (this.chatImages.size > 10) {
          const oldest = this.chatImages.keys().next().value;
          if (oldest === undefined) break;
          this.chatImages.delete(oldest);
        }
      }
    }
    this.store.setAiBusy(true);
    // 代际守卫：await 期间新建/载入项目后，响应不能写进新项目（与编译的 generation 机制对等）
    const projectId = this.store.state.project.id;

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
        images,
        history,
        rerollContext: reroll,
      };
      const response = await chat(request, this.config, (candidate, values, specs) =>
        verifyScad(candidate, values, { screenshot: true, partSpec: specs })
      );
      logger.info(
        'ai',
        'AI 响应完成',
        `${response.action?.type ?? 'error'} · ${Math.round(performance.now() - started)} ms · ` +
          `${response.verification?.status ?? '未验证'}`
      );
      if (this.store.state.project.id !== projectId) {
        logger.warn('ai', 'AI 响应已丢弃', '生成期间切换了项目');
        return;
      }
      this.appendAiResponse(response);
      this.applyAction(response);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error('ai', 'AI 调用失败', message);
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
      case 'replaceSource': {
        this.store.replaceSource(action.scad);
        const snapshot = pushHistory({
          source: action.scad,
          paramValues: this.store.state.project.paramValues,
          action: 'ai',
          name: autoNameSource(action.scad, action.design_plan || response.narration),
          note: response.narration,
        });
        if (snapshot) logger.info('history', `自动保存历史版本「${snapshot.name}」`);
        if (response.verification?.status === 'failed') {
          toast('已写入源码，但真实引擎验证未通过；可点「重抽」', 'error');
        } else {
          toast('已写入源码并重新编译');
        }
        break;
      }
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
    openBatchPanel({
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
    if (this.store.state.aiBusy) return;
    if (!entry.rerollContext) return;
    // 原图缓存在发起请求的那条 user 消息的 id 上（取最近的同文本 user 条目）
    const userMessage = entry.rerollContext.userMessage;
    const userEntry = [...this.store.state.project.chat]
      .reverse()
      .find((m) => m.role === 'user' && m.text === userMessage);
    const images = userEntry ? (this.chatImages.get(userEntry.id) ?? []) : [];
    void this.runAi(userMessage, entry.rerollContext, images);
  }

  private openSettings(): void {
    openSettingsPanel(
      this.config,
      (cfg) => {
        this.config = cfg;
        saveConfig(cfg);
        logger.info('settings', '保存模型设置', `${cfg.provider}/${cfg.model}`);
        toast('设置已保存');
        this.onState(this.store.state);
      },
      () => this.store.compileNow()
    );
  }

  private openExamples(): void {
    openExamplesPanel((example) => this.loadExample(example));
  }

  private loadExample(example: (typeof EXAMPLES)[number]): void {
    this.store.replaceSource(example.code);
    const snapshot = pushHistory({
      source: example.code,
      paramValues: this.store.state.project.paramValues,
      action: 'example',
      name: example.name,
      note: example.applies,
    });
    if (snapshot) logger.info('history', `自动保存范例「${snapshot.name}」`);
    this.store.addChat({ role: 'system', text: `已载入范例：${example.name}` });
    toast(`已载入「${example.name}」`);
  }

  private openProjects(): void {
    // 传 getter 而不是快照：抽屉打开期间继续编辑时，保存/导出必须取最新项目
    openProjectsPanel(
      () => this.store.state.project,
      (project) => {
        this.store.loadProject(project);
        this.lastOutput = null;
        this.viewer.clearModel();
        toast(`已打开「${project.name}」`);
      }
    );
  }

  private saveCurrent(): void {
    const project = this.store.state.project;
    saveProject(project);
    const snapshot = pushHistory({
      source: project.source,
      paramValues: project.paramValues,
      action: 'project',
      name: project.name === '未命名项目' ? undefined : project.name,
    });
    if (snapshot) logger.info('history', `保存项目时自动快照「${snapshot.name}」`);
    logger.info('project', '保存项目', project.name);
    toast('项目已保存到本机');
  }

  private snapshotCurrent(): void {
    const project = this.store.state.project;
    if (!project.source.trim()) {
      toast('当前没有源码', 'error');
      return;
    }
    const snapshot = pushHistory({
      source: project.source,
      paramValues: project.paramValues,
      action: 'manual',
      name: project.name === '未命名项目' ? undefined : project.name,
    });
    if (snapshot) {
      logger.info('history', `手动保存历史版本「${snapshot.name}」`);
      toast(`已保存历史版本「${snapshot.name}」`);
    } else {
      toast('当前代码已在历史中');
    }
  }

  private openImageImport(): void {
    openImageImportPanel((scad, note) => {
      this.store.replaceSource(scad);
      const snapshot = pushHistory({
        source: scad,
        paramValues: this.store.state.project.paramValues,
        action: 'image',
        name: note,
        note: '由图片降采样生成',
      });
      if (snapshot) logger.info('history', `自动保存图片像素画「${snapshot.name}」`);
      this.store.addChat({ role: 'system', text: `已从图片生成像素画：${note}` });
      toast('已生成像素画源码');
    });
  }

  private openHistory(): void {
    openHistoryPanel((source, values) => {
      this.store.restoreSnapshot(source, values);
      this.lastOutput = null;
      this.viewer.clearModel();
    });
  }

  private newProject(): void {
    if (this.store.state.project.source.trim()) {
      confirmBar('新建项目会清空当前编辑内容，继续？', () => this.resetProject());
      return;
    }
    this.resetProject();
  }

  private resetProject(): void {
    this.store.newProject();
    this.lastOutput = null;
    this.viewer.clearModel();
    this.editor.setSource('');
    logger.info('project', '新建项目');
    toast('已新建项目');
  }

  private exportStl(): void {
    const output = this.store.state.compile?.ok ? this.store.state.compile.output : undefined;
    if (!output) {
      toast('当前没有可导出的 STL，请先编译成功', 'error');
      return;
    }
    const filename = `${safeName(this.store.state.project.name)}.stl`;
    downloadArrayBuffer(output, filename, 'model/stl');
    logger.info('export', '导出 STL', filename);
    toast('STL 已开始下载');
  }

  private openPartsExport(): void {
    const output = this.store.state.compile?.ok ? this.store.state.compile.output : undefined;
    if (!output) {
      toast('当前没有可导出的网格，请先编译成功', 'error');
      return;
    }
    const split = splitMeshParts(output);
    if (!split) {
      toast('网格超过 30 万三角形或不是二进制 STL，无法分件', 'error');
      return;
    }
    logger.info('export', '分件导出', `${split.parts.length} 件`);
    openPartsPanel({
      parts: split.parts,
      stls: split.stls,
      baseName: safeName(this.store.state.project.name),
    });
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
      const filename = `${safeName(name)}.3mf`;
      downloadArrayBuffer(result.output, filename, 'model/3mf');
      logger.info('export', '导出 3MF', filename);
      toast('3MF 已开始下载');
    } catch (e) {
      const message = e instanceof Error ? e.message : '3MF 导出失败';
      logger.error('export', '3MF 导出失败', message);
      toast(message, 'error');
    }
  }

  private exportScad(): void {
    const { source, paramValues, name } = this.store.state.project;
    if (!source.trim()) {
      toast('当前没有源码', 'error');
      return;
    }
    const baked = injectParams(source, paramValues);
    const filename = `${safeName(name)}.scad`;
    downloadBlob(new Blob([baked], { type: 'text/plain' }), filename);
    logger.info('export', '导出 SCAD', filename);
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
    const filename = `${safeName(this.store.state.project.name)}.png`;
    downloadBlob(blob, filename);
    logger.info('export', '导出截图', filename);
    toast('截图已开始下载');
  }

  private toggleWireframe(): void {
    this.wireframe = !this.wireframe;
    this.viewer.setWireframe(this.wireframe);
  }

  private centerTab(label: string, code: boolean): HTMLButtonElement {
    const tab = button(label, 'center-tab', () => this.store.setCodeOpen(code));
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    return tab;
  }

  private setView(view: ViewName): void {
    this.viewer.setView(view);
  }

  // 供 viewButton 闭包使用
  private viewButton(label: string, view: ViewName): HTMLButtonElement {
    return button(label, '', () => this.setView(view));
  }
}

type MenuItem = { label: string; action: () => void } | 'divider';

/** 工具栏按钮：短标签 + tooltip，primary 用主色（导出 STL）。 */
function ribbonButton(label: string, title: string, onClick: () => void, primary = false): HTMLButtonElement {
  const b = button(label, primary ? 'btn btn-sm' : 'btn btn-sm btn-ghost', onClick);
  b.title = title;
  return b;
}

function buildMenu(label: string, items: MenuItem[]): HTMLElement {
  const menu = el('div', 'menu');
  menu.style.display = 'none';
  const trigger = button(label, 'menu-trigger', () => {
    const isOpen = menu.style.display !== 'none';
    closeMenus();
    menu.style.display = isOpen ? 'none' : '';
  });

  for (const item of items) {
    if (item === 'divider') {
      menu.appendChild(el('div', 'menu-divider'));
      continue;
    }
    menu.appendChild(
      button(item.label, '', () => {
        closeMenus();
        item.action();
      })
    );
  }
  return el('div', 'menu-wrap', [trigger, menu]);
}

function closeMenus(): void {
  for (const menu of document.querySelectorAll<HTMLElement>('.menu')) menu.style.display = 'none';
}

document.addEventListener('click', (event) => {
  if (!(event.target as Element).closest('.menu-wrap')) closeMenus();
});

const GEAR_ICON =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="3.2"/>' +
  '<path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 ' +
  '1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06' +
  'a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09' +
  'A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9' +
  'a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06' +
  'a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09' +
  'a1.7 1.7 0 0 0-1.51 1.03Z"/></svg>';

function iconButton(_kind: 'gear', label: string, onClick: () => void): HTMLButtonElement {
  const btn = button('', 'btn btn-icon', onClick);
  btn.innerHTML = GEAR_ICON;
  btn.type = 'button';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  return btn;
}
