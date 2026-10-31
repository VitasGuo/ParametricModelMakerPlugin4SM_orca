# Model Lab Web 踩坑记录

编号递增。三段式：现象（错误原文/表现）→ 根因（源码行号/配置项）→ 解决方案（改哪个文件哪个值）。
用 `---` 分隔。

---

## #44 范例库精简 68→50：id 引用残留 + 删空分类后路由指向悬空 ✅ 已修

**现象**
删例必须防两类残留，否则会产生"生成时指向不存在范例"或"分类路由悬空"的隐性 bug：
① 删掉的范例 id 仍被 prompt 决策树、环境章、测试、README 引用；②「建筑营造」
「艺术风格」两个分类在删例后被删空，决策树里的路由指向不存在的范例。

**根因**
范例集中在 `src/core/examples.ts` 单一数据源，但 id 散落引用在
`src/core/prompts.ts` 决策树、`src/knowledge/environment.ts` 齿轮提示、
`tests/examples-real-engine.test.ts` 的 `MULTI_PART_OK`、`tests/prompts.test.ts`
的 `e.id === 3.5 ? '3b'` 特判、`README.md` 的计数处。只删 examples.ts 会留下悬空引用，
而 `tests/prompts.test.ts` 的"每个范例都有条目"断言会为已删的 3.5 生成 `范例 3b：`
的期望字符串，导致测试失败。

**解决方案**
一次扫全 68 个范例 id 引用后同步清理：决策树 11 处路由重写（删空分类改为
「无专用范例，用『轮廓优先』方法论 / 组合其它范例」，建筑营造删 29/30 保留 69，
数学曲线删 23/26/27/28 保留 24+25）；environment.ts 齿轮提示由"参数方程多边形"
改指"第十章 spur_gear（范例 66）"；MULTI_PART_OK 删 40；prompts.test.ts 死代码改
`String(e.id)`；README 计数 68/67 → 50、注入 23 → 21、目录 45 → 29。
回归：typecheck ✓、162 项测试 ✓（50 范例真实引擎编译 + 结构审计）、build ✓。

---

## #43 「多格收纳盒变普通盒」「体素哈利法塔变佛塔」：路由缺失 + 特征无约束 ✅ 已修

**现象**
用户实测两类泛化失败：①「生成一个多格子的收纳盒」→ 出来的是普通单腔盒；
②「生成体素的迪拜哈利法塔」→ 出来一座中式楼阁塔。两者编译、结构审计全部通过，
只有形状不对——机械裁判查不出来，用户完全无法信任生成结果。

**根因**
① 决策树里「多格」条目指向的范例 5 名叫「多肉架」，而"收纳盒"同时命中
方盒/圆角盒/带盖盒多个条目，模型就近套了单腔盒方案；更底层的问题是
`OUTPUT_SCHEMA.design_plan` 只要求"套范例+算数值+描述轮廓"，**没有任何机制
强制模型兑现用户点名的每一个特征**，特征在生成过程中被静默丢弃。
② 决策树「建筑营造」条目里唯一的塔就是范例 30 中式楼阁塔（识别词含"塔"），
模型只能套它 → 哈利法塔变佛塔；体素条目（58）只教了噪声地形，
没有"明确轮廓 → 体素量化"的方法论。
③ 形状审核不核对具体特征，只笼统问"形状是否相符"，漏判后交给用户。

**解决方案**
- `src/core/examples.ts`：范例 5 重做为**网格分格收纳盒**（cell=(外廓−(n+1)×壁厚)/n
  公式反推 + difference 一次成形）并进全文注入；新增**范例 69 体素地标塔**：
  r(z) 轮廓函数（塔身收腰 + 大退台 + 尖塔）→ 逐列采样体素化。
  PROMPT_FULL_IDS 降 54/41/22 为目录，升 5/69 全文，预算守 80k。
- `src/core/prompts.ts` 决策树：多格条目补识词与 ⚠️"禁止退化成单腔盒子"；
  建筑营造并入地标塔/摩天楼（哈利法塔/埃菲尔/广州塔…），
  ⚠️"不要把哈利法塔/铁塔做成中式楼阁塔"；体素条目区分「噪声地形→58」
  与「有明确轮廓→轮廓函数采样 69」。
- `OUTPUT_SCHEMA.design_plan` 强制四部分，新增 ③**特征清单**（点名特征逐个写
  实现方式，缺一不可）；`workflow.ts` 第 1 步插入特征清单环节，新增
  「创意造型：轮廓优先」小节（先定轮廓与比例数字，风格词是后处理）。
- `src/ai/pipeline.ts`：审核员逐项核对特征清单（可数特征要数出来），
  审核失败与机械失败一样带理由进自动修复循环（2 轮），连败才交回用户。

---

## #42 M8 螺纹换成 M4 就废：上千条开放边 + 螺母啮合不上（泛化失败的根因） ✅ 已修

**现象**
用户反馈「范例里的 M8 螺栓能正常生成，改成 M4 生成的代码没法用」。实测把
`std_bolt(8,...)` 换成 `std_bolt(4,...)`：编译 exit=0、运行时验证通过，
但网格有 **1479 条开放边**（M3 1023、M5 577、M6/M10 各 2、M8 0）；
错半牙距装配交集体积只有 **0.297mm³**（M8 为 9.77），螺母基本不啮合。
坏模型全部「验证通过」，用户拿到手才发现不能用。

**根因**
`src/knowledge/parts.ts` 的 `thread_ridge` 是围绕 M8 调的一组**绝对常数**，换规格就失效：
1. 牙宽下限写死 0.8mm（`w = max(axial_width, 0.8)`）：M4 牙距 0.7 < 0.8，
   相邻圈段沿轴向互相穿插，布尔并集退化成千级开放边
2. 间隙 clearance 默认 0.3mm 不随规格缩放：M4 牙深 0.55×0.7 = 0.385mm，
   0.3 间隙吃掉 78% 牙深（M8 只吃 44%），错半牙距交集体积 0.297mm³ ≈ 两根光柱
3. `count = ceil(length/pitch×seg)` 让螺尾半圈骑在芯柱顶面上；螺母刀路棱角
   恰好落在端面上（M6 th=5、M10 th=8 时 (th+P)/step 是二进制精确整数）
4. 运行时 `verify.ts` 只判 exit/空模型/bbox/体积，**不查网格结构**，坏模型全部放行

**解决方案**
`src/knowledge/parts.ts`（所有常数改为随牙距 P 缩放，M8 数值不变）：
- 牙宽 `w = min(max(axial_width, 0.8), 0.64 * pitch)`（M8 恰好 0.8 不变，小牙距被钳进牙距内）
- 间隙缺省 `c = min(0.3, 0.24 * P)`：间隙占牙深比例恒定，全尺寸啮合深度一致；牙宽不再受此影响
- 圈数只留完整圈段 `count = floor((length - w) / step) + 1`，首尾牙不骑端面
- 螺母刀路下移整牙距 P（相位不变，牙距周期）+ 半步长 P/96（刀路棱角远离上/下端面）
- 新增 `std_pitch / std_waf / std_head_h / std_nut_h` 查表：`std_bolt(d, length)` 与
  `std_nut(d)` 只传两个参数，M3~M12 自动取标准牙距与六角外形
`src/ai/verify.ts`：网格结构审计进运行时（见 traps #21 的推广）——开放边 >0、
minZ 埋床/悬空、未声明 parts 的多实体都进 problems，带实测值回灌给模型修复。
`src/engine/mesh-structure.ts`：audit 代码从 tests/helpers 提升为运行时模块，测试与验证共用。
回归：`tests/parts-library.test.ts` M3~M12 全尺寸扫掠（0 开放边、2 件、贴床、
对齐交集 <2.5mm³、错半牙距 > max(aligned×10, 0.5)mm³）全过。

---

## #36 Claude /v1/messages 消息角色不交替或以 assistant 开头，直接 400 ✅ 已修

**现象**
选 Claude provider 后对话几轮必然失败，报错指向 messages 结构；本地 curl 单条请求却正常。

**根因**
`src/ai/pipeline.ts` 把 `history.slice(-10)` 原样送出（首条可能是 assistant）；
reroll 时又在尾部追加 assistant + user，而当前 user 消息由 callClaude 再追加一次——
于是出现 [user(反馈), user(当前消息)] 连续两条 user。Anthropic 对首条非 user / 相邻同角色会 400。

**解决方案**
`src/ai/providers.ts` 的 `normalizeClaudeTurns` 在「history + 当前消息」**拼完之后**统一
合并相邻同角色、丢弃开头 assistant。注意合并顺序：只在 history 上合并不够，
测试（providers.test.ts reroll 用例）会抓出尾部连续 user。`store.aiHistory` 同时过滤空文本 assistant。

---

## #37 本地代理上游响应流没有 error 监听，进程静默崩溃 ✅ 已修

**现象**
浏览器偶发 `TypeError: Failed to fetch`（代理 17329 不再响应）；进程没日志、没恢复，
用户感知是「AI 全部请求失败」，重启 Orca 才恢复。

**根因**
`orca-plugin/local-proxy.mjs` 的 `upstreamRes.pipe(res)` 不转发 error；上游连接中途重置时
未捕获 'error' 事件使 Node 进程退出。另外 `upstream.on('error')` 在响应头已发出后调
`json(res,502)` 会 writeHead 抛 ERR_HTTP_HEADERS_SENT，同样崩。

**解决方案**
- 给 `upstreamRes.on('error')` 加 handler：headersSent 后 `res.destroy()`，否则回 502
- `upstream.on('error')` 前加 headersSent 守卫
- `upstream.setTimeout(60_000, () => upstream.destroy(new Error('Upstream timeout')))` 兜底挂起

---

## #38 参数面板"任一控件聚焦就冻结全部同步" ✅ 已修

**现象**
正在编辑某个滑杆的数字输入框时，AI 的 updateParams 或其它参数变化都不刷新，
整个参数面板停留在旧值直到失焦。

**根因**
`src/ui/params.ts` 的 render 同步循环用模块级 `this.focused` 判断，命中就 `continue` 跳过**全部**
binding，而不是只跳过聚焦的那一个。

**解决方案**
把 focus 记到每个 binding 上（`binding.focusEl`），render 里只 skip
`document.activeElement === binding.focusEl` 的那一个；color/font 文本框补上同样守卫。

---

## #39 中文字体文件名被 `[^\w]` 过滤坍缩成同名，互相覆盖 ✅ 已修

**现象**
上传多个中文名字体（如「黑体.ttf」「宋体.ttf」），先传的字体族消失，`font="黑体"` 编译时找不到。

**根因**
`src/engine/openscad.worker.ts` 的 `sanitizeFileName` 用 `[^\w.\-]` 替换，中文字符全部变 `_`，
不同名字坍缩成同一个 `/fonts/__.ttf`，后者覆盖前者。fontconfig 从文件内容读族名，
文件名只需唯一、不需要 ASCII。

**解决方案**
只过滤路径分隔符与控制字符（`[\\/:*?"<>|\u0000-\u001F]`），保留中文；重名时加 `_N` 序号。

---

## #40 AI 全新生成沿用上个项目的同名旧参数值 ✅ 已修

**现象**
把 size 调到 100 后让 AI 重新生成一个新模型，新源码默认 size=40 却按 100 编译，"感觉 AI 没听话"。

**根因**
`store.replaceSource` 内部调 `setSource`，后者一律 `mergeParamValues` 保留同名旧值。
该语义只该用于"手改源码"，不该用于"整块替换源码"。

**解决方案**
`src/state/store.ts`：`replaceSource`（AI replaceSource / 载入范例 / 图片导入）改用
`valuesFromParams` 重置为默认值；`setSource`（编辑器手改）保持 merge。

---

## #41 项目抽屉闭包捕获打开时刻的快照 ✅ 已修

**现象**
打开「项目」抽屉后继续编辑源码，再点抽屉里的「保存当前项目 / 导出项目 JSON」，
落盘的是抽屉打开那一刻的旧内容。

**根因**
`src/ui/projects.ts` 的 `openProjectsPanel(current, ...)` 按值捕获 ProjectState。

**解决方案**
参数改为 `getCurrent: () => ProjectState`，保存/导出按钮调用时取实时状态；
调用方 `app.ts` 传 `() => this.store.state.project`。

---

## #1 玫瑰线范例 5 瓣在真实 OpenSCAD 中为空模型，本地求值器误判通过 ✅ 已解决

**现象**
插件版 `examples.ts` 的 ex27「玫瑰线杯垫」默认 `petals = 5`：
- `@lofcz/openscad-wasm` 编译 `exit=1`，stderr `ERROR: Current top level object is empty.`，STL 0 字节
- 插件 `examples-smoke`（`scad-eval`）却通过

**根因**
`rose_r = a*cos(k*t)`；k 为奇数时 θ 扫 0→360°，负半径把点翻到对侧，同一花瓣被反向重描，
`polygon(rose_pts)` 点序自重叠、绕数互相抵消。插件本地求值器的 nonzero 填充没有复现绕数抵消。

**解决方案**
`src/core/examples.ts`：`rose_r(a,k,t) = abs(a*cos(k*t))`，并在 `points` 写明原因。
`tests/examples-real-engine.test.ts` 对 34 个范例全部跑真实引擎冒烟，杜绝求值器自证。

---

## #2 OpenSCAD WASM 实例只能 callMain 一次，复用即崩溃 ✅ 已规避

**现象**
同一实例先编译 `cube(10);` 成功，第二次 `callMain` 编译 `sphere(r=10);` 抛 C++ 异常
（abort，整段 emscripten 堆栈），进程退出。

**根因**
OpenSCAD 全局静态状态在 `callMain` 后不复位；`@lofcz/openscad-wasm` 的 d.ts 也注明
"A fresh instance per run is recommended"。

**解决方案**
`src/engine/compiler.ts`：每次编译 `new Worker(...)`，结束/超时 `worker.terminate()`；
Worker 内每次 `createOpenSCAD()`。批量变体用 `compileBatch` 并发池（默认 2）。

---

## #3 浏览器直连 AI API 的 CORS 矩阵 ✅ 已落地

**现象**（浏览器 origin `http://127.0.0.1:8765`，假 Key 实测）

| Provider | 结果 | 说明 |
|---|---|---|
| DeepSeek | 可用 | 401，CORS 头正常 |
| Kimi / MiniMax | 可用 | 401 |
| OpenRouter | 可用 | `/models` 200 |
| Anthropic | 文档支持 | 需 `anthropic-dangerous-direct-browser-access: true` |
| GLM | 不可用 | 预检 OPTIONS 200 但无 ACAO |
| SenseNova | 不可用 | 预检 OPTIONS 404 |
| OpenAI | 需代理 | 本机网络不可达；官方 SDK 默认禁止浏览器 |

**根因**
部分网关只在真实响应加 CORS 头，OPTIONS 不返回 ACAO；各家预检实现不一致。

**解决方案**
`src/ai/providers.ts` 给每个 provider 标 `cors: 'direct' | 'proxy'`；设置页显示提示；
需要代理的 provider 走 `proxyUrl` 通用转发协议。`proxy/worker.js` 是白名单 Cloudflare Worker 模板。

---

## #4 openscad.fonts 体积 7.79MB，且不含中文字体 ✅ 已按需加载

**现象**
- `@lofcz/openscad-wasm/fonts` 解包 7.79MB（内嵌 Liberation 字体 hex）
- `text("你好")` 不挂字体时输出极小/豆腐块 STL（约 3.2KB）
- 把 `simhei.ttf` 写入 `/fonts/` 后 `font="SimHei"` 正常（约 62KB STL）

**根因**
字体以 hex 内嵌进 JS 模块；WASM 内 fontconfig 只扫描 `/fonts`；Liberation 无 CJK。

**解决方案**
`src/engine/openscad.worker.ts`：仅当源码匹配 `/\btext\s*\(/` 时动态
`import('@lofcz/openscad-wasm/fonts')`；请求可带 `fonts` 数组写入 `/fonts`。
`src/storage/fonts.ts` + 设置页提供 `.ttf/.ttc` 上传（IndexedDB 存储，模块级 cache 供编译同步读取）；
源码里用 `font="SimHei"` 这类字体族名引用，文件名不一定是字体族名。

---

## #5 OpenSCAD `-D` 覆盖参数：字符串必须带引号 ✅ 已解决

**现象**
`-D name=green` → `WARNING: Ignoring unknown variable "green"`，变量变 `undef`；
`-D name="green"` 正常。数字/布尔/向量可直接写。

**根因**
`-D` 值按 OpenSCAD 表达式解析，裸字符串被当变量名。

**解决方案**
`src/engine/defines.ts` 的 `serializeDefineValue`：number/boolean 原样，
string 用 `JSON.stringify` 加引号，vector/expression 原样；parser 的 `valueKind` 提供判别依据。
`tests/defines.test.ts` 覆盖 5 种字面量。

---

## #6 Vite 构建把 openscad 包内未使用资产一起 emit，dist 偏大 📌 已知

**现象**
`npm run build` 产物含：
- `openscad.fonts-*.js` 两份（各约 7.79MB）：一份是动态 import，一份是包内 asset map 引用
- `openscad.mcad-*.js` 491KB、`COPYING` 18KB 等未使用资产

**根因**
`@lofcz/openscad-wasm` 的 `openscad.wasm.js` 用 `new URL(Object.assign({...全部文件})[path], import.meta.url)`
建立虚拟文件映射，Vite 会把映射里的所有文件都 emit。

**解决方案**
当前接受（未使用资产不会被浏览器请求）。后续可在构建后脚本里删除确定未引用的
`openscad.fonts-<map hash>.js` / `openscad.mcad-*.js` / `COPYING`，或在 `locateFile` 层绕过 asset map。
删除前必须确认动态 import 的字体 chunk 仍保留。

---

## #7 设置弹窗在 body 未挂载时访问 parentElement 导致 null.style ✅ 已解决

**现象**
点右上角「设置」，弹窗打开但没有 Provider/模型字段，console 报：
`TypeError: Cannot read properties of null (reading 'style')`（settings.ts refreshProviderHints）。

**根因**
`refreshProviderHints()` 在 `modal()` 把 body 插入 DOM 之前调用，
`reasonSelect.parentElement` 还是 null，`!.style.display` 抛错，后续字段构造中断。

**解决方案**
`src/ui/settings.ts`：`refreshProviderHints()` 移到 `modal()` 之后调用；
访问 parentElement 时先判空。浏览器回归已通过。

---

## #8 Web Worker 编译超时/崩溃会留下孤儿实例 📌 约束

**现象**
模型过于复杂或递归函数无限展开时，WASM 可能长时间不返回或 abort，页面无法感知。

**根因**
`callMain` 是同步阻塞，主线程无法中断 Worker 内部执行；WASM abort 有时来不及 postMessage。

**解决方案**
`src/engine/compiler.ts`：25s 超时后 `worker.terminate()` 并 reject `CompileTimeoutError`；
`worker.onerror` / `onmessageerror` 统一转 `CompileCrashError`；UI 捕获后显示中文错误，不阻塞后续编译。

---

## #9 Snapmaker Orca Flutter UI 是 canvas 渲染，没有 DOM 插件 API ✅ 已用 overlay 方案落地

**现象**
Orca 1.8.5 的 `/web/flutter_web/home` 左侧有「模型库 / 我的设备 / 近期文件」三个标签。
浏览器探测：`flt-glass-pane` 存在，但 `flt-semantics` 数量 0、`document.body.innerText` 为空；
`main.dart.js` 是编译后的 Dart，没有 iframe/tab 扩展点；`index.html` 里也没有插件清单。

**根因**
Flutter Web 用 canvas/CanvasKit 绘制整个界面，标签栏不是 DOM 元素，无法通过普通 DOM 查询/点击
或官方插件 API 增加标签。

**解决方案**
`orca-plugin/plugin.js`：在 body 上叠加一个 fixed 定位的「AI 建模」按钮 + 右侧 iframe 面板。
- 尺寸来自截图：侧边栏宽 262 CSS px；前三个标签从 171px 开始、每个 47px；第四个 top=312px、高 47px。
- 点击其它 Orca 标签时通过 `document` 的 `pointerdown` 捕获关闭面板（Flutter canvas 的事件会冒泡到 document）。
- 不改 Flutter JS，只 patch `index.html` 注入 script；Orca 升级后重跑 install.ps1。

---

## #10 Orca 的 COEP 导致 iframe/worker 被 ERR_BLOCKED_BY_RESPONSE ✅ credentialless 解决

**现象**
在 Orca 页面里直接 `<iframe src="/web/model-lab/index.html">`：
- 控制台 `net::ERR_BLOCKED_BY_RESPONSE http://.../web/model-lab/index.html`
- 改用 `srcdoc` 后主 UI 能加载，但 OpenSCAD worker 仍被 `ERR_BLOCKED_BY_RESPONSE` 拦截，编译失败

**根因**
Orca 的 `index.html` 响应带：
`X-Frame-Options: SAMEORIGIN`、`Cross-Origin-Opener-Policy: same-origin`、
`Cross-Origin-Embedder-Policy: credentialless`。iframe 未声明 credentialless 时，COEP 会拦截子文档/worker；
srcdoc 虽然绕过了导航响应头，但 worker 仍受父文档 COEP 约束。

**解决方案**
`orca-plugin/plugin.js` 的 iframe 加 `credentialless` 属性并直接 `src` 加载同源页面：
```html
<iframe credentialless src="/web/model-lab/index.html"></iframe>
```
用 dev-proxy 保留 Orca 原始响应头回归：标签/面板/WASM/worker 全部正常，编译 224ms。
不要用 srcdoc 作为兜底（worker 仍会挂）。

---

## #11 嵌入 853px 宽度触发移动端断点，3D 预览被压扁 ✅ 已修

**现象**
Orca 1115px 窗口减去 262px 侧边栏后，iframe 约 853px。原 CSS 在 `max-width:920px`
切到移动端单栏，DOM 顺序把聊天面板放在 56vh 行、3D 视图放 auto 行，
结果 3D 预览只剩一条细条，参数面板堆在下面。

**根因**
`src/styles/app.css` 的 `@media (max-width:920px)` 使用 `grid-template-rows:56vh auto auto`，
而 DOM 顺序是 chat → viewer → params，viewer 落在 auto 行。

**解决方案**
- 移动端断点 920px → 700px
- 新增 `@media (max-width:980px)` 紧凑三栏：`260px minmax(0,1fr) 230px`
- `orca-plugin/embed-test.html` 以 853×970 iframe 回归：三栏、3D 可见、顶部栏无溢出

---

## #12 Program Files 不可写：非提权 PowerShell 无法 patch index.html ✅ 安装器 UAC 解决

**现象**
直接写 `C:\Program Files\Snapmaker_Orca\resources\web\flutter_web\__write_test.tmp` 报
`访问被拒绝`；ACL 显示 `BUILTIN\Administrators` 对当前进程是 deny-only（UAC 未提权）。

**根因**
Orca 安装在 Program Files，用户进程默认非提权；需要管理员权限才能改 web 资源。

**解决方案**
`orca-plugin/install.ps1`：
- 检测非管理员后用 `Start-Process powershell.exe -Verb RunAs` 自提权并等待
- 安装前备份 `index.html` 为 `index.html.model-lab-backup`（每次未 patch 时都以当前文件重建备份）
- `robocopy dist -> resources\web\model-lab`
- 在 `flutter_bootstrap.js` 前注入 `<script src="/web/model-lab/plugin.js"></script>`
- `uninstall.ps1` 恢复备份并删除 `model-lab` 目录

---

## #13 Orca 升级会覆盖 index.html 和插件资源 📌 约束

**现象**
Orca 升级安装会替换 `resources/web/flutter_web/index.html`，并可能清掉 `resources/web/model-lab/`，
插件标签消失。

**根因**
插件资源写在 Orca 安装目录，而不是用户数据目录；升级程序按自身文件清单覆盖。

**解决方案**
升级后重新运行 `orca-plugin/install.ps1`（脚本会以新的 index.html 重建备份）。
Model Lab 本身更新时需要先 `npm run build`，再重跑安装脚本。卸载脚本始终可恢复当前备份。

---

## #14 Orca 本地静态服务只映射已知顶层目录，/web/model-lab 一直 404 ✅ 已修

**现象**
把 `dist` 复制到 `resources\web\model-lab\`、重启 Orca 后：
`/web/model-lab/plugin.js` 和 `/web/model-lab/index.html` 仍返回 404；
但 `/web/homepage/`、`/web/model/`、`/web/flutter_web/` 正常。

**根因**
Orca 的本地 Web 服务不是对 `resources\web` 做任意目录静态映射，而是按已知顶层目录
（homepage / model / guide / flutter_web / login / orca / preset_bind / include / data 等）注册路由。
新增顶层目录不会自动加入路由表，重启也不生效。

**解决方案**
把插件资源放到已注册的 `flutter_web/` 子目录：
- 目标：`resources\web\flutter_web\model-lab\`
- iframe：`/web/flutter_web/model-lab/index.html`
- 脚本：`/web/flutter_web/model-lab/plugin.js`
- 安装器同时删除早期顶层 `resources\web\model-lab\`，卸载器两条路径都清理
验证：真实 30996 服务返回 plugin 200、app 200（跟随 `?locale=zh-CN` 302），点击标签后 Model Lab 编译成功 116ms。

---

## #15 install.ps1 的 robocopy 参数被空格路径截断，首次安装静默失败 ✅ 已修

**现象**
首次运行 install.ps1：备份文件已生成，但 `resources\web\model-lab\` 不存在、index.html 没有 marker；
UAC 子进程窗口关闭后主进程只返回 0，看不到错误。

**根因**
`Start-Process robocopy.exe -ArgumentList @($Dist, $Dest, ...)` 的数组参数不会自动给含空格的路径
（`C:\Program Files\...`）加引号，robocopy 把 `C:\Program` 和 `Files\...` 当成两个参数，退出码 >=8。

**解决方案**
- 改用 PowerShell 原生 `Copy-Item`：先删除目标目录，再 `Copy-Item (Join-Path $Dist '*') $Dest -Recurse -Force`
- 脚本顶部加 `trap { 打印错误; Read-Host 等待; exit 1 }`，避免提权窗口闪退看不到失败原因
- 重装验证：真实 Program Files 安装成功，重启 Orca 后标签/面板/编译均正常

---

## #16 PowerShell 5.1 读取无 BOM 的 UTF-8 脚本把中文解析成乱码，报"意外的标记" ✅ 已解决

**现象**
`install.ps1` / `uninstall.ps1` 加入中文提示后，`[Parser]::ParseFile` 报
"表达式或语句中包含意外的标记“npm”"、"字符串缺少终止符"，但文件本身没有语法错误。

**根因**
Windows PowerShell 5.1 对 `.ps1` 的默认解码是系统 ANSI 代码页（中文系统为 GBK）。
文件写成 UTF-8 无 BOM 时，中文字符被按 GBK 误解码，字节跨度吞掉了后面的引号/括号。

**解决方案**
- `.ps1` / `.psm1` 一律保存为 **UTF-8 with BOM**（`New-Object System.Text.UTF8Encoding($true)`）
- 修改脚本后用 `[System.Management.Automation.Language.Parser]::ParseFile()` 做语法校验，不要等到运行才发现
- 验证：3 个安装脚本均解析通过

---

## #17 SenseNova Token Plan 会出现瞬时限流 429（rps exhausted）✅ 已加退避重试

**现象**
同一个 Key、同一端点，curl 首次返回 429
`{"error":{"message":"rps exhausted","type":"quota_exceeded_error","code":"8"}}`，
隔几分钟后同样请求返回 200。

**根因**
SenseNova 的 Token Plan 按 RPM/RPS 限流，短时间连续测试会触发
`ModelAccountRpmRateLimitExceeded` / `rps exhausted`；不是 Key 或模型名错误。

**解决方案**
- `src/ai/providers.ts` 的 `postJson` 对 429 / 5xx 最多重试 3 次
- 优先读 `Retry-After`，否则指数退避（1.2s / 2.4s，上限 8s）
- 429 最终失败时保留状态码，UI 显示"请求过于频繁 / 额度用尽"

---

## #18 853px 嵌入宽度下顶栏按钮换行/重叠 ✅ 已修

**现象**
Orca 侧边栏 iframe 内约 853px 宽，原来的「新建 / 打开 / 保存 / 导出」加「范例 / 设置 / 代码」
共 8 个按钮，顶栏放不下，按钮换行并与品牌文字重叠。

**根因**
`.btn` 默认会被 flex 收缩，`.topbar-group` 允许换行；项目名 `min-width:120px` 又不可压缩。

**解决方案**
- 新建 / 打开 / 保存 / 导出合并成单个「文件」下拉菜单（`.menu-wrap`）
- `.btn` 加 `white-space:nowrap; flex-shrink:0`
- ≤980px：隐藏品牌文字只留 `PM` 图标，项目名 `flex:1 1 90px; min-width:70px`，徽章 `max-width:132px` 省略号
- 853px 回归：顶栏无换行、无重叠、无溢出

---

## #19 OpenSCAD 日志 `Status: NoError` 被误判为 error，验证徽章假失败 ✅ 已解决

**现象**
AI 生成成功的模型（编译正常、3D 预览正确、助手消息说已生成），验证徽章却显示
`验证未通过 · [编译] Status: NoError`，并让用户重抽。

**根因**
`openscad.worker.ts` 的 `classifyLogs` 用 `lower.includes('error')` 判定错误；
OpenSCAD 正常结束会打印 `Status: NoError`，子串 `error` 命中，被当成编译错误。
`outcomeFromCompile` 再把任意 error 消息计入 problems，触发验证失败。

**解决方案**
- 抽出 `src/engine/logs.ts`：`Status: NoError` 归入统计噪声，错误判定改为词边界
  `/\berror\b|can't parse|\babort(ed)?\b/i`
- 新增 `tests/logs.test.ts` 覆盖 NoError / 真错误 / 警告 / 噪声
- 验证：单测通过，真实生成徽章恢复正常

---

## #20 本地代理把上游 CORS 头与自身 CORS 头重复返回，浏览器直接 Failed to fetch ✅ 已解决

**现象**
网页里 `GET http://127.0.0.1:17329/health` 正常，但 `POST /proxy` 报
`TypeError: Failed to fetch`，控制台 `net::ERR_FAILED`；同一请求用 curl 却返回 200。

**根因**
SenseNova 上游响应自带 `access-control-allow-origin: *`，`local-proxy.mjs` 又合并了自己的
`Access-Control-Allow-Origin: *`，Node 把两个同名头都发出（大小写不同）。
浏览器按规范只允许一个 ACAO，重复值视为非法 CORS，于是整个响应被丢弃。

**解决方案**
- 转发上游响应时先剔除所有 `access-control-*` 头，再统一附加本地 CORS 头
- 验证：响应头只剩一个 `Access-Control-Allow-Origin: *`，浏览器 POST 返回 200

---

## #21 范例「编译成功且非空」≠ 结构完整：断件、埋床、破面、悬空 ✅ 已修

**现象**
用户反馈部分范例结构不完整。写脚本对全部 48 个范例做 STL 结构分析后发现：
- ex1 高足碗：碗体与足部是 2 个互不相连的实体，且整体最低点 z=-35（全部埋到热床下）
- ex8 镂空球 / ex10 有机形状 / ex25 高斯钟形：模型最低点低于 z=0（一半埋床）
- ex18 可堆叠收纳盒：底部裙环与盒身之间留了 0.4mm 缝，是独立零件；修好后又有 4 条开放边
- ex31 立体主义头像：前脸板一半在床下，底座与头板不相连
- ex37 墙壁挂钩：弯钩与臂/球面相切，产生 4~6 条开放边（破面）
- ex39 SD 卡收纳盒：卡槽多切 0.5~1mm，侧壁只剩 0.5mm
- ex47 XYZ 校准块：中间公差柱正好落在中心通孔里，成为悬空零件

**根因**
原有测试只断言 `exit === 0` 且 STL 非空。OpenSCAD 对「两个实体只在平面相切」「布尔结果非流形」
仍然返回成功，所以断件/埋床/破面全部漏过。

**解决方案**
- 新增 `tests/helpers/mesh-structure.ts`：解析二进制 STL，按顶点合并三角形做并查集，统计
  连通分量、开放边（不是恰好 2 个三角形共享的边）、Z 范围
- `examples-real-engine.test.ts` 增加结构断言：开放边必须为 0；最低点必须在 [-0.1, 0.2]mm；
  除有意多件打印的 ex6（盒+盖）、ex19（盆+托盘）、ex40（4 个杯垫）外，必须是 1 个连通实体
- 逐个修复：隐藏连接柱/整体抬升/裙环内缩 0.5mm 并上移 0.2mm/关节柱包裹/卡槽收短/公差柱避开孔
- 验证：48 个范例全部通过编译 + 结构断言

---

## #22 lint 把「wall_clearance」当壁厚误报过薄，端到端试跑时误伤配合件 ✅ 已修

**现象**
子 agent 端到端试跑产出的卡扣圆盖，`wall_clearance = 0.3; // [0.15:0.6]` 被 lint 判为
「参数 wall_clearance 默认值 0.3mm 过薄（<0.8mm），FDM 打印难以成型」。
该参数是盒体与裙边之间的**装配间隙**，0.3mm 正是正确值，与"壁厚"无关。

**根因**
`src/core/lint.ts` 第 4 条规则用 `/thickness|wall/i` 匹配壁厚参数，
`wall_clearance` 同时命中 `wall`，而间隙类参数本来就该小于 0.8mm。

**解决方案**
- `src/core/lint.ts`：命中壁厚关键字后再排除 `/clearance|gap|tolerance|fit/i`
- `tests/lint.test.ts` 增加用例：`wall_clearance` / `slider_gap` 不再产生 warn
- 命名约定沿用：间隙参数一律带 clearance / gap / tolerance / fit 字样，既自解释又不会被误判

---

## #23 include 第三方库只报 warning，库函数静默变 unknown module ✅ 已写进 prompt

**现象**
把外部案例（ChainMaker、BOSL2 齿轮生成器、螺丝螺母生成器、BULLONE、敲豆豆）原样丢进引擎：
`include <BOSL2/std.scad>` 之后 `cube(10)` 仍能出模型，exit=0；换成 `include <MCAD/boxes.scad>`
+ `roundedBox()` 才 exit=1。也就是说 include 失败**不会报错**，只是后续库函数全都变成
unknown module，几何体悄悄消失。

**根因**
WASM 包只内嵌 Liberation 字体，没有 BOSL2 / MCAD 的 library 目录
（`@lofcz/openscad-wasm` 的 README 提到的 MCAD 扩展实际未随 `addFonts()` 注入）。
OpenSCAD 对找不到的 include 文件按 warning 处理，不是 error。

**解决方案**
- 知识库「零、运行环境与硬限制」明令禁止 include / use，并给等价原生写法
  （圆角 → offset+extrude、齿轮 → 参数方程、阵列 → for 循环）
- 常见错误清单第 34 条；范例 56 的六角螺母槽已改用 `r = S/(2·cos30)` 手算

---

## #24 text() 没有 CJK 字形，汉字静默渲染成 □ ✅ 已写进 prompt

**现象**
`linear_extrude(2) text("你好", size=20)` → exit=0、3284 字节、64 个三角形、2 个连通体；
英文 `text("AB")` 同尺寸是 17484 字节、348 个三角形。64 个三角形正好是两个空心方框，
即 FreeType 的 .notdef 豆腐块，编译不报错。

**根因**
字体包只有 Liberation Sans/Serif/Mono（traps #4），没有 CJK 字形；
`@lofcz/openscad-wasm/fonts` 不会带中文字体。

**解决方案**
- 知识库 0.2：默认不允许把中日韩文字放进 `text()`，改用拉丁字母/数字/几何图形，
  并在 narration 里说明原因
- 用户主动上传字体（`src/storage/fonts.ts` 的 IndexedDB → `/fonts`）后，才写 `font="SimHei"`
- 外部案例「拉链拉片 v17」的 `missing_glyphs()` + 字体 Unicode 区段表思路值得借鉴：
  先查缺字再 assert，比静默出豆腐块好

---

## #25 minkowski + 高 $fn 会把编译拖到分钟级 ✅ 已写进 prompt

**现象**
外部案例「更多的字体」原样编译：exit=0，但耗时 **338,186ms**（5.6 分钟），
文件里只有「一个圆角立方体 + 一行 3D 文字」。

**根因**
`rounded_cube()` 用 `minkowski(cube, sphere(r, $fn=100))`，Minkowski 和的计算量随
面数乘积增长；再加上 `text()` 的三角化，直接爆表。我们 UI 的编译超时是 25s。

**解决方案**
- 知识库 0.3 与常见错误 36：3D 圆角优先 `hull()`，2D 圆角优先 `offset + linear_extrude`
- 单模型实体数上限 200、全局 `$fn ≤ 96` 写进同一章

---

## #26 体素方块"边对边、角对角"接触会产生开放边 ✅ 已写进 prompt

**现象**
`cube(10); translate([10,10,0]) cube(10);`（只共一条竖棱）→ 24 个三角形、**1 条开放边**；
把第二块移到 `[9.99,9.99,0]` 重叠 0.01mm 后 → 32 个三角形、0 开放边。
外部案例「我的世界地形」20×20 网格因此产生 **559 条开放边**。

**根因**
两个立方体只在一条棱上相接时，该棱被 4 个面共用，STL 里不是流形边；
Manifold 的 union 不会替你把"仅共棱"的实体缝起来。

**解决方案**
- 知识库 0.3 / 常见错误 37：**整片规则网格可以严格相邻**（Manifold 会合并共面，
  实测 10×10 共 100 根柱 = 0 开放边）；只有孤立方块对角相接、或错位阵列才需要重叠
- 错位重叠必须 ≥0.2mm。实测给每块加 0.01mm 缩放（体积只重叠 0.01×0.01）反而更糟：
  gap=0 → 0 条；gap=0.01 → 14 条；gap=0.05 → 14 条；gap=0.2 → 0 条
- 第一版规则写的是"统一收缩 0.01mm"，被上面的对照实验推翻，已改正
- S02 反例保留"角对角"这一条

---

## #27 hull 逐段链式放样：叶片本体干净，和桨毂 union 后随机破面 ✅ 改用 twist 挤出

**现象**
照外部 Propeller 案例做"沿展向切片 → 相邻两片 hull → 链成叶片"。
单独编译叶片本体：0 开放边（1336 三角）。
把叶片 union 进桨毂圆柱后，同一份几何会随机冒出开放边，且与步长强相关：

| slice_step | 4 | 6 | 8 | 10 | 12 | 14 | 16 | 20 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 开放边 | 32 | 32 | 0 | 0 | 0 | 16 | 24 | 0 |

换桨叶数、桨长、桨根弦长都会让结果在 0~40 之间跳（3 桨 step=6 → 40，5 桨 step=8 → 8）。
把桨根压深 0.8mm、把桨毂加大到 26mm 都不稳定。

**根因**
原因不在 hull 链本身，而在"圆角翼型侧面 × 圆柱面"的相交几乎相切：
叶片根部的圆角边缘贴着桨毂柱面切出去，布尔运算只留下极薄的楔形碎片，
三角化后退化成非流形边。数值稍微一动，切点位置就变，所以表现为随机。

**解决方案**
- 范例 57 改成 **翼型截面 + linear_extrude(twist, scale) + 桨距旋转**：
  6 组参数（2/3/5 桨、110mm 长桨、细长桨、55° 大扭转）全部 0 开放边
- 知识库常见错误 + 决策树标注"不要逐段 hull 链式放样做叶片"
- 需要非凸（沿展向弯曲）的叶片时不能靠 hull，得上 polyhedron 手工放样

---

## #28 月牙/肾形盒：内腔对"原始尖角轮廓"内缩，尖角处壁厚归零 ✅ 已修

**现象**
范例 3 / 3.5 从渲染上看，弧形凹陷的尖角处像被开了个口子，壁不连续。
网格审计仍是 0 开放边、单连通体——结构检查查不出来。

**根因**
内腔写成 `offset(r = fillet - wall) offset(r = -wall) 原始轮廓`，
在尖角（曲率为负、接近 0° 夹角）处 `offset(-wall)` 会把轮廓切成两半，
内腔因此穿过外壁。外形却是 `offset(+fillet)` 平滑过的，两者的尖角处理不一致。

**解决方案**
先把外轮廓做成 module：`outline() = offset(r=fillet) 原始轮廓`；
内腔改成 `offset(r = -wall) outline()`——对同一个已平滑轮廓内缩，壁厚恒定。

---

## #29 螺纹内缘贴着螺杆芯放，58 条开放边 ✅ 已修

**现象**
范例 9 螺纹重写后（36 段/圈 rotate_extrude 叠螺旋），编译通过、看起来正常，
但网格有 58 条开放边。

**根因**
螺纹剖面内缘半径 = 螺杆芯半径，两个圆柱面完全共面；
布尔并集在共面处只留下零厚度接触，三角化后退化成非流形边。

**解决方案**
剖面内缘向螺杆芯内埋 0.6mm：`[inner_r - 0.6, 0]`。所有"贴面"处都改成实体穿插。

---

## #30 像素浮雕块从底板内部起算，2 级像素几乎看不见 ✅ 已修

**现象**
范例 60 的像素画渲染出来只有一层极浅的网格，看不出图案；
2 级像素只比底板高 0.5mm，肉眼看就是平面。

**根因**
方块写成 `translate([x, y, base_thickness - 0.5]) cube([... , v*layer + 0.5])`。
"露出高度"变成 `v*layer - base + 0.5`，等级越高越被底板吞掉。

**解决方案**
下沉 1mm、高度 `v*layer + 1`：`translate([x, y, base_thickness - 1]) cube([... , v*layer + 1])`
→ 露出高度正好等于 `v × layer`。`src/tools/image-grid.ts` 同步修正。

---

## #31 马克杯把手用整环 rotate_extrude，内圈伸进杯内 ✅ 已修

**现象**
范例 16 的把手看起来只剩壁外一小段，杯内壁还有一圈凸起；
把手顶部和底部不在杯壁上，握不住。

**根因**
`rotate_extrude()` 扫 360° 做整环，环心只埋进杯壁 2mm，
半圈在杯外、半圈直接穿进杯内腔（union 在内腔 difference 之后执行，没被切掉）。

**解决方案**
- `rotate_extrude(angle = 180)` + `rotate([0,0,-90])`，只留向外鼓的半环
- 先 `union(杯身, 把手)`，最后再 `difference` 内腔，伸进杯内的部分会被切掉
- 环径从 32 提到 50，把手高度才够握

---

## #32 手机支架背板用 `rotate([-(90 - tilt)])`，背板几乎平躺 ✅ 已修

**现象**
范例 20 的背板几乎贴着桌面，手机放上去等于没支撑；看起来像一块斜板。

**根因**
参数 `tilt_angle` 的语义是"从竖直向后仰"，但代码按"从水平抬起"来算，
写成 `rotate([-(90 - tilt_angle), 0, 0])`：tilt=18 时实际转了 -72°。

**解决方案**
改成 `rotate([-tilt_angle, 0, 0])`；把"角度从哪根轴量起"写进 params 注释和 design_plan。

---

## #33 渐开线齿轮函数把弧度与度数混算，齿廓炸成散点 ✅ 已修

**现象**
范例 66 的渐开线齿轮编译"成功"，但网格 46864 三角形、7624 条开放边；
`part_spec` 的 teeth 检查在分度圆上数出 40 个齿（声明 20），
r=19 处采样得到 140 个进入点，echo 打印出的轮廓点散在圆周上、连不成齿形。

**根因**
`src/knowledge/gears.ts` 的 `inv_deg` 写成 `(t - atan(t)) * 180 / PI`。
其中 `t = sqrt((r/rb)^2 - 1)` 是**弧度**（= tan α），而 OpenSCAD 的 `atan()` 返回**度数**。
两项单位不同不能直接相减；echo 实测 `inv_deg(20, 18.7939) = -1125.04`，
渐开线角偏移上千度，每个齿的点被甩到完全不同的方位。

**解决方案**
先统一到度数再相减：`function inv_deg(r, rb) = r <= rb ? 0 : let (t = sqrt(...)) t * 180 / PI - atan(t);`
（`atan(t)` 本身已是度数，只把 `t` 转成度数）。
判据：20 齿 m=2 齿轮应为 1392 三角形、`openEdges = 0`、单实体，`part_spec` teeth 检查通过。
同类风险：OpenSCAD 里 `atan/atan2/acos/asin` 全部返回度数，`sin/cos` 接受度数——涉及"弧度×180/PI"的写法都要先确认被转换的是哪个量。

---

## #34 noUncheckedIndexedAccess 下 TypedArray 的下标读写成片报错 ✅ 已修

**现象**
写 `src/core/mesh-parts.ts` 后 `npx tsc --noEmit` 一次报 30+ 条：
`TS2532: Object is possibly 'undefined'`（`if (ax < mins[slot])`、`rank[ra] < rank[rb]`）
与 `TS2322: Type 'number | undefined' is not assignable to type 'number'`（`const min: Vec3 = [mins[slot], ...]`）。

**根因**
tsconfig 开了 `noUncheckedIndexedAccess`：所有下标访问（包括 `Float64Array` / `Int32Array` / `Uint32Array`）
都被推断为 `T | undefined`。复合赋值 `triCounts[part] += 1` 的目标也按读取处理，
而赋值目标又不能写非空断言 `triCounts[part]! += 1`。

**解决方案**
- 纯读取加 `!`：`if (rank[ra]! < rank[rb]!)`、`[mins[slot]!, mins[slot + 1]!, ...]`
- 复合赋值拆成显式读写：`arr[i] = arr[i]! + 1`
- 更省事的写法：用 `Math.min/Math.max` 直接写回，`mins[s] = Math.min(mins[s]!, ax, bx, cx)`

参考：`src/core/mesh-parts.ts` 的 `measureParts` / `union`。

---

## #35 放样花瓶的内层用"整体缩放"，在瓶口处涨出外壁（20 条开放边）✅ 已修

**现象**
新范例 67（放样花瓶，圆角矩形截面 4×5=20 点）编译通过，但 `examples-real-engine.test.ts`
报「ex67 放样花瓶（多截面）有 20 条开放边」，开放边数正好等于单层截面的点数。
单独测试 `loft()` 模块（圆截面 32 点）却是 0 开放边。

**根因**
`src/core/examples.ts` 里内层写成"外层点列统一缩小 2×wall 后整体缩放"：
外层口部 `neck = 0.6`，内层却是在 `z = height` 处由「0.72h 的中间缩放」插值到「height+2 的 neck」，
到瓶口那一层的实际缩放约 `0.611 > 0.6`，内层截面反超外层，差集把外壁切穿，
留下 20 条开放边。

**解决方案**
内层不要整体缩放，改成按每一层的实际外轮廓内缩：
`function inner_pts(f) = round_pts(width*level_scale(f) - 2*wall, depth*level_scale(f) - 2*wall, corner_r*level_scale(f) - wall, n)`；
内层最后一层 `height + 2` 沿用 `height` 的缩放（`inner_pts(min(z, height)/height)`），
保证瓶口以上是直筒、严格位于外层内侧。判据：`openEdges = 0`、单实体、`minZ = 0`。
同类风险：任何"外层/内层各缩放一次"的写法都要检查最薄处（瓶颈、收腰）是否内层反超。

---
