# Snapmaker Orca 插件（AI 参数化模型）

把 ParametricModelMakerPlugin4SM_orca 作为第四个左侧标签集成进 Snapmaker Orca 的 Flutter Web 界面。

> 这不是 Snapmaker 官方插件 API。Orca 的 Flutter 界面是编译后的 canvas，没有 DOM 级扩展点；
> 本插件通过修改 `resources/web/flutter_web/index.html`，叠加一个固定定位的「AI 参数化模型」标签
> 和一个同源 iframe 面板来集成。安装需要管理员权限，卸载会恢复备份。

## 环境

- Snapmaker Orca（已在 1.8.5 验证）
- Windows 10/11 + WebView2 Runtime
- Node.js 18+（本地 AI 代理 + 缺少 `dist` 时自动构建）
- 管理员权限（写入 Program Files）

## 安装

双击 `install.bat`（会自动 UAC 提权）。脚本依次执行：

1. 如缺少 `dist/`，自动 `npm install` + `npm run build`
2. 自动查找 Orca：运行中进程 → 卸载注册表 → 常见安装路径 → 手动输入
3. 部署本地 AI 代理到 `%LOCALAPPDATA%\ParametricModelMaker4SM_orca`，启动并加入开机启动
4. 备份 `index.html` 为 `index.html.model-lab-backup`，复制静态资源到
   `resources\web\flutter_web\model-lab\`
5. 注入 `<script src="/web/flutter_web/model-lab/plugin.js"></script>`
6. 校验并重启 Orca

安装完成后左侧栏「近期文件」下方出现 **AI 参数化模型** 标签（英文界面为 **AI Parametric Model**）。

## 卸载

双击 `uninstall.bat`：恢复备份、删除插件资源、停止本地代理、移除开机启动项、重启 Orca。

## Orca 升级后

Orca 升级通常会覆盖 `index.html` 并清除 `resources\web\flutter_web\model-lab\`。
重新双击 `install.bat` 即可。

## 不修改 Program Files 的验证方式

```bash
npm run build
npm run orca:proxy
```

打开 `http://127.0.0.1:31001/web/flutter_web/home?locale=zh-CN&dark_model=1`。
代理会转发到正在运行的 `127.0.0.1:30996`，注入 `plugin.js`，并从 `dist` 提供静态资源。

## 本地 AI 代理

`local-proxy.mjs` 监听 `127.0.0.1:17329`，只接受 `POST /proxy`：

```json
{ "url": "https://token.sensenova.cn/v1/chat/completions", "headers": { "...": "..." }, "body": "{...}" }
```

只允许转发到白名单域名，不存储 API Key。`GET /health` 可用于探活。
安装脚本会把它复制到 `%LOCALAPPDATA%\ParametricModelMaker4SM_orca`，通过 `wscript.exe` 隐藏启动，
并在启动目录创建 `Parametric Model Maker Proxy.lnk`。

## 关键实现

| 项 | 值 |
|---|---|
| 左侧栏宽度 | 262 CSS px（截图 327 物理 px / DPR 1.25） |
| 第四个标签 top | 312 CSS px（前三个标签从 171px 开始，每个 47px） |
| 标签高度 | 47 CSS px |
| 图标左边距 | 48 CSS px（与 Orca 原生标签图标对齐） |
| iframe 地址 | `/web/flutter_web/model-lab/index.html` |
| iframe 属性 | `credentialless`（必须，否则 COEP 会拦截） |

**为什么放在 `flutter_web/model-lab`**：Orca 的本地静态服务只映射已知顶层目录
（`homepage` / `model` / `flutter_web` 等），新增 `web/model-lab` 顶层目录会 404。
放进已映射的 `flutter_web/` 子目录即可被服务。

**为什么必须 `credentialless`**：Orca 的页面响应带
`Cross-Origin-Embedder-Policy: credentialless`。不带该属性的 iframe 实测会报
`net::ERR_BLOCKED_BY_RESPONSE`，连带 worker 脚本被拦截；加上后正常加载 OpenSCAD WASM worker。

## 已知限制

- 标签是 DOM overlay，不是 Flutter 内部导航状态；点击其它 Orca 标签会关闭面板（脚本监听
  `pointerdown`），再次点击「AI 参数化模型」会恢复之前的 iframe 状态。
- 左侧栏尺寸按 Orca 1.8.5 默认布局测量；如果 Orca 改版或侧边栏宽度变化，需要调整
  `plugin.js` 里的 `sidebarWidth` / `tabTop`。
- 深色主题：当前按浅色 Orca 主题适配；Orca 切换深色时需要补 CSS。
- iframe 内下载（STL/3MF）依赖 WebView2 的下载策略；若被拦截，后续可接原生桥接保存文件。

## 文件

- `plugin.js`：overlay 标签 + iframe 面板
- `install.ps1` / `uninstall.ps1`：提权、自动检测、备份 / 恢复
- `install-common.psm1`：路径检测、Node/npm 解析、本地代理安装
- `local-proxy.mjs`：本地 AI 中继
- `dev-proxy.mjs`：不改 Program Files 的开发代理
- `embed-test.html`：853px 嵌入宽度回归页
