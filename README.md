# ParametricModelMakerPlugin4SM_orca

> 给 Snapmaker Orca 用的 AI 参数化模型生成器：一句话生成可打印的 OpenSCAD 模型，浏览器内真实编译、3D 预览、调参、导出 STL / 3MF。
>
> An AI parametric model maker plugin for Snapmaker Orca, with a standalone OpenSCAD workbench.

**仓库 / Repository**: https://github.com/VitasGuo/ParametricModelMakerPlugin4SM_orca<br>
**开发者 / Developer**: VitasGuo · **许可证 / License**: [GPL-2.0-only](LICENSE)

---

## 它是什么

本仓库包含两部分，共用同一套代码：

1. **独立网页工作台**：纯静态 SPA，自带 OpenSCAD WASM 引擎、CodeMirror 编辑器、Customizer 参数面板、Three.js 预览和 AI 建模助手。可单独部署，也可以被任意网页以 iframe 嵌入。
2. **Snapmaker Orca 侧边栏插件**：把上面的工作台作为左侧栏第四个标签「AI 参数化模型」嵌入 Orca 的 Flutter Web 界面，一键安装 / 一键卸载。

所有模型都在浏览器内用 OpenSCAD WASM 真实编译（不是近似求值），导出的 STL / 3MF 可直接切片打印。

## 功能

- **自然语言建模**：描述想要的模型，AI 生成 / 修改 OpenSCAD 源码
- **真实引擎验证**：每次生成都用 OpenSCAD WASM 编译；语法错误、空模型、尺寸异常会被打回重试
- **参数面板**：按 Customizer 注释自动生成滑杆 / 枚举 / 开关 / 颜色控件，参数通过 `-D` 覆盖，不改写源码
- **3D 预览**：Three.js Z-up 视图，等轴 / 正 / 顶 / 右视角、线框、截图
- **范例库**：34 个完整可运行范例，支持搜索、分类、复制、一键载入
- **批量变体**：一次生成多组参数，并排编译、缩略图预览、单组应用、全部导出 STL
- **形状审核**：主模型支持图片输入时（SenseNova 6.8 / GLM-4V / GPT-4o / Claude / Gemini 等），自动把 ISO / FRONT / TOP 三视图发给它判断形状；纯文本模型退化为网格摘要 + 设计计划
- **导出**：STL、3MF、`.scad`（含当前参数值）、项目 JSON
- **中英双语**：顶栏一键切换，保留当前项目与编译状态
- **本地 AI 代理**：内置 Node 中继（`127.0.0.1:17329`），解决 SenseNova / GLM / OpenAI 的浏览器 CORS 限制
- **纯静态 + BYOK**：无后端，API Key 明文保存在本机浏览器 localStorage（风险自负）

## 一键安装到 Snapmaker Orca

### 环境要求

- Snapmaker Orca（已在 1.8.5 验证）
- Windows 10/11
- Node.js 18+（本地 AI 代理需要；缺失安装脚本会提示下载地址）

### 安装

1. 下载 / 克隆本仓库
2. 双击 **`orca-plugin\install.bat`**
3. UAC 提权 → 自动查找 Orca 安装目录 → 自动构建前端（如缺 `dist`）→ 安装本地代理 → 注入插件 → 重启 Orca

安装脚本会：

- 通过运行中进程、卸载注册表、常见路径自动定位 Snapmaker Orca，找不到才要求手动输入
- 缺少 `dist/` 时自动执行 `npm install` + `npm run build`
- 备份 `resources\web\flutter_web\index.html` 为 `index.html.model-lab-backup`
- 把静态资源复制到 `resources\web\flutter_web\model-lab\`（Orca 静态服务只映射已知顶层目录）
- 注入 `<script src="/web/flutter_web/model-lab/plugin.js"></script>`
- 安装并启动本地 AI 代理，写入开机启动项

安装完成后打开 Orca，左侧栏「近期文件」下方会出现 **AI 参数化模型** 标签。

### 卸载

双击 **`orca-plugin\uninstall.bat`**：恢复 `index.html` 备份、删除插件资源、停止本地代理并移除开机启动项。

### Orca 升级后

Orca 升级会覆盖 `index.html` 并清空插件目录，重新双击 `install.bat` 即可。

## 在 Orca 里使用

1. 点左侧栏 **AI 参数化模型**
2. 首次使用点右上角 **设置**：
   - Provider 选 **商汤 SenseNova**（默认）
   - 模型填 `deepseek-flash`
   - API Key 填入你的 Key
   - API 代理地址保持 `http://127.0.0.1:17329/proxy`（安装脚本已启动）
3. 在左侧对话框描述需求，例如「做一个仿瓷器的高足碗」
4. 右侧调参，满意后点 **文件 → 导出 STL / 3MF**

## AI Provider 与 CORS

| Provider | 浏览器直连 | 说明 |
|---|---|---|
| DeepSeek | 可用 | 国内直连，纯文本，价格低 |
| Kimi (Moonshot) | 可用 | 国内直连 |
| MiniMax | 可用 | 国内直连 |
| OpenRouter | 可用 | 一个 Key 聚合多家模型，含视觉模型 |
| Anthropic Claude | 可用 | 自动添加 `anthropic-dangerous-direct-browser-access` 头 |
| 自定义 OpenAI 兼容端点 | 取决于端点 | Ollama / LM Studio / vLLM 等 |
| OpenAI | 需代理 | 官方不建议浏览器直连 |
| 智谱 GLM | 需代理 | 预检 CORS 不通过 |
| 商汤 SenseNova | 需代理 | 预检 CORS 不通过，安装脚本已内置本地代理 |

需要代理时也可以用仓库里的 `proxy/`（Cloudflare Worker 模板）部署到自己的域名，然后在设置里填入代理地址。代理只转发白名单域名，不会变成任意 HTTP 代理。

安装脚本部署的本地代理：

- 监听 `127.0.0.1:17329`，只接受 `POST /proxy`
- 请求体 `{ "url": "https://目标接口", "headers": {...}, "body": "{...}" }`
- 只允许转发到 SenseNova / DeepSeek / OpenRouter / Kimi / MiniMax / GLM / OpenAI / Anthropic
- 不存储 API Key（Key 由浏览器每次请求携带）

## 本地开发

```bash
npm install
npm run dev          # 独立网页开发
npm run build        # 生产构建
npm run preview      # 预览构建产物
npm run typecheck    # tsc --noEmit
npm test             # 单测 + 34 个范例真实引擎编译冒烟
```

不修改 Program Files 的插件验证方式：

```bash
npm run orca:proxy
# 打开 http://127.0.0.1:31001/web/flutter_web/home?locale=zh-CN&dark_model=1
```

## 技术栈

| 层 | 技术 |
|---|---|
| 构建 | Vite 8 + TypeScript |
| 引擎 | `@lofcz/openscad-wasm`（OpenSCAD WASM，Manifold 后端） |
| 编辑器 | CodeMirror 6（自定义 OpenSCAD StreamLanguage） |
| 预览 | Three.js + STLLoader + OrbitControls |
| AI | 浏览器直连多 provider（OpenAI 兼容 / Anthropic 原生） |
| 存储 | localStorage（配置、项目、对话）+ IndexedDB（中文字体） |

## 目录结构

```
ParametricModelMakerPlugin4SM_orca/
├── src/
│   ├── core/                 # types / scad-parser / lint / prompts / examples
│   ├── engine/
│   │   ├── openscad.worker.ts  # WASM 编译 Worker（一次性实例）
│   │   ├── compiler.ts         # 主线程编译 API（超时 / 并发）
│   │   ├── defines.ts          # Customizer 参数 → -D
│   │   └── stl.ts              # 二进制 STL 解析 + 网格摘要
│   ├── viewer/               # Three.js 主预览 + 离屏三视图截图
│   ├── editor/               # CodeMirror + OpenSCAD 语法
│   ├── ai/                   # provider / config / pipeline / verify
│   ├── state/                # Store（源码、参数、编译、对话）
│   ├── storage/              # 项目持久化与下载
│   ├── ui/                   # 布局、对话、参数、范例、设置、批量变体
│   ├── i18n.ts               # 中英文 DOM 翻译（无重载切换）
│   └── styles/app.css
├── proxy/                    # 可选 Cloudflare Worker CORS 代理
├── orca-plugin/              # Orca 侧边栏插件 + 安装 / 卸载 / 开发代理
├── tests/                    # 单测 + 真实 OpenSCAD 范例冒烟
├── index.html
├── vite.config.ts
└── package.json
```

## 实现说明

- **真实引擎替代近似求值器**：验证以 OpenSCAD WASM 的退出码 + STL 网格统计为准，避免「求值器自己验证自己」。
- **参数走 `-D`，不改源码**：参数值与源码解耦；导出 `.scad` 时才把当前值烘焙进去。
- **每次编译新建 WASM 实例**：OpenSCAD 静态状态不支持第二次 `callMain`，所以 Worker 一次性使用，超时直接 `terminate()`。
- **Orca 集成是 DOM overlay，不是官方插件 API**：Orca 的 Flutter 界面是 canvas，没有 DOM 扩展点；插件通过 overlay 标签 + 同源 iframe 实现。iframe 必须带 `credentialless`，否则会被 Orca 的 COEP 拦截。

更细的原理、测量值和故障排查见 [orca-plugin/README.md](orca-plugin/README.md)。

## 已知限制

- **许可证**：OpenSCAD WASM 为 GPL-2.0，本项目整体采用 GPL-2.0-only。
- **WASM 体积**：`openscad.wasm` 约 10.6 MB（gzip 3.4 MB），首次加载需要下载；字体模块按需加载。
- **中文 `text()`**：内置字体不含 CJK；需在设置页上传系统中文字体，并在源码里用 `font="字体族名"` 引用。
- **API Key 明文在浏览器**：纯静态 BYOK 模式的固有风险，本机泄露由用户自行承担；建议只在个人设备使用，不要把带 Key 的页面公开分享，也不要把 Key 写进仓库或截图。
- **Orca 升级**：会覆盖 `index.html`，重跑 `install.bat` 即可。
- **下载**：Orca 内 STL / 3MF 下载走 WebView2 默认策略；若被宿主拦截，需要后续接原生桥接。

## 免责声明

本项目是非官方社区项目，与 Snapmaker 无隶属关系。安装脚本会修改 Orca 安装目录下的 `index.html`（可逆，卸载时恢复备份），请自行评估风险。

## License

GPL-2.0-only。Copyright (C) 2026 VitasGuo。

见 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
