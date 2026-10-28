/** 模型设置弹窗。 */

import type { ModelProvider } from '../core/types.js';
import { defaultConfig } from '../ai/config.js';
import { PROVIDERS, type WebModelConfig } from '../ai/providers.js';
import { clearCjkFont, getCjkFont, saveCjkFont } from '../storage/fonts.js';
import { button, el, field, input, modal, select } from './dom.js';
import { toast } from './toast.js';

export function openSettingsModal(
  current: WebModelConfig | null,
  onSave: (cfg: WebModelConfig) => void,
  onFontChanged?: () => void
): void {
  const cfg = current ? { ...current } : defaultConfig();
  const providerSelect = select(
    Object.values(PROVIDERS).map((meta) => ({ value: meta.id, label: meta.label }))
  );
  providerSelect.value = cfg.provider;

  const modelInput = input('text', cfg.model, '模型名，如 deepseek-chat');
  const baseInput = input('text', cfg.baseUrl ?? '', '默认使用官方地址');
  const keyInput = input('password', cfg.apiKey, 'sk-...');
  const showKey = el('input', '');
  showKey.type = 'checkbox';
  const showKeyRow = el('label', 'check-row', [showKey, '显示 Key']);
  showKey.addEventListener('change', () => {
    keyInput.type = showKey.checked ? 'text' : 'password';
  });

  const proxyInput = input('text', cfg.proxyUrl ?? '', 'https://你的代理.workers.dev');

  const reasonSelect = select([
    { value: 'none', label: 'none（推荐，结构化输出更快）' },
    { value: 'low', label: 'low' },
    { value: 'medium', label: 'medium' },
    { value: 'high', label: 'high' },
  ]);
  reasonSelect.value = cfg.reasoningEffort ?? 'none';

  const visionCheck = el('input', '');
  visionCheck.type = 'checkbox';
  visionCheck.checked = !!cfg.vision;

  const visionProvider = select(
    Object.values(PROVIDERS).map((meta) => ({ value: meta.id, label: meta.label }))
  );
  visionProvider.value = cfg.vision?.provider ?? 'openrouter';
  const visionModel = input('text', cfg.vision?.model ?? 'google/gemini-2.5-flash', '视觉模型名');
  const visionKey = input('password', cfg.vision?.apiKey ?? '', '视觉模型 API Key');
  const visionBase = input('text', cfg.vision?.baseUrl ?? '', '默认使用官方地址');

  const visionFields = el('div', 'settings-grid full', [
    field('视觉 Provider', visionProvider),
    field('视觉模型', visionModel),
    field('视觉 API Key', visionKey, '留空则复用主模型 Key（同 provider 时）'),
    field('视觉 Base URL', visionBase, '可选'),
  ]);
  visionFields.style.display = visionCheck.checked ? '' : 'none';
  visionCheck.addEventListener('change', () => {
    visionFields.style.display = visionCheck.checked ? '' : 'none';
  });

  const fontInput = input('file');
  fontInput.accept = '.ttf,.ttc,.otf';
  fontInput.style.display = 'none'; // 原生 file 控件文案随浏览器语言，改为自定义按钮触发
  const pickFontButton = button('选择字体文件', 'btn btn-sm', () => fontInput.click());
  const fontStatus = el('div', 'field-hint', [fontLabel()]);
  const clearFontButton = button('移除字体', 'btn btn-sm btn-ghost', () => {
    void clearCjkFont().then(() => {
      refreshFont();
      toast('中文字体已移除');
      onFontChanged?.();
    });
  });
  clearFontButton.disabled = !getCjkFont();
  fontInput.addEventListener('change', () => {
    const file = fontInput.files?.[0];
    if (!file) return;
    void saveCjkFont(file)
      .then((font) => {
        refreshFont();
        toast(`字体已保存：${font.name}`);
        onFontChanged?.();
      })
      .catch((e) => toast(e instanceof Error ? e.message : '字体保存失败', 'error'));
  });

  function fontLabel(): string {
    return getCjkFont() ? `当前字体：${getCjkFont()!.name}` : '当前没有加载中文字体（text() 只能显示拉丁字符）';
  }

  function refreshFont(): void {
    fontStatus.textContent = fontLabel();
    clearFontButton.disabled = !getCjkFont();
    fontInput.value = '';
  }

  const corsNote = el('div', 'settings-note');
  const providerNote = el('div', 'settings-note');
  const proxyWrap = el('div', 'full', [
    field('API 代理地址（可选）', proxyInput, '填写后所有 provider 请求都经此代理转发；仓库附带 Cloudflare Worker 模板'),
  ]);

  function refreshProviderHints(): void {
    const meta = PROVIDERS[providerSelect.value as ModelProvider];
    baseInput.placeholder = meta.baseUrl || 'https://...';
    providerNote.textContent = meta.note ?? '';
    providerNote.style.display = meta.note ? '' : 'none';
    corsNote.className = meta.cors === 'proxy' ? 'settings-note warn full' : 'settings-note full';
    corsNote.textContent =
      meta.cors === 'proxy'
        ? '浏览器直连该 provider 会因 CORS 失败。请填写代理地址，或改用 OpenRouter / DeepSeek / Kimi / MiniMax / Anthropic。'
        : '该 provider 支持浏览器直连（或由你自己的端点放行 CORS）。';
    const reasonField = reasonSelect.parentElement;
    if (reasonField) reasonField.style.display = providerSelect.value === 'sensenova' ? '' : 'none';
  }

  providerSelect.addEventListener('change', () => {
    const meta = PROVIDERS[providerSelect.value as ModelProvider];
    modelInput.value = meta.defaultModel;
    baseInput.value = '';
    refreshProviderHints();
  });

  const body = el('div', 'modal-body', [
    el('div', 'settings-grid', [
      field('Provider', providerSelect),
      field('模型', modelInput),
      field('API Key', keyInput),
      showKeyRow,
      field('Base URL（可选）', baseInput),
      field('思考力度（SenseNova）', reasonSelect),
      el('div', 'full', [providerNote]),
      el('div', 'full', [corsNote]),
      proxyWrap,
      el('div', 'full settings-note', [
        'API Key 以明文保存在本机浏览器的 localStorage，只会发送给你选择的 provider；本应用没有后端。本机泄露风险由你自行承担。',
      ]),
      el('div', 'full settings-note', [
        '中文 text()：OpenSCAD 内置字体不含 CJK。上传系统字体（如 simhei.ttf / msyh.ttc）后，在源码里用 font="SimHei" 引用。字体文件只存在本机 IndexedDB。',
      ]),
      el('div', 'full', [field('中文字体（可选）', el('div', 'font-pick-row', [pickFontButton, fontInput]))]),
      el('div', 'full', [fontStatus, clearFontButton]),
      el('div', 'full', [
        el('label', 'check-row', [visionCheck, '启用视觉子模型（把三视图描述成文本，提升形状审核准确率）']),
      ]),
      visionFields,
    ]),
  ]);

  body.appendChild(
    el('div', 'modal-actions', [
      button('取消', 'btn btn-ghost', () => close()),
      button('保存设置', 'btn btn-accent', () => save()),
    ])
  );

  const dialog = modal('模型设置', body, () => {});
  const close = dialog.close;
  refreshProviderHints();

  function save(): void {
    const provider = providerSelect.value as ModelProvider;
    const model = modelInput.value.trim();
    if (!model) {
      toast('请填写模型名', 'error');
      return;
    }
    if (provider === 'custom' && !baseInput.value.trim()) {
      toast('自定义 provider 需要填写 Base URL', 'error');
      return;
    }

    const next: WebModelConfig = {
      provider,
      model,
      apiKey: keyInput.value.trim(),
      baseUrl: baseInput.value.trim() || undefined,
      proxyUrl: proxyInput.value.trim() || undefined,
    };
    if (provider === 'sensenova') {
      next.reasoningEffort = reasonSelect.value as 'none' | 'low' | 'medium' | 'high';
    }
    if (visionCheck.checked) {
      const vp = visionProvider.value as ModelProvider;
      const vm = visionModel.value.trim();
      const vk = visionKey.value.trim() || (vp === provider ? next.apiKey : '');
      if (vm && vk) {
        next.vision = {
          provider: vp,
          model: vm,
          apiKey: vk,
          baseUrl: visionBase.value.trim() || undefined,
        };
      } else {
        toast('视觉子模型需要模型名和 API Key', 'error');
        return;
      }
    }

    onSave(next);
    close();
  }
}
