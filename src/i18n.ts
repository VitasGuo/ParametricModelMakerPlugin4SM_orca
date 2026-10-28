/**
 * Lightweight DOM i18n (zh ↔ en) without a UI framework.
 *
 * The UI is authored in Chinese. On English mode we translate existing text
 * nodes/attributes and observe future DOM changes. Original Chinese strings are
 * kept in WeakMaps so switching back restores them without reloading (and thus
 * without losing the current project / compile state).
 */

export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'model-lab-web:lang';

const en: Record<string, string> = {
  // topbar / common
  'AI 参数化模型': 'AI Parametric Model',
  新建: 'New',
  打开: 'Open',
  保存: 'Save',
  导出: 'Export',
  '导出 STL': 'Export STL',
  '导出 3MF': 'Export 3MF',
  '导出 .scad（含当前参数）': 'Export .scad (with current params)',
  '导出项目 JSON': 'Export project JSON',
  范例: 'Examples',
  设置: 'Settings',
  代码: 'Code',
  关闭: 'Close',
  取消: 'Cancel',
  重新编译: 'Recompile',
  线框: 'Wireframe',
  截图: 'Screenshot',
  正: 'Front',
  顶: 'Top',
  右: 'Right',
  参数: 'Parameters',
  重置为源码默认值: 'Reset to source defaults',
  等待生成: 'Ready',
  未配置模型: 'Not configured',
  需代理: 'Proxy required',
  '编译中…': 'Compiling…',
  编译失败: 'Compile failed',
  等待编译: 'Waiting',
  '编译成功，无警告。': 'Compiled with no warnings.',
  浏览全部范例: 'Browse all examples',
  '用一句话生成可打印的模型': 'Generate a printable model in one sentence',
  '直接告诉 AI 你想要什么，或从范例开始改。所有模型在浏览器内用 OpenSCAD 编译，导出 STL / 3MF。':
    'Tell AI what you want, or start from an example. Models are compiled in your browser with OpenSCAD and exported as STL / 3MF.',

  // chat
  'AI 建模助手': 'AI Modeling Assistant',
  清空: 'Clear',
  发送: 'Send',
  '思考中…': 'Thinking…',
  'Enter 发送 · Shift+Enter 换行': 'Enter to send · Shift+Enter for newline',
  '描述你想要的模型，或说「再大一点」「碗口做成花瓣形」…':
    'Describe the model you want, or say “make it bigger”…',
  '告诉我你想要什么，例如「做一个仿瓷器的高足碗」，或先从范例库挑一个改。':
    'Tell me what you want, e.g. “make a porcelain-style high-foot bowl”, or start from an example.',
  '先改右侧参数看效果，或在左侧直接说想要什么模型，例如「做一个仿瓷器的高足碗」。':
    'Adjust the parameters on the right, or just describe the model you want on the left, e.g. “make a porcelain-style high-foot bowl”.',
  验证通过: 'Passed',
  验证未通过: 'Failed verification',
  '未验证（跳过）': 'Not verified (skipped)',
  重抽: 'Retry',
  '按验证反馈重抽…': 'Retrying with verification feedback…',

  // params
  '当前源码没有 Customizer 参数。': 'No Customizer parameters in the current source.',
  '在源码里写 `/* [分组] */` 和 `name = 10; // [1:100]` 注释，参数面板会自动生成滑杆。':
    'Add `/* [Group] */` and `name = 10; // [1:100]` comments to generate controls automatically.',
  '#RRGGBB 或 red': '#RRGGBB or red',
  '字体名，如 Liberation Sans': 'Font name, e.g. Liberation Sans',

  // examples
  建模范例库: 'Example Library',
  '搜索名称、用途、思路…': 'Search name, use, idea…',
  全部: 'All',
  复制代码: 'Copy code',
  载入: 'Load',
  '没有匹配的范例。': 'No matching examples.',
  代码已复制: 'Code copied',
  复制失败: 'Copy failed',
  简单: 'Basic',
  经典: 'Classic',
  进阶: 'Advanced',
  轴对称容器: 'Axisymmetric containers',
  平滑曲线容器: 'Smooth curved containers',
  '2D 形状容器': '2D shape containers',
  '方盒/箱子': 'Boxes',
  '多格/阵列': 'Grids / arrays',
  带盖容器: 'Containers with lids',
  文字铭牌: 'Text plaques',
  球形物体: 'Spheres',
  螺纹件: 'Threaded parts',
  有机形状: 'Organic shapes',
  '山形/景观': 'Mountains / landscapes',
  '水波/波浪': 'Waves',
  瓶罐类: 'Bottles / jars',
  杯壶类: 'Cups / mugs',
  圆角方盒: 'Rounded boxes',
  堆叠收纳: 'Stackable storage',
  花盆园艺: 'Planters',
  斜面支撑: 'Stands',
  分格收纳: 'Compartment storage',
  沥水用品: 'Drainers',
  数学曲线: 'Mathematical curves',
  建筑营造: 'Architecture',
  艺术风格: 'Art styles',

  // projects
  项目: 'Projects',
  保存当前项目: 'Save current project',
  '导入项目 JSON': 'Import project JSON',
  '还没有保存的项目。点上方"保存当前项目"即可。':
    'No saved projects yet. Click “Save current project” above.',
  删除: 'Delete',
  项目已保存到本机: 'Project saved locally',
  导入失败: 'Import failed',

  // batch
  批量变体: 'Batch variants',
  '正在用真实引擎并行编译各组变体…': 'Compiling variants with the real engine…',
  变体: 'Variant',
  应用此组: 'Apply this set',
  '导出全部 STL': 'Export all STL',
  没有可导出的变体: 'No variants to export',

  // settings
  模型设置: 'Model Settings',
  保存设置: 'Save settings',
  '显示 Key': 'Show key',
  模型: 'Model',
  '默认使用官方地址': 'Use official endpoint',
  '模型名，如 deepseek-chat': 'Model name, e.g. deepseek-chat',
  'https://你的代理.workers.dev': 'https://your-proxy.workers.dev',
  'none（推荐，结构化输出更快）': 'none (recommended, faster structured output)',
  '思考力度（SenseNova）': 'Reasoning effort (SenseNova)',
  '视觉模型名': 'Vision model name',
  '视觉模型 API Key': 'Vision API key',
  '视觉 API Key': 'Vision API key',
  '留空则复用主模型 Key（同 provider 时）':
    'Leave empty to reuse the main key (same provider)',
  可选: 'Optional',
  '视觉 Provider': 'Vision Provider',
  '视觉模型': 'Vision Model',
  '视觉 Base URL': 'Vision Base URL',
  'Base URL（可选）': 'Base URL (optional)',
  'API Key 以明文保存在本机浏览器的 localStorage，只会发送给你选择的 provider；本应用没有后端。本机泄露风险由你自行承担。':
    'The API key is stored in plain text in this browser’s localStorage and is only sent to your chosen provider. This app has no backend; local exposure risk is yours to accept.',
  '启用视觉子模型（把三视图描述成文本，提升形状审核准确率）':
    'Enable vision sub-model (describe the three views for better shape review)',
  '中文字体（可选）': 'CJK font (optional)',
  移除字体: 'Remove font',
  选择字体文件: 'Choose font file',
  '中文 text()：OpenSCAD 内置字体不含 CJK。上传系统字体（如 simhei.ttf / msyh.ttc）后，在源码里用 font="SimHei" 引用。字体文件只存在本机 IndexedDB。':
    'Chinese text(): bundled fonts have no CJK. Upload a system font (simhei.ttf / msyh.ttc) and reference it with font="SimHei". The file stays in local IndexedDB.',
  '当前没有加载中文字体（text() 只能显示拉丁字符）':
    'No CJK font loaded (text() only renders Latin characters)',
  'API 代理地址（可选）': 'API proxy URL (optional)',
  '填写后所有 provider 请求都经此代理转发；仓库附带 Cloudflare Worker 模板':
    'When set, all provider requests go through this proxy (Cloudflare Worker template included)',
  '该 provider 支持浏览器直连（或由你自己的端点放行 CORS）。':
    'This provider supports direct browser access (or your endpoint allows CORS).',
  '浏览器直连该 provider 会因 CORS 失败。请填写代理地址，或改用 OpenRouter / DeepSeek / Kimi / MiniMax / Anthropic。':
    'Direct browser access is blocked by CORS. Set a proxy URL, or use OpenRouter / DeepSeek / Kimi / MiniMax / Anthropic.',
  '自定义 provider 需要填写 Base URL。': 'Custom provider requires a Base URL.',
  '自定义 provider 需要填写 Base URL': 'Custom provider requires a Base URL',
  '请填写模型名': 'Please enter a model name',
  '视觉子模型需要模型名和 API Key': 'Vision sub-model needs a model name and API key',
  设置已保存: 'Settings saved',
  中文字体已移除: 'CJK font removed',
  '先配置模型和 API Key': 'Configure a model and API key first',
  当前没有模型: 'No model available',
  当前没有源码: 'No source available',
  '当前没有可导出的 STL，请先编译成功': 'No STL to export; compile successfully first',
  'STL 已开始下载': 'STL download started',
  '3MF 已开始下载': '3MF download started',
  'SCAD 已开始下载': 'SCAD download started',
  '截图已开始下载': 'Screenshot download started',
  '正在编译 3MF…': 'Compiling 3MF…',
  '3MF 导出失败': '3MF export failed',
  参数已更新: 'Parameters updated',
  已应用该组参数: 'Applied this parameter set',
  已写入源码并重新编译: 'Source applied and recompiled',
  '已写入源码，但真实引擎验证未通过；可点「重抽」':
    'Source applied, but real-engine verification failed. Use “Retry”.',
  已新建项目: 'New project created',
  '新建项目会清空当前编辑内容，继续？': 'Create a new project and clear the current content?',
  '尚未配置模型：点右上角「设置」填入 Provider / 模型 / API Key。纯静态网页，Key 只存在本机浏览器。':
    'No model configured: open “Settings” (top right) and enter Provider / Model / API Key. This is a static page; the key stays in your browser.',

  // provider labels
  '商汤 SenseNova': 'SenseNova',
  '智谱 GLM': 'Zhipu GLM',
  '自定义 OpenAI 兼容端点': 'Custom OpenAI-compatible endpoint',

  // provider notes
  '国内直连，纯文本，价格低': 'Direct in China, text-only, low cost',
  '一个 Key 聚合多家模型，含视觉模型；适合作为通用入口':
    'One key for many models including vision; good general entry',
  '国内直连': 'Direct in China',
  '浏览器直连需 anthropic-dangerous-direct-browser-access 头（已自动添加）':
    'Browser access needs the anthropic-dangerous-direct-browser-access header (added automatically)',
  '官方 API 不建议浏览器直连；请填写代理地址，或改用 OpenRouter':
    'Official API discourages browser access; set a proxy URL or use OpenRouter',
  '预检 CORS 不通过，浏览器直连会失败；请填写代理地址，或改用 OpenRouter':
    'CORS preflight fails; set a proxy URL or use OpenRouter',
  '预检 CORS 不通过，浏览器直连会失败；请填写代理地址':
    'CORS preflight fails; set a proxy URL',
  'Ollama / LM Studio / vLLM 等；需自行确认端点允许 CORS':
    'Ollama / LM Studio / vLLM etc.; make sure the endpoint allows CORS',
  模型名: 'Model name',
  自定义: 'Custom',
};

const patterns: Array<[RegExp, string]> = [
  [/^已载入「(.+)」$/, 'Loaded “$1”'],
  [/^已载入范例：(.+)$/, 'Loaded example: $1'],
  [/^已打开「(.+)」$/, 'Opened “$1”'],
  [/^已导入「(.+)」$/, 'Imported “$1”'],
  [/^字体已保存：(.+)$/, 'Font saved: $1'],
  [/^当前字体：(.+)$/, 'Current font: $1'],
  [/^删除项目「(.+)」？$/, 'Delete project “$1”?'],
  [/^已导出 (\d+) 个 STL$/, 'Exported $1 STLs'],
  [/^批量变体（(\d+) 组）$/, 'Batch variants ($1)'],
  [/^变体 (\d+)$/, 'Variant $1'],
  [/^正在编译 (\d+) 组变体…$/, 'Compiling $1 variants…'],
  [/^编译成功 (\d+) ms$/, 'Compiled in $1 ms'],
  [/^(.*) · (\d+) 面$/, '$1 · $2 faces'],
  [/^\[第 (\d+) 行\] /, 'Line $1: '],
  [/^(\d+) 字符$/, '$1 chars'],
  [/^验证通过([\s\S]*)$/, 'Passed$1'],
  [/^验证未通过([\s\S]*)$/, 'Failed verification$1'],
  [/^未验证（跳过）([\s\S]*)$/, 'Not verified (skipped)$1'],
  [/^(.+) 在浏览器里需要代理；请填写代理地址，或改用 OpenRouter$/,
    '$1 needs a browser proxy; set a proxy URL or use OpenRouter'],
];

let lang: Lang = detectLang();
let translating = false;

const textOriginals = new WeakMap<Text, string>();
const attrOriginals = new WeakMap<Element, Record<string, string>>();
const selfWrites = new WeakSet<Node>();

export function getLang(): Lang {
  return lang;
}

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // ignore
  }
  const query = new URLSearchParams(window.location.search).get('locale') ?? '';
  if (/^zh/i.test(query)) return 'zh';
  if (/^en/i.test(query)) return 'en';
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function toggleLang(): void {
  lang = lang === 'zh' ? 'en' : 'zh';
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  applyTranslations();
  updateLangToggles();
}

export function langToggleLabel(): string {
  return lang === 'zh' ? 'EN' : '中文';
}

export function setupI18n(): void {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  applyTranslations();
  updateLangToggles();
  const observer = new MutationObserver((records) => {
    if (translating) return;
    for (const record of records) {
      if (record.type === 'characterData') {
        const node = record.target as Text;
        if (selfWrites.has(node)) {
          selfWrites.delete(node);
          continue;
        }
        textOriginals.set(node, node.data);
        translateText(node);
      } else if (record.type === 'childList') {
        for (const node of Array.from(record.addedNodes)) {
          if (node instanceof Text) {
            textOriginals.set(node, node.data);
            translateText(node);
          } else if (node instanceof Element) {
            translateTree(node);
          }
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function applyTranslations(): void {
  translating = true;
  try {
    translateTree(document.body);
    updateLangToggles();
  } finally {
    translating = false;
  }
}

function translateTree(root: Element): void {
  if (root.matches('[data-i18n-skip]')) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text) translateText(node);
    node = walker.nextNode();
  }
  const elements = root.querySelectorAll('*');
  for (const element of elements) {
    translateAttributes(element);
  }
  translateAttributes(root);
}

function translateText(node: Text): void {
  const parent = node.parentElement;
  if (!parent || shouldSkip(parent)) return;
  const raw = node.data;
  const trimmed = raw.trim();
  if (!trimmed) return;

  if (lang === 'zh') {
    const original = textOriginals.get(node);
    if (original !== undefined && node.data !== original) setText(node, original);
    return;
  }

  if (!textOriginals.has(node)) textOriginals.set(node, raw);
  const translated = translateString(trimmed);
  if (translated !== trimmed) {
    setText(node, raw.replace(trimmed, translated));
  }
}

function setText(node: Text, value: string): void {
  if (node.data === value) return;
  selfWrites.add(node);
  node.data = value;
}

function translateAttributes(element: Element): void {
  if (element.matches('[data-i18n-skip]')) return;
  for (const attr of ['placeholder', 'title', 'aria-label', 'alt']) {
    const value = element.getAttribute(attr);
    if (!value) continue;
    let originals = attrOriginals.get(element);
    if (!originals) {
      originals = {};
      attrOriginals.set(element, originals);
    }
    if (!(attr in originals)) originals[attr] = value;
    if (lang === 'zh') {
      if (value !== originals[attr]) element.setAttribute(attr, originals[attr]!);
      continue;
    }
    const translated = translateString(value);
    if (translated !== value) element.setAttribute(attr, translated);
  }
}

function shouldSkip(element: Element): boolean {
  return !!element.closest(
    'code, pre, textarea, script, style, .cm-editor, .cm-content, .msg.user, .param-name, .param-desc, .param-group-title, [data-i18n-skip]'
  );
}

function translateString(value: string): string {
  const exact = en[value];
  if (exact) return exact;
  for (const [regex, replacement] of patterns) {
    if (regex.test(value)) return value.replace(regex, replacement);
  }
  return value;
}

function updateLangToggles(): void {
  for (const element of document.querySelectorAll<HTMLElement>('[data-lang-toggle]')) {
    element.textContent = langToggleLabel();
    element.title = lang === 'zh' ? 'Switch to English' : '切换到中文';
  }
}
