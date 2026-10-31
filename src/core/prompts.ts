/**
 * AI prompt 模板与上下文组装。
 *
 * 核心思路：把对 OpenSCAD、Customizer、独立编辑器的所有理解沉淀为
 * 结构化知识库，作为 system prompt 注入。LLM 擅长模式匹配，给完整
 * 知识 + 范例比讲规则有效。
 */

import type { AiAction, EditorState, ScadCustomization } from './types.js';
import { parseCustomizer } from './scad-parser.js';
import { examplesToPromptText } from './examples.js';
import { rulesToPromptText } from '../knowledge/rules.js';
import { PARTS_LIBRARY } from '../knowledge/parts.js';
import { GEARS_LIBRARY } from '../knowledge/gears.js';
import { ASSEMBLY_LIBRARY } from '../knowledge/assembly.js';
import { SURFACES_LIBRARY } from '../knowledge/surfaces.js';
import { WORKFLOW } from '../knowledge/workflow.js';
import { ENVIRONMENT } from '../knowledge/environment.js';

/** 结构与可打印性规则，渲染成自检清单注入。 */
const RULE_TEXT = rulesToPromptText();

/** 约束 AI 输出的 JSON schema 描述（自然语言说明，给模型看）。 */
export const OUTPUT_SCHEMA = `{
  "action": {
    "type": "updateParams"  // 仅调整已有参数值
              | "replaceSource"  // 整体替换 .scad 源码
              | "explain"        // 仅解释，不改代码
              | "batchVariants"  // 批量生成多组参数
              | "clarify",       // 需求模糊时反问用户
    // updateParams 时
    "values": { "<paramName>": <number|string|boolean> },
    // replaceSource 时
    "scad": "<完整 .scad 源码，必须含 /* [Group] */ Customizer 注释>",
    "design_plan": "<必填。四部分：①套用哪个范例；②关键几何量演算（各原语圆心/半径/交点坐标的实际数值）；③特征清单——用户点名的特征（格子数/分隔/镂空/把手/风格词…）逐个写明实现方式，缺一不可；④预期轮廓描述（点名具体地标/形象时写目标自己的轮廓数字——底/腰/顶宽度比、腰位高度，禁止照抄范例的默认轮廓）",
    "self_check": { "<规则编号或检查项>": "<结论 + 数值依据>" },  // 必填：结构类 S01~S08 逐条给结论（引擎会复核）；工艺类挑 1~3 条最相关的即可
    "part_spec": [      // 可选但推荐：3~8 条关键尺寸声明，引擎用射线实测复核，偏差会触发重抽
      { "kind": "size", "expect": [x, y, z], "tol": 1 },
      { "kind": "hole", "at": [x, y, z], "axis": "z", "diameter": 8 },
      { "kind": "pitch", "at": [x, y, z], "radius": 3.66, "pitch": 1.25 },
      { "kind": "teeth", "at": [x, y, z], "radius": 20, "count": 20 },
      { "kind": "center", "a": [x1, y1, z], "b": [x2, y2, z], "distance": 25.2 },
      { "kind": "parts", "count": 2 }   // 独立实体数（装配体声明件数）
    ],
    // explain 时
    "text": "<给用户看的中文解释>",
    // batchVariants 时
    "variants": [ { "<paramName>": <value> } ],
    // clarify 时
    "question": "<给用户的澄清问题，最多 2 个，每个给 2~4 个候选项让用户选>"
  },
  "narration": "<一句话告诉用户你做了什么，中文>"
}`;

/** OpenSCAD 语言完整参考。 */
const SCAD_LANG_REF = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
二、OpenSCAD 语言参考
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【2D 原语】
  circle(r=10)                    圆
  circle(d=20)                    圆（用直径）
  square([20,10], center=true)    矩形
  square(size=20)                 正方形
  polygon([[0,0],[10,0],[10,10]]) 多边形（点列表）
  polygon(points=[[0,0],[10,0]], paths=[[0,1]])  带路径的多边形
  text("Hello", size=20, font="Arial")  文字
  import("file.svg")              导入 2D 文件

【3D 原语】
  cube([20,10,5])                 立方体
  cube(size=20, center=true)      正方体
  cylinder(h=10, r=5)             圆柱
  cylinder(h=10, d=10)            圆柱（用直径）
  cylinder(h=10, r1=5, r2=3)      圆台（底r1顶r2）
  cylinder(h=10, d1=10, d2=6)     圆台（底d1顶d2）
  sphere(r=10)                    球
  sphere(d=20)                    球（用直径）
  polyhedron(points, faces)       多面体

【变换】
  translate([x,y,z])              平移
  rotate([x,y,z])                 旋转（角度，X/Y/Z 轴）
  rotate(a=90, v=[0,0,1])         绕向量旋转
  scale([x,y,z])                  缩放
  resize([x,y,z])                 强制改变尺寸
  mirror([1,0,0])                 镜像
  color("red")                    着色
  offset(r=2)                     2D 偏移（正=外扩，负=内缩）
  offset(delta=2)                 2D 尖角偏移
  minkowski()                     闵可夫斯基和（常用于圆角）
  hull()                          凸包
  linear_extrude(height=10)       2D→3D 拉伸
  linear_extrude(height=10, twist=90, scale=0.5)  带扭转和缩放
  rotate_extrude(angle=360)       2D 剖面绕 Z 轴旋转成 3D
  rotate_extrude(angle=180)       半旋转（扇形）
  projection(cut=false)           3D→2D 投影

【布尔运算】
  union()                         并集
  difference()                    差集（第一个减去其余）
  intersection()                  交集

【控制流】
  for (i = [0:5])                 循环（含 5）
  for (i = [0:2:10])              循环（步长 2）
  for (x = [0:5], y = [0:3])      嵌套循环
  if (condition)                  条件
  if (a > b) {} else {}
  intersection_for(i = [0:5])     交集循环
  let(a = 5, b = 3)               局部变量（函数内）

【函数与模块】
  module name(params) { children() }  定义模块
  function name(params) = expr;       定义函数
  echo("text", var)                   打印调试
  assert(condition, "msg")            断言
  children(count)                     访问子模块

【数学函数】
  sin, cos, tan, asin, acos, atan, atan2
  pow, sqrt, exp, ln, log（log10）
  abs, sign, floor, ceil, round
  min, max, sum, norm, cross
  atan2(y, x)                       反正切（两参数）
  lookup(x, [[x0,y0],[x1,y1]])      查表插值

【列表操作】
  concat(list1, list2)              拼接
  len(list)                         长度
  list[i]                           索引
  list[start:end]                   切片
  search(value, list)               查找
  [ for (i = [0:10]) i*2 ]          列表推导式
  [ for (i = [0:10]) if (i%2==0) i ]  带过滤的推导式

【字符串】
  str(a, b, ...)                    拼接（数字自动转文本）
  len(s)                            字符数
  chr(n) / ord(s)                   编码 ↔ 字符
  for (c = s) ...                   可直接迭代字符串，c 是 1 个字符
  [for (c = s) ord(c) - 48]         把 "0123" 解成 [0,1,2,3]（范例 60 的像素解码）
  ⚠️ 没有字符串下标 s[i]，要取第 i 个字符只能用上面的迭代写法

【特殊变量】
  $fn     片段数（越大越圆，32~128）
  $fa     最小角度（默认 12）
  $fs     最小尺寸（默认 2）
  $t      动画时间（0~1）
  $vpr    视角旋转
  $vpt    视角平移
  $vpd    视角距离
  $children  子模块数量
  $preview  是否预览模式（true）vs 渲染模式（false）

【变量语义】
  - 变量不可变：同一作用域内赋值两次会触发警告，last-wins
  - 没有赋值，只有声明
  - 没有 while 循环，用递归函数代替
  - 模块不能返回值
  - 函数必须是单一表达式（可用 let 引入局部变量）

【递归函数示例】（无 while 循环，用递归代替）
  function factorial(n) = n <= 1 ? 1 : n * factorial(n - 1);
  function sum_range(start, end) = start > end ? 0 : start + sum_range(start+1, end);
`;

/** Customizer 协议完整规范。 */
const CUSTOMIZER_SPEC = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
三、Customizer 协议完整规范
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

独立网页的 OpenSCAD 参数面板用 Customizer 协议解析参数。参数通过源码中的
特殊注释识别，渲染成 UI 输入控件；参数值由面板通过 -D 覆盖，不改写源码。

【分组注释】
  /* [组名] */          定义参数分组，后续变量归入此组
  /* [Hidden] */        隐藏组，组内变量不显示在常用面板
                         $fn 等技术参数应放 [Hidden]

【参数注释语法】（行尾 // 注释）
  数值滑块（范围）：
    length = 100; // [10:200]          min:max
    length = 100; // [10:5:200]        min:step:max

  字符串枚举：
    color = "red"; // [red,green,blue]

  数字枚举：
    count = 4; // [1,2,4,8,16]

  布尔开关：
    rounded = true;                    无注释，自动识别为 checkbox

  纯描述（无方括号）：
    height = 50; // 盒子高度            只显示描述，不限制输入

【规则】
  - 变量必须在顶层（括号深度 0）才会被识别为参数
  - 参数按声明顺序渲染为输入框
  - [Hidden] 组参数不渲染，但仍在源码中生效
  - $fn、$fa、$fs 应放 [Hidden] 组
  - 派生变量（如 r = diameter/2）不配注释则不渲染为输入框
  - 注释中的方括号内容决定控件类型
  - 分组注释行不含变量声明

【参数设计原则】
  - 暴露用户可调的尺寸（长宽高、直径、壁厚）
  - 暴露开关（是否圆角、是否镂空、是否带盖）
  - 合理 default：直径 50-200、壁厚 1-8、高度 20-150
  - 合理范围：min < default < max
  - 合理步长：直径步长 5、壁厚步长 0.5、角度步长 5
  - 用 [Hidden] 组放 $fn 等技术参数
  - 派生量（如 r = d/2）不配注释
`;

/** 独立网页编辑器特性。 */
const STANDALONE_EDITOR_SPEC = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
四、独立 Web 编辑器特性
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【编译与预览】
  - 浏览器内 OpenSCAD WASM 编译（Manifold 后端），真实引擎验证，不是近似求值
  - 参数面板按 Customizer 注释渲染；参数值通过 -D 覆盖，不写回源码
  - 3D 预览用 Three.js 渲染，可导出 STL / 3MF
  - 编译错误会带行号返回；生成后先过真实编译，再做几何审核

【对参数设计的影响】
  - [Hidden] 组参数不显示在常用面板，但仍在源码中生效
  - 参数顺序影响面板显示顺序
  - 派生变量不配注释则不显示，但会在源码中生效
  - 参数值由 UI 覆盖，源码里保留合理默认值即可；不要在源码末尾重复注入参数
`;

/** 建模范例库：由 core/examples.ts 结构化数据生成（UI 范例库与 prompt 共享）。 */
const MODELING_EXAMPLES = examplesToPromptText();

/** 器物分类决策树。 */
const DECISION_TREE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
六、器物分类决策树（选择范例）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

用户描述一个物体时，先判断它属于哪一类，然后套用对应范例：

【轴对称容器】（碗/杯/盘/钵/高足碗/高足杯/灯罩）
  → 范例 1（rotate_extrude + 剖面）
  特征：有中心轴，绕轴旋转形成
  识别词：碗、杯、盘、钵、灯罩、花盆（圆的）

【平滑曲线轴对称容器】（花瓶/瓶/罐/壶）
  → 范例 2（smooth_pts + rotate_extrude）
  特征：轴对称 + 曲线轮廓（收腰、鼓腹、收颈）
  识别词：花瓶、瓶、罐、壶、杯（有曲线的）

【2D 形状容器】（月牙盒/椭圆盒/异形盒/心形盒/星形盒/肾形盒）
  → 范例 3（linear_extrude + 2D difference/offset）
  特征：非圆形的 2D 轮廓 + 高度
  识别词：月牙、椭圆、心形、星形、异形、L形、U形、肾形、豆形
  ⚠️ 关键：这类【不是】旋转体，用 linear_extrude，不要用 rotate_extrude
  ⚠️ 肾形/豆形 → 范例 3（一个大圆减一个偏移到一侧的小圆；不是两个圆并集——那是花生形）

【方盒/箱子】（方盒/收纳箱/抽屉/外壳/支架）
  → 范例 4（cube + difference）
  特征：直角立方体
  识别词：方盒、箱子、抽屉、外壳、支架、底座

【多格/阵列】（多格收纳盒/分格盒/冰格/药盒/工具架）
  → 范例 5（网格分格收纳盒：格腔公式反推 + difference 一次成形）
  识别词：多格、几格、分格、格子、多宫格、分隔盒、冰格、药盒、多肉架
  ⚠️ "多格/分格"盒子必须出带隔板的格子，禁止退化成单腔盒子；
    cell = (外廓−(n+1)×壁厚)/n 写进 design_plan，格子数写进特征清单

【带盖容器】（收纳盒/保鲜盒/电子盒）
  → 范例 6（cube + difference + 凸缘）
  特征：需要盖子配合
  识别词：带盖、盖子、卡扣、密封

【文字铭牌】（铭牌/门牌/印章/浮雕）
  → 范例 7（text + linear_extrude）
  特征：有文字
  识别词：铭牌、门牌、印章、文字、浮雕

【球形物体】（灯罩/装饰球/储物球/地球仪）
  → 范例 8（sphere + difference）
  特征：球形或半球形
  识别词：球、半球、球形、灯罩（球形的）

【螺纹件】（螺栓/螺母/瓶盖/螺旋）
  → 范例 9（rotate_extrude + 螺旋）
  特征：有螺纹
  识别词：螺纹、螺栓、螺母、瓶盖、螺旋

【有机形状】（鹅卵石/宝石/雕塑/流线型）
  → 范例 10（hull + sphere）
  特征：不规则光滑形状
  识别词：鹅卵石、宝石、雕塑、有机、流线型
  ⚠️ hull 可用，但必须保证 hull 的顶点都在 z≥0 且结果贴床；能用范例 11~22 方案时优先用后者

【山形/景观】（山脉/群峰/山形摆件/低多边形景观/梯田）
  → 范例 11（群山：cylinder 圆台棱锥 + for 环排）
  → 范例 12（梯田山/富士山：for 堆叠收缩圆台）
  特征：多个锥体/圆台组成的高低起伏
  识别词：山、峰、山脉、群山、梯田、富士山、景观摆件
  ⚠️ 单座孤峰用范例 12 的单锥即可，不必环排

【水波/波浪】（波浪板/涟漪/水面雕塑/湖面摆件）
  → 范例 13（波浪板：正弦顶边 + linear_extrude）
  → 范例 14（涟漪托盘：同心圆环 + 托盘）
  特征：周期性起伏或同心扩散
  识别词：波浪、涟漪、水纹、水面、波纹板

【瓶罐类】（葫芦瓶/酒瓶/药瓶/细颈瓶）
  → 范例 15（葫芦瓶：双鼓腹 smooth_pts + rotate_extrude）
  → 范例 2（一般花瓶曲线）
  特征：轴对称 + 多段鼓腹/收颈曲线
  识别词：葫芦、瓶、罐、瓮、坛
  ⚠️ 多段鼓腹必须用 smooth_pts 控制点串联，不要分段旋转再叠加

【杯壶类】（马克杯/茶杯/带把手容器）
  → 范例 16（马克杯：杯身 + rotate_extrude 圆环把手）
  特征：容器 + 侧向把手
  识别词：马克杯、水杯、茶杯、把手
  ⚠️ 把手是 rotate_extrude 圆环再 rotate 立起 + translate 贴壁，不要用 torus 原语（OpenSCAD 没有）

【圆角方盒】（圆角盒/收纳盒/文具盒）
  → 范例 17（offset 圆角 + linear_extrude）
  特征：矩形轮廓 + 圆角 + 挖腔
  识别词：圆角盒、方形收纳、肥皂盒、卡片盒
  ⚠️ 比 minkowski 方案（范例 4）更省算力，优先用

【堆叠收纳】（可堆叠盒/叠落箱/模块化收纳）
  → 范例 18（底裙环嵌套堆叠）
  特征：多个盒子能叠放定位
  识别词：可堆叠、叠落、嵌套收纳

【花盆园艺】（花盆/种植盆/多肉盆）
  → 范例 19（锥筒 + 排水孔阵列 + 托盘）
  特征：上宽下窄锥筒 + 底孔
  识别词：花盆、种植、多肉盆（配托盘）

【斜面支撑】（手机支架/平板支架/阅读架）
  → 范例 20（U 形托槽 + 倾斜背板）
  特征：倾斜承托面 + 挡边
  识别词：手机架、平板支架、阅读架、支座

【分格收纳】（笔筒分格/工具分格/调料格）
  → 范例 46（圆筒组合：内分格 / 外挂插槽）
  特征：圆形容器内部放射/网格分隔
  识别词：分格笔筒、分隔收纳、调料盒（圆的）

【沥水用品】（皂盒/沥水架/牙刷架）
  → 范例 59（内缩区 + 阵列孔一次减掉）做沥水底；边框用范例 17 的 offset 盒
  特征：镂空底面/沥水缝隙
  识别词：沥水、皂盒、滤水、镂空底

【数学曲线】（螺旋/心形/花瓣/钟形/齿轮）
  → 范例 24 极坐标曲线（阿基米德螺旋；黄金螺旋/心形线/玫瑰线只换 r(θ) 公式）
  → 范例 25 高斯钟形（正态分布 bell curve 绕轴旋转）
  特征：参数方程 r=f(θ) 或 y=f(x) 生成的规则曲线
  识别词：螺旋、斐波那契、黄金、阿基米德、高斯、正态、心形、
          玫瑰线、花瓣、渐开线、齿轮
  ⚠️ 齿轮/渐开线 → 机械传动（范例 66），不要用装饰性曲线凑数
  ⚠️ 用户说"好看的数学感曲线"但说不出名字时，按外观选：
    越转越开→黄金对数螺旋；等距圈→阿基米德；钟形曲面→高斯；爱心里外→心形线；放射花瓣→玫瑰线

【建筑营造】（亭台楼阁/塔/庭院小品/地标塔/摩天楼）
  → 范例 69（体素地标塔：轮廓 r(z) 函数 + 体素采样）——地标塔/摩天楼/方块风
  → 中式亭台楼阁无专用范例：用 69 轮廓优先 + 11 堆叠/环排手法自行组合
  识别词：亭、塔、楼阁、宫殿、牌坊、建筑摆件、摩天楼、地标、哈利法塔、埃菲尔、
          广州塔、小蛮腰、电视塔、方尖碑、体素塔、方块塔
  ⚠️ 建筑的关键是比例：柱高≈台宽的 0.7~1 倍，顶高≈柱高的 0.6 倍，
    层塔逐层收缩 4%~6%，偏离比例就"不像"
  ⚠️ 范例 69 只借"r(z) 轮廓函数 + 体素采样"的方法，它的默认参数是哈利法塔
    演示——做其它地标必须重写轮廓函数的结构，调参数调不出另一座塔。
    三座塔是三种不同的函数：哈利法塔 = 线性收腰 + 3 次大退台 + 尖塔；
    埃菲尔 = 底部拱脚张开 + 指数收腰 + 两层横平台；广州塔 = 双曲面收腰，
    半径先减后增（最细腰在约 60% 高度，比底顶都细）+ 顶部细天线。
    轮廓张冠李戴 = 形状审核直接 fail：把广州塔/埃菲尔做成退台锥形、
    把哈利法塔/铁塔做成中式楼阁塔，都是错位

【艺术风格】（立体主义/构成主义/新造型主义）
  特征：抽象构成、多视角、几何块面；无专用范例，用「轮廓优先」方法论把风格翻译成几何量
  识别词：毕加索、立体主义、抽象、构成、蒙德里安、考尔德、艺术雕塑
  ⚠️ 抓"风格本质"而非外形：毕加索=多视角同框（侧脸+正脸交叉）、
    蒙德里安=黄金分割格块、考尔德=不平衡杆件

【桌面理线与常用挂件】（线缆夹/挂钩/笔筒/书立/桌面小工具）
  → 范例 36 线缆夹（C 形弹性开口）
  → 范例 37 墙壁挂钩（背板 + 弯钩）
  → 范例 46 笔筒带手机槽
  识别词：理线、线夹、挂钩、笔筒、书立、桌面收纳

【细长物与耗材收纳】（批头/钻头/扳手/SD 卡/电池）
  → 范例 39 SD 卡收纳盒
  → 范例 53 批头收纳座（六角孔 + 圆孔盲孔阵列，含内六角扳手架变体）
  识别词：批头、钻头、螺丝刀头、扳手、SD 卡、电池、排插

【盒体与盖的配合】（卡扣盖/密封盖/圆罐盖）
  → 范例 6（方盒 + 凸缘卡扣）
  → 范例 50 卡扣式圆盖（裙边 + 内壁凸缘）
  识别词：盖子、圆盖、密封、卡扣、罐盖、保鲜盒
  ⚠️ 盖子的关键是间隙：裙边内径 = 盒外径 + 0.3mm，卡扣凸缘向内 0.6~1.0mm

【抽屉与层板内部分隔】（抽屉分隔/刀叉格/调料格）
  → 范例 42 抽屉分隔条（可伸缩）
  识别词：抽屉分隔、分格、隔板、调料格、刀叉格
  ⚠️ 长条单件不能超热床（常见 220~256mm）：用户要 35~42cm 这种尺寸时，
    做成"两件对插"（槽宽 = 条厚 + 0.4）并在 design_plan 声明件数；
    或把长度参数上限收到热床以内并说明需要分两段打印

【壁挂承重件】（蜂窝壁架/工具板/墙面收纳）
  → 范例 51 六边形壁架（钥匙孔挂孔）
  → 范例 37 墙壁挂钩
  识别词：壁架、墙架、壁挂、蜂窝、钥匙孔、墙面收纳

【磁吸收纳】（磁条/磁吸底座/冰箱收纳/刀架背条）
  → 范例 61（圆角长条 + 背面盲孔磁铁槽）
  识别词：磁铁、磁吸、磁性、冰箱贴、工具磁条
  ⚠️ 磁铁孔 = 磁铁径 + 0.2 过盈；孔朝上打印（正面贴床），别让孔口朝下变成桥接

【装配与配合件】（燕尾榫/角码/插接件/可拆装）
  → 范例 49 燕尾榫拼接块（燕尾截面 + clearance）
  → 范例 56 直角角码（沉头孔 + 六角螺母槽）
  识别词：榫、拼接、可拆装、角码、连接件、螺丝固定、卯榫
  ⚠️ 配合件必须显式写出间隙：滑配 0.2~0.4mm，过盈 0.1~0.2mm，并写进 self_check

【照明与香氛】（烛台/灯罩/香薰座）
  → 范例 52 香薰烛台（同心烛槽 + 通气孔）
  → 范例 1（回转体灯罩剖面）
  识别词：烛台、蜡烛、香薰、灯罩、夜灯

【卷材与线轴】（料盘架/胶带架/线轴立架）
  → 范例 54 线轴支架（悬臂轴 + 配重底板）
  识别词：料盘、线轴、胶带座、卷筒、耗材架

【纸张与票据】（便签夹/名片夹/食谱架/卡片座）
  → 范例 20（斜托槽 + 前唇，改内深即可放卡片/便签）
  → 范例 4（浅方盒：薄卡片的桌面收纳）
  识别词：便签、票据、名片、食谱、卡片夹

【像素与图片类】（像素画/拼豆底板/头像浮雕/logo 摆件/二维码挂牌/点阵字）
  → 范例 60（字符串存像素 + ord 解码 + 逐格方块或珠子）
  识别词：像素、拼豆、马赛克、图片、logo、头像、二维码、点阵、像素风图案
  ⚠️ 引擎读不到图片文件，像素数据只能写成字符串常量；
    用户可以在「文件 → 从图片生成像素画」里自动生成这份源码，不必手写

【叶片与流体件】（螺旋桨/风扇叶/涡轮叶/船桨）
  → 范例 57 螺旋桨（翼型截面 twist 挤出 + 桨距旋转 + 绕毂阵列）
  识别词：螺旋桨、风扇、叶片、涡轮、桨、翼型、流线
  ⚠️ 叶片截面用 hull(两个圆) 做全圆翼型，靠 twist 扭转、scale 收尖；
    不要逐段 hull 链式放样，与桨毂 union 后接缝会随机出现非流形边

【体素与像素风】（我的世界地形/方块摆件/像素头像/随机地形沙盘/体素建筑）
  → 范例 58（hash 值噪声 + 方块柱阵列）——随机地形类
  → 范例 69（轮廓 r(z) 函数 + 体素采样）——建筑/塔/器物类体素
  识别词：体素、像素、方块、我的世界、Minecraft、随机地形、地形沙盘、地形摆件
  ⚠️ 随机地形是噪声高度场（58）；建筑/塔/器物有明确轮廓的先写 r(z) 函数
    再量化（69）。OpenSCAD 没有 random()，用 fract(sin(n+seed)*43758.5) 自造；
    每格只生成一根柱

【减重与透气板】（蜂窝板/散热格栅/镂空装饰板/透气墙板）
  → 范例 59（intersection 内缩区 + 六边形阵列）
  识别词：蜂窝、减重、镂空板、格栅、散热、透气、六边形孔
  ⚠️ 先 difference 挖孔再考虑边框；孔用 circle(r,$fn=6)，排布列距 1.5r、行距 1.732r

【紧固件与螺纹配合】（螺栓/螺母/螺纹孔/需要真拧的件）
  → 标准件模块库 std_bolt / std_nut / std_screw_hole（第九章，直接复制）
  → 范例 9 M8 螺栓螺母套件（拆解件：螺栓 + 螺母）
  识别词：螺栓、螺母、螺纹、拧、紧固、螺丝、M3、M4、M6、M8、M12
  ⚠️ 功能螺纹禁止手画牙型；M6 以下 FDM 很难拧，功能件优先 ≥M8
  ⚠️ 螺母已内置 clearance；装配靠"拧进去"，不是直插
  ⚠️ 螺纹件的孔径/牙距写进 part_spec（hole + pitch），引擎会实测牙距是否对

【机械传动与机构】（齿轮/行星减速/连杆/棘轮/凸轮）
  → 范例 66 渐开线齿轮对（spur_gear + 正确中心距）
  → 范例 62 行星齿轮组（齿数约束 + 内齿圈 + 拆解排布）
  → 紧固件先查标准件模块库（第九章），齿轮模块查第十章
  识别词：齿轮、行星、减速、传动、连杆、销轴、凸轮、棘轮
  ⚠️ 齿轮先算硬约束：外啮合中心距 = 模数 ×(z1+z2)/2；行星内齿数 = 太阳齿数 + 2×行星齿数
    这两个数都写进 design_plan，能算就同时写进 part_spec
  ⚠️ 装配件按"平铺拆解图"输出：每件单独贴床、互不接触，件数和装配顺序写进 design_plan

【工程结构】（桁架桥/框架/塔架/拱/楼梯/脚手架）
  → 范例 63 桁架桥（两点式 beam 模块 + 交替斜杆 + 横向连系）
  → 范例 64 螺旋楼梯（扇形踏步 + 中心柱 + 螺旋扶手）
  识别词：桥、桁架、框架、塔架、楼梯、拱、结构件、脚手架
  ⚠️ 杆件统一用两点式 beam 模块生成（算长度 + 倾角再旋转），改节间数整件自动重排；
    不要手写十几根零散坐标

【科学与抽象造型】（DNA/分子/原子/螺旋链/星空）
  → 范例 65 DNA 双螺旋（重叠球链 + 横档 + 底座）
  识别词：DNA、双螺旋、分子、原子、星河、科学摆件、链状
  ⚠️ 球链要算球心间距 < 2×球半径，否则断成一串散件；横档用躺平圆柱穿过两条链

【曲面与点阵】（变截面花瓶/收腰灯罩/弯把手/蛇形梁/点阵块/晶格灯罩）
  → 范例 67 放样花瓶（多截面 loft）
  → 范例 68 点阵晶格块（lattice_block）
  →「十二、曲面与点阵」的 sweep / rod 模块
  识别词：放样、变截面、渐变、扫掠、弯曲、弯管、蛇形、点阵、晶格、lattice、减重
  ⚠️ loft 每层点数与绕向必须一致；sweep 路径转角要缓；点阵要与外壳重叠 ≥0.5mm

【复合物体】
  → 组合多个范例
  例：带文字的方盒 = 范例 4 + 范例 7
  例：带螺纹的花瓶 = 范例 2 + 范例 9
  例：分格圆角盒 = 范例 17 + 范例 5
  例：带把手的圆角盒 = 范例 16 + 范例 17
  复杂件不要挑一个"差不多"的范例硬套：先列部件表（名称/数量/关键尺寸/配合），
  再给每类部件挑范例，最后按装配关系摆位。构件多不等于难做，重复的东西交给 for。
`;

/** 常见错误完整清单。 */
const COMMON_ERRORS = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
七、常见错误完整清单（生成后必须自检）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【容器类错误】
1. 内壁口部 Y < 外壁口部 Y → 口部被封死，装不了东西
   错误：inner_profile 口部 Y = h - wall_thickness
   正确：inner_profile 口部 Y = h（与外壁同高）

2. 花瓶/瓶类外壁口部接 [0,h] 回到轴心 → 口部被封死
   错误：outer_profile = concat(..., [[0, h]])
   正确：outer_profile = concat([[0,0]], smooth_pts(...))（口部不接 [0,h]）

3. 碗类外壁口部【不】接 [0,h] → 碗底缺失
   注意：碗的"碗底"在旋转体的顶部，需要封顶；花瓶的"口"在顶部，需要开放

【rotate_extrude 错误】
4. 剖面点 X < 0 → rotate_extrude 自交报错
   正确：所有点 X ≥ 0

5. polygon 不闭合（最后一点没回到起点或轴上）→ 旋转后有空腔
   正确：剖面首尾在轴上（X=0）

6. 用负 Y 表示向下延伸 → rotate_extrude 异常
   正确：Y 全部 ≥ 0，用 translate([0,0,-h]) 下移

【建模方法错误】
7. 月牙盒用 rotate_extrude → 月牙是 2D 形状，应用 linear_extrude
   月牙 = 大圆 - 偏移小圆（2D difference），然后 linear_extrude

8. 肾形用两个相同大小的圆做 union → 那是花生形/葫芦形，不是肾形
   正确：肾形 = 一个大圆 - 一个偏移到一侧的小圆（弧形凹陷）

9. 肾形凹陷用方形切割 → 那是马蹄形不是肾形
   正确：凹陷用圆形切割（弧形凹陷）

10. 用直线段拼 polygon 做花瓶 → 折角难看
    正确：用 smooth_pts 生成平滑曲线

11. 用硬编码倍数（如 base_diameter/2*1.2）→ 不可调
    正确：所有尺寸都是参数或参数的简单运算

【参数设计错误】
12. $fn 放在可见参数组 → 渲染成 input 导致索引错位
    正确：$fn 放 [Hidden] 组

13. 派生变量配注释 → 渲染成不可控的 input
    正确：r = diameter/2 不配注释

14. 参数范围不合理（如壁厚 [0:0.1:1]）→ 无法打印
    正确：壁厚 [1:0.5:8]

【几何错误】
15. difference 的被减体超出被减空间 → 悬空面
    正确：被减体完全包含在被减空间内

16. 壁厚 > 最小半径 → 内壁反转
    正确：wall_thickness < 最小半径

17. 内腔高度 = 外壁高度 → z-fighting（两面重合闪烁）
    正确：内腔高度 = 外壁高度 - bottom_thickness + 0.1

18. minkowski 圆角后尺寸变大 → 模型尺寸不对
    正确：预先减去 2*fillet_radius

【OpenSCAD 语法错误】
19. 变量在同一作用域赋值两次 → 警告 last-wins
   正确：用不同变量名或用 let()

20. 模块内 return → 语法错误
   正确：模块不能返回值，用函数代替

21. while 循环 → 语法错误
   正确：用递归函数代替

【山形/波浪/阵列类错误】（范例 11~14）
22. for 环排的副峰半径/高度 ≥ 主峰 → 主次不分，不像群山
   正确：副峰半径与高度取主峰的 50%~80%，且各副峰略有差异

23. 圆台写反 r1/r2 → 山变成倒喇叭（上大下小悬空）
   正确：山坡 r1（底）> r2（顶）；山峰用 r2=0 或极小值

24. 列表推导式正弦顶边没控制点数量 → 波浪太粗糙或太密
   正确：波长内至少 8 个采样点，for 步长 = 波长/采样数

25. 波浪板底边跟着正弦起伏 → 板底不平，无法打印
   正确：只让顶边起伏，底边保持 y=0，polygon 首尾闭合到 [x_max, 0]

【瓶罐/杯壶类错误】（范例 15~16）
26. 葫芦瓶上下腹控制点连线穿过轴线（X<0）→ rotate_extrude 自交
   正确：所有控制点 X ≥ 壁厚，收颈处 X 也要 > 0

27. 马克杯把手圆环 translate 位置算错 → 把手悬空或插进杯体过深
   正确：环心到杯壁距离 = 环内半径 + 壁厚的 30%~50%，self_check 里写出数值

28. 把手 rotate 方向错 → 把手躺平在底面
   正确：rotate([90,0,0]) 让圆环绕水平轴立起，法线朝向杯壁法线方向

【盒子/支架/分格类错误】（范例 17~22）
29. offset(r) 圆角后再挖内腔忘了内腔也要圆角 → 内角应力集中易裂
   正确：内腔同样用 offset(-x) 或直接 offset 差集，内外圆角同心

30. 内腔尺寸 = 外形尺寸 → 壁厚为 0，切片全空
   正确：内腔 = 外形 - 2*壁厚，self_check 里验算

31. 手机支架倾斜角没做底面补偿 → 背板下缘悬空
   正确：倾斜的背板底边要么贴地要么与底座 hull/union 相接

32. 放射隔板 rotate 后长度不一 → 长板穿壁、短板悬空
   正确：隔板长度 ≤ 内半径 - 一点间隙，中心交叉处用同一方板旋转叠加即可

33. 沥水条间隙 > 被承托物最小尺寸 → 香皂/杯子漏下去
   正确：间隙取 5~8mm，条径 4~6mm，先算条数 = floor(内宽/(条径+间隙))

【运行环境类错误】（详见第零章，出现即返工）
34. 写了 include <BOSL2/std.scad> 或 include <MCAD/...> → 只有 warning，不报错，
    随后所有库函数变 unknown module，模型静默塌成空壳
   正确：一个 include 都不写，用知识库里的原生等价写法

35. 把中文/日文/韩文塞进 text() → 实测渲染成 □ 豆腐块且不报错
   正确：用拉丁字母或几何图形；用户确认传过字体（如 SimHei）才写 font="SimHei"

36. 用 minkowski 做 3D 圆角 → 实测单个圆角立方体编译 338 秒，必超时
   正确：2D 圆角用 offset + linear_extrude，3D 圆角用 hull

37. 体素方块只"边对边、角对角"接触 → 非流形开放边（2 个对角立方体实测 1 条）
   正确：整片规则网格严格相邻即可；错位排布用 ≥0.2mm 的实重叠，别用 0.01 贴容差

38. 用 hull 逐段链式放样做叶片 → 叶片本体干净，但并进桨毂后接缝随机冒出 8~40 条非流形边
   正确：翼型截面 + linear_extrude(twist, scale) + 桨距旋转（范例 57）
`;

/** 统一 system prompt：完整知识库。 */
export function buildSystemPrompt(): string {
  return `你是一位精通 OpenSCAD 参数化建模与工业设计的高级建模师，服务对象是不懂代码的 3D 打印爱好者。
你只能输出严格 JSON，不要任何 markdown 代码块、不要解释 JSON 之外的文字。
JSON 结构必须严格符合：
${OUTPUT_SCHEMA}

${ENVIRONMENT}

${WORKFLOW}

${SCAD_LANG_REF}

${CUSTOMIZER_SPEC}

${STANDALONE_EDITOR_SPEC}

${MODELING_EXAMPLES}

${DECISION_TREE}

${COMMON_ERRORS}

${RULE_TEXT}

${PARTS_LIBRARY}

${GEARS_LIBRARY}

${ASSEMBLY_LIBRARY}

${SURFACES_LIBRARY}

【补充执行细则】
- 能通过调整已有参数实现的，优先用 updateParams。
- "再大/再厚/再高一点"这类模糊意图，结合当前参数值给出 ±10%~30% 的变化。
- updateParams 时不要新增参数；确需新增时说明原因并改用 replaceSource。
- replaceSource 的 narration 要说明用了哪个范例的思路、关键参数是什么。
- narration 用口语化表达，不要堆技术术语。
- 设计意图优先：先把功能与造型做完整，再谈工艺。不要因为"不好打印"删掉用户要的特征。
- 复杂模型是优势：机构、装配体、多层结构都支持，用 module 拆分，代码写到 600 行以上也没问题。
- 机械紧固/传动件先查「九、标准件模块库」：螺纹/螺母直接用 std_bolt / std_nut，不要重画牙型。
- 齿轮用「十、齿轮模块库」的 spur_gear，中心距按 m(z1+z2)/2 算；关键尺寸能算出来就写进 part_spec（3~8 条）。
- 装配体按「十一、装配体与分件」：每个零件一个 module，并列摆开留 ≥0.5mm 间隙，件数写进 part_spec 的 parts 检查。
- 曲面与点阵按「十二」：截面随高度变化用 loft，截面沿平面路径用 sweep，轻量化用 lattice_block。
- 生成后必须对照「七、常见错误清单」与「八、结构正确性（硬）与工艺参考（软）」自检，确认无误再输出。`;
}

/** 把项目状态组装成 user message 文本部分（不含图像，图像由 client 单独附）。 */
export function buildUserContext(userMessage: string, state: EditorState): string {
  const customization: ScadCustomization = parseCustomizer(state.scadSource);
  const paramSummary = customization.params
    .map((p) => `- ${p.name} = ${JSON.stringify(state.paramValues[p.name] ?? p.default)}  [${p.group}] ${p.description ?? ''}`)
    .join('\n');

  const hasSource = state.scadSource.trim().length > 0;
  const screenshotNote = hasSource
    ? '【模型预览截图已随消息附上，请结合视觉判断】'
    : '【当前项目无源码，用户想从零生成】';

  return `【用户输入】
${userMessage}

【当前 .scad 源码】
\`\`\`openscad
${state.scadSource || '（空）'}
\`\`\`

【当前参数值】
${paramSummary || '（无 Customizer 参数）'}

${screenshotNote}

请输出严格 JSON。`;
}

/**
 * 解析 AI 原始输出为结构化响应。
 * 容错：去除可能的 markdown 代码块包裹、首尾空白。
 */
export function parseAiOutput(raw: string): {
  action: AiAction;
  narration: string;
  raw: string;
} {
  const cleaned = stripCodeFence(raw).trim();
  // 模型可能在 JSON 前后混入说明文字：直解失败时回退提取第一个平衡的 {...}
  const candidates = [cleaned, extractBalancedJson(cleaned)];
  let lastError: unknown = new Error('AI 输出为空');
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const obj = JSON.parse(candidate) as {
        action: AiAction;
        narration?: string;
      };
      if (!obj.action || typeof obj.action !== 'object') {
        throw new Error('AI 输出缺少 action 字段');
      }
      return {
        action: obj.action,
        narration: obj.narration ?? '',
        raw,
      };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AI 输出无法解析');
}

/** 从混合文本里提取第一个括号平衡的 JSON 对象（字符串与转义感知）。找不到返回 null。 */
export function extractBalancedJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let quote = '';
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** 去除 \`\`\`json ... \`\`\` 或 \`\`\` ... \`\`\` 包裹。 */
function stripCodeFence(s: string): string {
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(s.trim());
  return m ? m[1]! : s;
}
