# ParametricModelMakerPlugin4SM_orca

> **中文**：给 Snapmaker Orca 用的 AI 参数化模型生成器 —— 一句话生成可打印的 OpenSCAD 模型，浏览器内真实编译、3D 预览、调参、导出 STL / 3MF。
>
> **English**: An AI parametric model maker for Snapmaker Orca — describe an idea in one sentence and get a printable OpenSCAD model, with real in-browser compilation, 3D preview, parametric tweaking, and STL / 3MF export.

**仓库 / Repository**: https://github.com/VitasGuo/ParametricModelMakerPlugin4SM_orca<br>
**开发者 / Developer**: VitasGuo · **许可证 / License**: [GPL-2.0-only](LICENSE)

> **Beta 预览版 / Beta preview — v0.7.0-beta.9**
> 核心建模链路与 67 个范例已通过真实引擎 + 结构审计回归；插件安装脚本与各家 AI Provider 的兼容性仍在收集反馈，接口和范例可能继续调整。
> The core modeling pipeline and all 67 examples pass real-engine and mesh-audit regression. The installer and provider compatibility are still collecting feedback; APIs and examples may change.

---

## 它是什么 / What is this

本仓库包含两部分，共用同一套代码：

This repository ships two deliverables built on the same codebase:

1. **独立网页工作台 / Standalone web workbench**
   纯静态 SPA，自带 OpenSCAD WASM 引擎、CodeMirror 编辑器、Customizer 参数面板、Three.js 预览和 AI 建模助手。可单独部署，也可以被任意网页以 iframe 嵌入。<br>
   A pure static SPA bundling the OpenSCAD WASM engine, a CodeMirror editor, a Customizer parameter panel, a Three.js preview, and an AI modeling assistant. Deploy it on its own, or embed it from any web page via iframe.
2. **Snapmaker Orca 侧边栏插件 / Snapmaker Orca sidebar plugin**
   把上述工作台作为左侧栏第四个标签「AI 参数化模型」嵌入 Orca 的 Flutter Web 界面，一键安装、一键卸载。<br>
   Embeds the workbench into Orca's Flutter web UI as a fourth sidebar tab, "AI Parametric Model", with one-click install and uninstall.

所有模型都在浏览器内用 OpenSCAD WASM 真实编译（不是近似求值），导出的 STL / 3MF 可直接切片打印。

Every model is compiled for real by OpenSCAD WASM inside the browser (not by an approximate evaluator), so exported STL / 3MF files can be sliced and printed directly.

## 功能 / Features

- **自然语言建模 / Natural-language modeling**：用一句话描述想要的模型，AI 生成或修改 OpenSCAD 源码。<br>Describe the model you want in one sentence; the AI writes or edits the OpenSCAD source.
- **对话参考图 / Reference images in chat**：输入框可添加最多 3 张参考图（按钮 / 粘贴 / 拖拽），浏览器内压缩后随消息发给视觉模型；纯文本模型会明确提示看不到图片。<br>Attach up to 3 reference images to a chat message (button / paste / drag-and-drop); they are compressed in the browser and sent to vision models, while text-only models get an explicit "cannot see images" note.
- **标准件模块库 / Standard parts library**：公制螺纹螺栓、螺母、螺钉过孔、垫圈做成经过装配校验的 SCAD 模块，AI 直接调用而不是每次重画牙型；螺栓螺母用布尔交集验证 0.3mm 间隙能拧进去。<br>Metric threaded bolts, nuts, screw clearance holes, and washers ship as assembly-tested SCAD modules; the AI calls them instead of redrawing thread profiles, and a boolean-intersection test proves a 0.3mm-clearance nut can be screwed on.
- **齿轮与特征级尺寸核验 / Gears & feature-level dimension checks**：渐开线齿轮模块（模数 / 齿数 / 压力角 20°，中心距 = m(z1+z2)/2）；AI 可在输出里声明 `part_spec`（孔径 / 牙距 / 齿数 / 中心距 / 整体尺寸 / 独立件数），引擎对真实网格做射线测量，超差就带着实测值打回重抽。<br>An involute gear module (module / tooth count / 20° pressure angle, center distance = m(z1+z2)/2); the AI may declare a `part_spec` (bore, thread pitch, tooth count, center distance, overall size, part count), which the engine verifies by ray-casting the real mesh — deviations are fed back as measured values for a retry.
- **装配体与分件导出 / Assemblies & per-part export**：多个零件并列摆放时按共享顶点自动拆成独立实体，逐件显示尺寸 / 体积 / 面数并可单独或批量导出 STL，方便一件件切片打印；提示词要求零件间留 ≥0.5mm 间隙，`part_spec` 的 `parts` 检查会核对件数，穿插烘成一件会判失败。<br>When several parts sit side by side, the mesh is split into connected solids by shared vertices; each part shows size / volume / triangle count and can be exported as its own STL (individually or all at once). The prompt requires a ≥0.5mm gap between parts, and the `parts` check verifies the declared part count — parts fused by a boolean union fail the check.
- **曲面与点阵 / Surfaces & lattices**：原生 polyhedron 实现的放样（多截面 loft）与沿平面路径扫掠（sweep），截面点数与绕向自动对齐、首尾自动封盖；点阵晶格用两点圆杆 + 节点球生成，杆件实重叠所以 union 后仍流形，可与外壳求交精确裁边。<br>Native-polyhedron loft (stacked cross-sections) and sweep (a profile along a planar path) with matched point counts and winding, auto-capped ends; lattice blocks connect nodes with round rods plus node spheres so the union stays manifold, and an intersection trims the block to its exact size.
- **真实引擎验证 / Real-engine verification**：每次生成都用 OpenSCAD WASM 编译；语法错误、空模型、尺寸异常会被打回重试。<br>Every generation is compiled with OpenSCAD WASM; syntax errors, empty models, and abnormal dimensions are rejected and retried.
- **参数面板 / Parameter panel**：按 Customizer 注释自动生成滑杆、枚举、开关、颜色控件，参数通过 `-D` 覆盖，不改写源码。<br>Sliders, enums, checkboxes, and color controls are generated from Customizer annotations; parameters are applied via `-D` overrides without rewriting the source.
- **3D 预览 / 3D preview**：Three.js Z-up 视图，等轴、正、顶、右视角、线框、截图。<br>Three.js Z-up viewer with iso / front / top / right views, wireframe, and screenshots.
- **范例库 / Example library**：67 个完整可运行范例，覆盖容器、盒体、收纳、装配配合、壁挂磁吸、园艺、数学曲线、建筑、像素图案、机械传动、工程结构、科学造型、曲面放样、点阵晶格、艺术与实用工具，支持搜索、分类、复制、一键载入，全部经真实引擎编译与结构审计。范例库以左侧侧栏打开；系统提示里只注入 25 个模板范例的完整源码，其余 42 个以「名称 + 适用 + 思路」目录条目注入，兼顾覆盖与上下文体积。<br>67 fully working examples covering containers, boxes, storage, joints and fits, wall mounting and magnets, gardening, mathematical curves, architecture, pixel art, mechanisms, engineering structures, scientific forms, lofted surfaces, lattices, art, and practical tools — searchable, categorized, copyable, and loadable in one click; every one is compiled and mesh-audited by the real engine. The library opens as a left drawer. The system prompt injects full source for 25 template examples and a name + use + idea catalog for the other 42, balancing coverage against context size.
- **复杂结构优先 / Complexity first**：提示词把"设计意图 > 功能 > 结构 > 工艺"写成明确优先级，允许机构、装配体、多层结构写到 600~800 行，鼓励用 module 拆分而不是把结构做简单。<br>The prompt states an explicit priority — design intent &gt; function &gt; structure &gt; printability — and allows 600–800 line mechanisms, assemblies, and multi-layer structures, encouraging module decomposition instead of simplifying the design.
- **图片转像素画 / Image to pixel art**：选一张图，浏览器内降采样成像素网格，自动生成 OpenSCAD 源码（分层浮雕或拼豆空心珠），像素数据编码进字符串常量，不依赖任何外部文件。<br>Pick an image and it is downsampled to a pixel grid in the browser, then turned into OpenSCAD source (layered relief or hollow beads); the pixel data is encoded as a string constant, so no external files are needed.
- **批量变体 / Batch variants**：一次生成多组参数，并排编译、缩略图预览、单组应用、全部导出 STL。<br>Generate multiple parameter sets at once, compiled side by side with thumbnail previews; apply one set or export all of them as STL.
- **形状审核 / Shape review**：主模型支持图片输入时（SenseNova 6.8、GLM-4V、GPT-4o、Claude、Gemini 等），自动把 ISO / FRONT / TOP 三视图发给它判断形状；纯文本模型退化为网格摘要加设计计划。<br>When the main model accepts images (SenseNova 6.8, GLM-4V, GPT-4o, Claude, Gemini, etc.), ISO / FRONT / TOP views are sent for shape checking; text-only models fall back to a mesh summary plus a design plan.
- **导出 / Export**：STL、3MF、分件 STL（装配体逐件）、`.scad`（含当前参数值）、项目 JSON。<br>STL, 3MF, per-part STL for assemblies, `.scad` (with current parameter values baked in), and project JSON.
- **中英双语 / Bilingual UI**：顶栏一键切换，保留当前项目与编译状态。<br>One-click language switching from the top bar, keeping the current project and compile state.
- **本地 AI 代理 / Local AI proxy**：内置 Node 中继（`127.0.0.1:17329`），解决 SenseNova、GLM、OpenAI 的浏览器 CORS 限制。<br>A built-in Node relay (`127.0.0.1:17329`) that works around the browser CORS limits of SenseNova, GLM, and OpenAI.
- **Office 式常驻工具栏 / Office-style quick toolbar**：顶栏菜单（文件 / 视图 / 帮助）下方是一条常驻工具栏：新建 / 打开 / 保存 / 历史 / 快照、图片转像素画、导出 STL / 分件导出 / 3MF / SCAD / JSON 全部一键直达；窄屏时整条工具栏横向滚动而不挤压主界面。<br>Below the File / View / Help menu bar sits a persistent toolbar: New / Open / Save / History / Snapshot, image-to-pixel-art, and STL / part export / 3MF / SCAD / JSON exports are one click away; on narrow screens the row scrolls horizontally instead of squeezing the workspace.
- **贴边侧栏，不用浮窗 / Edge drawers, no floating modals**：范例、历史、项目从左侧滑入，设置、日志、批量变体、分件导出、图片导入、关于从右侧滑入；全高贴边面板 + 滑入动画，点击面板外或按 Esc 关闭。删除 / 清空 / 新建覆盖等确认改为底部确认条，不再弹系统对话框。<br>Examples, history, and projects slide in from the left; settings, logs, batch variants, part export, image import, and about slide in from the right — full-height docked panels with a slide animation, closed by clicking outside or pressing Esc. Destructive confirmations use a bottom confirm bar instead of system dialogs.
- **macOS 风格顶栏 / macOS-style top bar**：左侧菜单（文件 / 视图 / 帮助），项目名居中，右侧状态。<br>Left menus (File / View / Help), a centered project name, and status on the right.
- **中心视图切换 / Center view switching**：3D 预览与 SCAD 源代码只在中部区域切换，左右聊天、参数面板保持可见；编辑器占满中间高度。<br>The 3D preview and SCAD source switch only in the center area, keeping the chat and parameter panels visible; the editor fills the center height.
- **历史版本 / History**：AI 生成、载入范例、图片导入、保存项目时自动命名并快照源码；工具栏「历史」从左侧滑出侧栏，每条可直接展开查看源码，也可载入、导出或删除。<br>AI generations, example loads, image imports, and project saves are auto-named and snapshotted; the toolbar History button opens a left drawer where each entry can be expanded to read its source, restored, exported, or deleted.
- **运行日志 / Logs**：编译、AI 调用、导出、设置等事件写入本机环形日志，可在「帮助 → 运行日志」查看、复制、导出。<br>Compile, AI, export, and settings events are written to a local ring buffer, viewable, copyable, and exportable via "Help → Logs".
- **版本、作者、仓库 / Version, author, repo**：底部状态栏显示版本、开发者、许可证与 GitHub 链接，帮助菜单可查看关于信息。<br>The bottom status bar shows version, developer, license, and the GitHub link; the Help menu has an About dialog.
- **纯静态 + BYOK**：无后端，API Key 明文保存在本机浏览器 localStorage（风险自负）。<br>No backend; the API key is stored in plain text in the browser's localStorage on your machine (at your own risk).

## 一键安装到 Snapmaker Orca / One-click install into Snapmaker Orca

### 环境要求 / Requirements

- Snapmaker Orca（已在 1.8.5 验证 / verified on 1.8.5）
- Windows 10/11
- Node.js 18+（本地 AI 代理需要；缺失时安装脚本会提示下载地址 / required by the local AI proxy; the installer points you to a download if it is missing）

### 安装 / Install

1. 下载或克隆本仓库<br>Download or clone this repository
2. 双击 **`orca-plugin\install.bat`**<br>Double-click **`orca-plugin\install.bat`**
3. UAC 提权 → 自动查找 Orca 安装目录 → 自动构建前端（如缺 `dist`）→ 安装本地代理 → 注入插件 → 重启 Orca<br>UAC elevation → auto-detect the Orca install directory → build the frontend if `dist` is missing → install the local proxy → inject the plugin → restart Orca

安装脚本会 / The installer will:

- 通过运行中进程、卸载注册表、常见路径自动定位 Snapmaker Orca，找不到才要求手动输入<br>Locate Snapmaker Orca automatically via running processes, the uninstall registry, and common paths; ask for manual input only if not found
- 缺少 `dist/` 时自动执行 `npm install` + `npm run build`<br>Run `npm install` + `npm run build` automatically when `dist/` is missing
- 备份 `resources\web\flutter_web\index.html` 为 `index.html.model-lab-backup`<br>Back up `resources\web\flutter_web\index.html` as `index.html.model-lab-backup`
- 把静态资源复制到 `resources\web\flutter_web\model-lab\`（Orca 静态服务只映射已知顶层目录）<br>Copy static assets to `resources\web\flutter_web\model-lab\` (Orca's static server only maps known top-level directories)
- 注入 `<script src="/web/flutter_web/model-lab/plugin.js"></script>`<br>Inject `<script src="/web/flutter_web/model-lab/plugin.js"></script>`
- 安装并启动本地 AI 代理，写入开机启动项<br>Install and start the local AI proxy and register it for auto-start

安装完成后打开 Orca，左侧栏「近期文件」下方会出现 **AI 参数化模型** 标签。

After installation, open Orca — an **AI Parametric Model** tab appears below "Recent Files" in the left sidebar.

### 卸载 / Uninstall

双击 **`orca-plugin\uninstall.bat`**：恢复 `index.html` 备份、删除插件资源、停止本地代理并移除开机启动项。

Double-click **`orca-plugin\uninstall.bat`**: it restores the `index.html` backup, removes the plugin assets, stops the local proxy, and removes the auto-start entry.

### Orca 升级后 / After an Orca upgrade

Orca 升级会覆盖 `index.html` 并清空插件目录，重新双击 `install.bat` 即可。

Orca upgrades overwrite `index.html` and clear the plugin directory — just run `install.bat` again.

## 在 Orca 里使用 / Using it inside Orca

1. 点左侧栏 **AI 参数化模型**<br>Click **AI Parametric Model** in the left sidebar
2. 首次使用点右上角 **设置**：<br>On first use, click **Settings** at the top right:
   - Provider 选 **商汤 SenseNova**（默认）<br>Provider: **SenseNova** (default)
   - 模型填 `deepseek-flash`<br>Model: `deepseek-flash`
   - API Key 填入你的 Key<br>API key: your own key
   - API 代理地址保持 `http://127.0.0.1:17329/proxy`（安装脚本已启动）<br>Proxy URL: keep `http://127.0.0.1:17329/proxy` (already started by the installer)
3. 在左侧对话框描述需求，例如「做一个仿瓷器的高足碗」<br>Describe your request in the left chat, e.g. "a porcelain-style stem bowl"
4. 右侧调参，满意后点 **文件 → 导出 STL / 3MF**<br>Tweak parameters on the right, then choose **File → Export STL / 3MF**

## AI Provider 与 CORS / AI providers and CORS

| Provider | 浏览器直连 / Direct from browser | 说明 / Notes |
|---|---|---|
| DeepSeek | 可用 / OK | 国内直连，纯文本，价格低 / reachable in China, text-only, inexpensive |
| Kimi (Moonshot) | 可用 / OK | 国内直连 / reachable in China |
| MiniMax | 可用 / OK | 国内直连 / reachable in China |
| OpenRouter | 可用 / OK | 一个 Key 聚合多家模型，含视觉模型 / one key aggregates many providers, including vision models |
| Anthropic Claude | 可用 / OK | 自动添加 `anthropic-dangerous-direct-browser-access` 头 / automatically adds the `anthropic-dangerous-direct-browser-access` header |
| 自定义 OpenAI 兼容端点 / Custom OpenAI-compatible endpoint | 取决于端点 / depends | Ollama、LM Studio、vLLM 等 / Ollama, LM Studio, vLLM, etc. |
| OpenAI | 需代理 / proxy needed | 官方不建议浏览器直连 / browser access officially discouraged |
| 智谱 GLM | 需代理 / proxy needed | 预检 CORS 不通过 / CORS preflight fails |
| 商汤 SenseNova | 需代理 / proxy needed | 预检 CORS 不通过，安装脚本已内置本地代理 / CORS preflight fails; a local proxy is bundled with the installer |

需要代理时也可以用仓库里的 `proxy/`（Cloudflare Worker 模板）部署到自己的域名，然后在设置里填入代理地址。代理只转发白名单域名，不会变成任意 HTTP 代理。

If a proxy is needed, you can also deploy the `proxy/` folder in this repo (a Cloudflare Worker template) to your own domain and enter its URL in Settings. The proxy only forwards whitelisted domains — it never becomes an open HTTP proxy.

安装脚本部署的本地代理 / The local proxy deployed by the installer:

- 监听 `127.0.0.1:17329`，只接受 `POST /proxy`<br>Listens on `127.0.0.1:17329` and only accepts `POST /proxy`
- 请求体 `{ "url": "https://目标接口", "headers": {...}, "body": "{...}" }`<br>Request body `{ "url": "https://target-endpoint", "headers": {...}, "body": "{...}" }`
- 只允许转发到 SenseNova、DeepSeek、OpenRouter、Kimi、MiniMax、GLM、OpenAI、Anthropic<br>Only forwards to SenseNova, DeepSeek, OpenRouter, Kimi, MiniMax, GLM, OpenAI, and Anthropic
- 不存储 API Key（Key 由浏览器每次请求携带）<br>Stores no API keys (the key is sent by the browser with each request)

## 本地开发 / Local development

```bash
npm install
npm run dev          # 独立网页开发 / standalone web dev server
npm run build        # 生产构建 / production build
npm run preview      # 预览构建产物 / preview the build output
npm run typecheck    # tsc --noEmit
npm test             # 单测 + 67 个范例真实引擎编译冒烟 / unit tests + real-engine smoke compile of all 67 examples
```

不修改 Program Files 的插件验证方式 / Verifying the plugin without touching Program Files:

```bash
npm run orca:proxy
# 打开 / open http://127.0.0.1:31001/web/flutter_web/home?locale=zh-CN&dark_model=1
```

## 技术栈 / Tech stack

| 层 / Layer | 技术 / Technology |
|---|---|
| 构建 / Build | Vite 8 + TypeScript |
| 引擎 / Engine | `@lofcz/openscad-wasm`（OpenSCAD WASM，Manifold 后端 / OpenSCAD WASM, Manifold backend） |
| 编辑器 / Editor | CodeMirror 6（自定义 OpenSCAD StreamLanguage / custom OpenSCAD StreamLanguage） |
| 预览 / Preview | Three.js + STLLoader + OrbitControls |
| AI | 浏览器直连多 provider（OpenAI 兼容与 Anthropic 原生协议 / OpenAI-compatible and native Anthropic protocols, direct from the browser） |
| 存储 / Storage | localStorage（配置、项目、对话、历史、日志 / settings, projects, chats, history, logs）+ IndexedDB（中文字体 / CJK fonts） |

## 目录结构 / Repository layout

```
ParametricModelMakerPlugin4SM_orca/
├── src/
│   ├── core/                 # types / scad-parser / lint / prompts / examples / part-spec（射线尺寸核验）/ mesh-parts（装配体分件）/ logger
│   ├── tools/                # image-grid.ts：图片 → 像素网格 → SCAD / image → pixel grid → SCAD
│   ├── knowledge/            # 知识库：environment.ts（运行环境硬限制）+ workflow.ts（工作流程）+ rules.ts（编号硬约束）+ parts.ts（标准件模块）+ gears.ts（渐开线齿轮）+ assembly.ts（装配体与分件）+ surfaces.ts（放样/扫掠/点阵）/ knowledge base: runtime limits, workflow, numbered rules, standard parts, involute gears, assemblies, loft/sweep/lattice
│   ├── engine/
│   │   ├── openscad.worker.ts  # WASM 编译 Worker（一次性实例）/ WASM compile worker (one-shot instance)
│   │   ├── compiler.ts         # 主线程编译 API（超时 / 并发）/ main-thread compile API (timeout / concurrency)
│   │   ├── defines.ts          # Customizer 参数 → -D / Customizer parameters → -D
│   │   └── stl.ts              # 二进制 STL 解析 + 网格摘要 / binary STL parsing + mesh summary
│   ├── viewer/               # Three.js 主预览 + 离屏三视图截图 / main preview + offscreen tri-view screenshots
│   ├── editor/               # CodeMirror + OpenSCAD 语法 / CodeMirror + OpenSCAD syntax
│   ├── ai/                   # provider / config / pipeline / verify
│   ├── state/                # Store（源码、参数、编译、对话）/ store (source, parameters, compile, chat)
│   ├── storage/              # 项目持久化、代码历史、字体与下载 / project persistence, code history, fonts, downloads
│   ├── ui/                   # 布局、对话、参数、范例、设置、历史、分件导出、日志、关于 / layout, chat, params, examples, settings, history, part export, logs, about
│   ├── i18n.ts               # 中英文 DOM 翻译（无重载切换）/ zh-en DOM translation (hot switch, no reload)
│   ├── version.ts            # 构建时注入的版本与作者 / version & author injected at build time
│   └── styles/app.css
├── proxy/                    # 可选 Cloudflare Worker CORS 代理 / optional Cloudflare Worker CORS proxy
├── orca-plugin/              # Orca 侧边栏插件 + 安装 / 卸载 / 开发代理 / Orca sidebar plugin + install / uninstall / dev proxy
├── tests/                    # 单测 + 真实 OpenSCAD 范例冒烟 / unit tests + real-OpenSCAD example smoke tests
├── index.html
├── vite.config.ts
└── package.json
```

## 实现说明 / Implementation notes

- **真实引擎替代近似求值器 / Real engine instead of an approximate evaluator**：验证以 OpenSCAD WASM 的退出码加 STL 网格统计为准，避免「求值器自己验证自己」。<br>Verification trusts the OpenSCAD WASM exit code plus STL mesh statistics, avoiding "the evaluator grading its own homework".
- **参数走 `-D`，不改源码 / Parameters via `-D`, source untouched**：参数值与源码解耦；导出 `.scad` 时才把当前值烘焙进去。<br>Parameter values stay decoupled from the source; current values are baked in only when exporting `.scad`.
- **每次编译新建 WASM 实例 / A fresh WASM instance per compile**：OpenSCAD 静态状态不支持第二次 `callMain`，所以 Worker 一次性使用，超时直接 `terminate()`。<br>OpenSCAD's static state cannot survive a second `callMain`, so workers are one-shot and simply `terminate()` on timeout.
- **Orca 集成是 DOM overlay，不是官方插件 API / The Orca integration is a DOM overlay, not an official plugin API**：Orca 的 Flutter 界面是 canvas，没有 DOM 扩展点；插件通过 overlay 标签加同源 iframe 实现。iframe 必须带 `credentialless`，否则会被 Orca 的 COEP 拦截。<br>Orca's Flutter UI is a canvas with no DOM extension points; the plugin injects an overlay tab plus a same-origin iframe. The iframe must be `credentialless`, otherwise Orca's COEP blocks it.

更细的原理、测量值和故障排查见 [orca-plugin/README.md](orca-plugin/README.md)。

See [orca-plugin/README.md](orca-plugin/README.md) for details, measurements, and troubleshooting.

## 已知限制 / Known limitations

- **许可证 / License**：OpenSCAD WASM 为 GPL-2.0，本项目整体采用 GPL-2.0-only。<br>OpenSCAD WASM is GPL-2.0, so the project as a whole is GPL-2.0-only.
- **WASM 体积 / WASM size**：`openscad.wasm` 约 10.6 MB（gzip 3.4 MB），首次加载需要下载；字体模块按需加载。<br>`openscad.wasm` is about 10.6 MB (3.4 MB gzipped), so the first load takes a while; font modules load on demand.
- **中文 `text()` / Chinese `text()`**：内置字体不含 CJK；需在设置页上传系统中文字体，并在源码里用 `font="字体族名"` 引用。<br>Bundled fonts contain no CJK glyphs; upload a system CJK font in Settings and reference it as `font="Font Family"` in the source.
- **API Key 明文在浏览器 / API key stored in plain text**：纯静态 BYOK 模式的固有风险，本机泄露由用户自行承担；建议只在个人设备使用，不要把带 Key 的页面公开分享，也不要把 Key 写进仓库或截图。<br>This risk is inherent to the static BYOK design; any local leak is the user's responsibility. Use it on personal devices only, never share pages containing your key, and never commit keys or screenshots of them.
- **Orca 升级 / Orca upgrades**：会覆盖 `index.html`，重跑 `install.bat` 即可。<br>Upgrades overwrite `index.html`; simply re-run `install.bat`.
- **下载 / Downloads**：Orca 内 STL / 3MF 下载走 WebView2 默认策略；若被宿主拦截，需要后续接原生桥接。<br>STL / 3MF downloads inside Orca follow WebView2 defaults; if the host blocks them, a native bridge will be needed later.

## 免责声明 / Disclaimer

本项目是非官方社区项目，与 Snapmaker 无隶属关系。安装脚本会修改 Orca 安装目录下的 `index.html`（可逆，卸载时恢复备份），请自行评估风险。

This is an unofficial community project with no affiliation with Snapmaker. The installer modifies `index.html` inside the Orca installation directory (reversible — the backup is restored on uninstall); please evaluate the risk yourself.

## License

GPL-2.0-only。Copyright (C) 2026 VitasGuo。

GPL-2.0-only. Copyright (C) 2026 VitasGuo.

见 / See [LICENSE](LICENSE) 与 / and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
