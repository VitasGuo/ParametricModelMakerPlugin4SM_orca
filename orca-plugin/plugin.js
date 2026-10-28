/**
 * Model Lab — Snapmaker Orca 侧边栏集成插件。
 *
 * 由 install.ps1 注入到 /web/flutter_web/index.html。
 * Flutter 的标签栏是 canvas 绘制，没有 DOM 插件 API，所以这里用
 * 固定定位的 overlay 在左侧第三项下方增加一个 "AI 建模" 标签，
 * 点击后在右侧内容区用 iframe 加载 /web/flutter_web/model-lab/。
 *
 * 设计约束：
 * - 不修改 Flutter JS，只叠加 DOM，Orca 升级后重跑 install.ps1 即可。
 * - 不拦截 Flutter 内部导航：点击其它标签会关闭面板（window pointerdown）。
 * - iframe 懒加载，首次点击才请求 WASM。
 * - iframe 必须带 credentialless：Orca 页面有 COEP: credentialless，直接 iframe
 *   会被 ERR_BLOCKED_BY_RESPONSE 拦截（实测）。
 */
(function () {
  'use strict';

  if (window.__modelLabOrcaPlugin) return;
  window.__modelLabOrcaPlugin = true;

  var CONFIG = {
    sidebarWidth: 262, // CSS px，来自 Orca 1.8.5 截图测量（物理 327 / DPR 1.25）
    tabTop: 312, // 第三个标签底部：171 + 3 * 47
    tabHeight: 47,
    appUrl: '/web/flutter_web/model-lab/index.html',
    label: 'AI 参数化模型',
  };

  var pageLocale = new URLSearchParams(window.location.search).get('locale') || '';
  if (/^en/i.test(pageLocale)) CONFIG.label = 'AI Parametric Model';

  var tab = null;
  var panel = null;
  var iframe = null;
  var loaded = false;
  var open = false;

  function boot() {
    if (document.getElementById('model-lab-orca-tab')) return true;
    if (!document.body) return false;
    // Flutter 首帧挂载后再插入，避免被 flt-glass-pane 的初始层覆盖
    if (!document.querySelector('flt-glass-pane') && !document.querySelector('flutter-view')) {
      return false;
    }
    createUi();
    return true;
  }

  function createUi() {
    if (tab) return;

    var style = document.createElement('style');
    style.id = 'model-lab-orca-style';
    style.textContent = [
      '#model-lab-orca-tab{',
      '  position:fixed;left:0;top:' + CONFIG.tabTop + 'px;width:' + CONFIG.sidebarWidth + 'px;height:' + CONFIG.tabHeight + 'px;',
      '  z-index:2147483001;display:flex;align-items:center;gap:10px;padding:0 16px 0 48px;box-sizing:border-box;',
      '  border:0;border-radius:0 8px 8px 0;background:transparent;color:#35373b;',
      '  font:400 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;',
      '  cursor:pointer;text-align:left;-webkit-tap-highlight-color:transparent;transition:background .15s,color .15s;',
      '}',
      '#model-lab-orca-tab:hover{background:#f3f6fb;}',
      '#model-lab-orca-tab.active{background:#e3ecf9;color:#2f5fa8;}',
      '#model-lab-orca-tab .ml-icon{width:18px;height:18px;display:flex;align-items:center;justify-content:center;flex:0 0 18px;opacity:.78;}',
      '#model-lab-orca-tab.active .ml-icon{opacity:1;}',
      '#model-lab-orca-tab .ml-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '#model-lab-orca-panel{',
      '  position:fixed;left:' + CONFIG.sidebarWidth + 'px;top:0;right:0;bottom:0;z-index:2147483000;',
      '  display:none;background:#f5f6f8;border-left:1px solid rgba(0,0,0,.12);',
      '}',
      '#model-lab-orca-panel.open{display:block;}',
      '#model-lab-orca-frame{display:block;width:100%;height:100%;border:0;background:#f5f6f8;}',
      '@media (max-width:700px){#model-lab-orca-tab{display:none;}#model-lab-orca-panel{left:0;}}',
    ].join('');

    tab = document.createElement('button');
    tab.id = 'model-lab-orca-tab';
    tab.type = 'button';
    tab.title = CONFIG.label + ' · Model Lab';
    tab.setAttribute('aria-label', CONFIG.label);
    tab.innerHTML =
      '<span class="ml-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M12 2.6 3.4 7.4v9.2L12 21.4l8.6-4.8V7.4L12 2.6Z"></path>' +
      '<path d="m3.7 7.5 8.3 4.7 8.3-4.7M12 12.2v9"></path>' +
      '<path d="M18.6 2.2v3.2M17 3.8h3.2"></path>' +
      '</svg></span><span class="ml-label">' + CONFIG.label + '</span>';
    tab.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (open) closePanel();
      else openPanel();
    });

    panel = document.createElement('div');
    panel.id = 'model-lab-orca-panel';
    iframe = document.createElement('iframe');
    iframe.id = 'model-lab-orca-frame';
    iframe.title = 'Model Lab';
    iframe.setAttribute('allow', 'clipboard-write; fullscreen');
    iframe.setAttribute('credentialless', '');
    iframe.src = 'about:blank';
    panel.appendChild(iframe);

    document.head.appendChild(style);
    document.body.appendChild(tab);
    document.body.appendChild(panel);

    // 点击 iframe 之外（例如 Flutter 的其它标签）时关闭面板
    document.addEventListener(
      'pointerdown',
      function (event) {
        if (!open) return;
        var target = event.target;
        if ((tab && tab.contains(target)) || (panel && panel.contains(target))) return;
        closePanel();
      },
      true
    );
  }

  function openPanel() {
    if (!tab) createUi();
    if (!loaded) {
      loaded = true;
      var appUrl = new URL(CONFIG.appUrl, window.location.href);
      if (pageLocale) appUrl.searchParams.set('locale', pageLocale);
      iframe.src = appUrl.href;
    }
    panel.classList.add('open');
    tab.classList.add('active');
    open = true;
  }

  function closePanel() {
    if (!panel) return;
    panel.classList.remove('open');
    tab.classList.remove('active');
    open = false;
  }

  if (!boot()) {
    var observer = new MutationObserver(function () {
      if (boot()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(boot, 1500);
    window.setTimeout(boot, 4000);
    window.setTimeout(boot, 8000);
  }
})();
