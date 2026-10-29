/**
 * 建模范例库（结构化单一数据源）。
 *
 * 范例集中于此，单一数据源：
 *  - prompts.ts 调 examplesToPromptText() 把范例拼进 system prompt（AI 侧）
 *  - 范例库面板直接 import EXAMPLES 渲染列表，用户可一键载入（用户侧）
 *
 * code 必须是完整可运行、带 Customizer 注释协议的 SCAD。全部范例由真实
 * OpenSCAD WASM 编译 + tests/examples-real-engine.test.ts 结构审计回归。
 */

/** 范例难度层级。 */
export type ExampleLevel = 'basic' | 'classic' | 'advanced';

export interface ModelingExample {
  /** 范例编号（prompt 与 UI 一致）。 */
  id: number;
  /** 短名（UI 列表用）。 */
  name: string;
  /** 分类（UI 过滤 + 决策树映射）。 */
  category: string;
  /** 难度层级：basic 简单 / classic 经典 / advanced 复杂特殊。 */
  level: ExampleLevel;
  /** 适用场景一句话。 */
  applies: string;
  /** 核心思路。 */
  idea: string;
  /** 关键点列表。 */
  points: string[];
  /** 完整可运行 SCAD。 */
  code: string;
}

export const EXAMPLES: ModelingExample[] = [
  {
    id: 1,
    name: '高足碗',
    category: '轴对称容器',
    level: 'classic',
    applies: '碗、杯、高足碗、高足杯、盘、钵等轴对称容器',
    idea: '在 XY 平面画 2D 剖面（X=半径, Y=高度），rotate_extrude 绕 Z 轴扫掠成 3D',
    points: [
      '剖面所有点 X ≥ 0',
      '外壁底部接 [0,0] 封底，外壁口部接 [0,h] 封顶（碗类需要封顶做碗底）',
      '内壁口部 Y = h（与外壁同高，碗口才开放能装东西）',
      '足部单独画剖面，用 translate([0,0,-foot_h]) 下移',
    ],
    code: `/* [碗体] */
bowl_diameter = 120; // [50:5:200]
bowl_height = 50; // [20:5:100]
wall_thickness = 3; // [1:0.5:8]

/* [高足] */
foot_diameter = 40; // [20:5:80]
foot_height = 35; // [10:5:80]

/* [Hidden] */
$fn = 64;

bowl_r = bowl_diameter / 2;
foot_r = foot_diameter / 2;

// 碗外壁剖面（底部Y=0，口部Y=bowl_height，碗口朝上口大底小）
bowl_outer = [
  [0, 0],
  [foot_r, 0],
  [foot_r, 5],
  [bowl_r, bowl_height],
  [0, bowl_height]
];

// 碗内壁剖面（口部 Y = bowl_height，与外壁同高 → 碗口完全开放）
bowl_inner = [
  [0, wall_thickness],
  [foot_r - wall_thickness, wall_thickness],
  [foot_r - wall_thickness, 5],
  [bowl_r - wall_thickness, bowl_height],
  [0, bowl_height]
];

// 足部剖面（Y 全部 ≥ 0，旋转后用 translate 下移到碗底下方）
foot_profile = [
  [0, 0],
  [foot_r, 0],
  [foot_r, foot_height],
  [foot_r - 3, foot_height],
  [foot_r - 3, foot_height - 2],
  [0, foot_height - 2]
];

// 整体抬到热床上：足底 z=0，足顶与碗底重叠 1mm（避免只共面导致两段分离）
translate([0, 0, foot_height - 1])
  difference() {
    union() {
      rotate_extrude() polygon(bowl_outer);
      translate([0, 0, 1 - foot_height]) rotate_extrude() polygon(foot_profile);
      // 隐藏连接柱：跨过足顶(z=1)与碗底(z=0)，确保两段在布尔运算后是同一实体
      translate([0, 0, -1]) cylinder(h = 4, r = foot_r - 1);
    }
    rotate_extrude() polygon(bowl_inner);
  }
`,
  },
  {
    id: 2,
    name: '平滑曲线花瓶',
    category: '轴对称容器',
    level: 'classic',
    applies: '花瓶、瓶、罐等需要平滑曲线轮廓的轴对称容器',
    idea: '用余弦插值函数在控制点之间生成平滑曲线，避免直线段拼接的折角',
    points: [
      '用 smooth_pts 自动生成平滑剖面点；注意它不含每段终点，末段终点要手动补',
      '外壁口部必须显式接 [0,h] 封顶——polygon 会把首尾隐式闭合，不接 [0,h] 会产生"口沿直切轴心底部"的斜边，把瓶子上半部削掉',
      '内壁同高接 [0,h]，difference 挖开顶盖形成瓶口',
      '外壁底部接 [0,0] 封底（闭合边沿轴心，旋转后无体积）',
    ],
    code: `/* [主体尺寸] */
vase_height = 150; // [50:5:250]
base_diameter = 60; // [30:5:120]
belly_diameter = 90; // [40:5:140]
neck_diameter = 45; // [20:5:80]
rim_diameter = 55; // [25:5:90]
wall_thickness = 3; // [1:0.5:8]

/* [细节] */
curve_smoothness = 12; // [6:2:24]

/* [Hidden] */
$fn = 64;

function csmooth(a, b, t) = a + (b - a) * (1 - cos(180 * t)) / 2;
function lerp(a, b, t) = a + (b - a) * t;
function smooth_pts(pts, steps) = [
  for (i = [0 : len(pts)-2])
    for (s = [0 : steps-1])
      [csmooth(pts[i][0], pts[i+1][0], s/steps), lerp(pts[i][1], pts[i+1][1], s/steps)]
];

base_r = base_diameter / 2;
belly_r = belly_diameter / 2;
neck_r = neck_diameter / 2;
rim_r = rim_diameter / 2;

// 外壁控制点（从底到口）
outer_pts = [
  [base_r, 0],
  [base_r, 10],
  [belly_r, vase_height * 0.55],
  [neck_r, vase_height * 0.85],
  [rim_r, vase_height]
];
// 外壁剖面：底部接 [0,0]，口部补末段终点 [rim_r,h] 后接 [0,h] 封顶
// （若不接 [0,h]，polygon 隐式闭合边会从口沿斜切回 [0,0]，削掉瓶身上半部）
outer_profile = concat(
  [[0, 0]],
  smooth_pts(outer_pts, curve_smoothness),
  [[rim_r, vase_height], [0, vase_height]]
);

// 内壁控制点（半径减壁厚，口部同高接 [0,h]，difference 挖开顶盖成瓶口）
inner_pts = [
  [base_r - wall_thickness, wall_thickness],
  [base_r - wall_thickness, 10 + wall_thickness],
  [belly_r - wall_thickness, vase_height * 0.55 + wall_thickness],
  [neck_r - wall_thickness, vase_height * 0.85 + wall_thickness],
  [rim_r - wall_thickness, vase_height]
];
inner_profile = concat(
  [[0, wall_thickness]],
  smooth_pts(inner_pts, curve_smoothness),
  [[rim_r - wall_thickness, vase_height], [0, vase_height]]
);

difference() {
  rotate_extrude() polygon(outer_profile);
  rotate_extrude() polygon(inner_profile);
}
`,
  },
  {
    id: 3,
    name: '月牙形收纳盒',
    category: '2D 轮廓器物',
    level: 'basic',
    applies: '收纳盒、托盘、非圆形容器、任何"2D 轮廓 + 高度"的物体',
    idea: '先在 XY 平面画 2D 轮廓（用 circle / square / polygon / difference），再用 linear_extrude 拉伸到 3D 高度',
    points: [
      '月牙 = 大圆 - 偏移的小圆（2D difference）',
      '外盒 = linear_extrude(月牙轮廓)',
      '内腔 = linear_extrude(缩小的月牙轮廓)，向上偏移 bottom_thickness',
      '月牙角度由两圆偏移量控制，不是 rotate_extrude 的角度',
      '月牙是 2D 形状拉伸，【不是】rotate_extrude 旋转体',
      'length 通过 X 向缩放实现，默认外形 120×80',
    ],
    code: `/* [主体尺寸] */
length = 120; // [60:5:200]
width = 80; // [40:5:150]
height = 40; // [20:5:80]
wall_thickness = 2; // [1:0.5:6]
bottom_thickness = 3; // [1:0.5:8]

/* [月牙形状] */
crescent_offset = 0.3; // [0.1:0.05:0.5]

/* [细节] */
fillet_radius = 3; // [1:0.5:8]

/* [Hidden] */
$fn = 64;

outer_r = width / 2;
offset_x = outer_r * crescent_offset;
inner_r = outer_r - offset_x * 0.3;

module crescent_2d(r_out, r_in, off) {
  difference() {
    circle(r = r_out);
    translate([off, 0, 0]) circle(r = r_in);
  }
}

// 外轮廓：先做圆角，内腔再从这个"已圆角"的轮廓整体内缩
module outline() {
  offset(r = fillet_radius) crescent_2d(outer_r, inner_r, offset_x);
}

module box_outer() {
  linear_extrude(height = height) outline();
}

module box_inner() {
  translate([0, 0, bottom_thickness])
    linear_extrude(height = height - bottom_thickness + 0.1)
      offset(r = -wall_thickness) outline();
}

// length 用 X 向缩放实现：外形长宽 = length × width（默认 120 × 80）
scale([length / width, 1, 1])
  difference() {
    box_outer();
    box_inner();
  }
`,
  },
  {
    id: 3.5,
    name: '肾形收纳盒',
    category: '2D 轮廓器物',
    level: 'basic',
    applies: '肾形、豆形、任何一侧有弧形凹陷的 2D 轮廓容器',
    idea: '一个大圆减去一个偏移的圆，形成一侧的弧形凹陷',
    points: [
      '肾形【不是】两个相同大小的圆做 union（那是花生形）',
      '肾形 = 一个大圆 - 一个偏移到一侧的小圆（弧形凹陷）',
      '凹陷是弧形的，不是方形的（方形凹陷是马蹄形不是肾形）',
    ],
    code: `/* [主体尺寸] */
length = 100; // [60:5:200]
width = 70; // [40:5:150]
height = 35; // [20:5:80]
wall_thickness = 2; // [1:0.5:6]
bottom_thickness = 3; // [1:0.5:8]

/* [肾形凹陷] */
indent_depth = 15; // [5:1:40]
indent_radius = 25; // [10:1:50]

/* [细节] */
fillet_radius = 3; // [1:0.5:8]

/* [Hidden] */
$fn = 64;

outer_r = width / 2;
// 凹陷圆：半径比主圆小，中心偏移到一侧形成弧形凹陷
indent_r = indent_radius;
indent_offset_x = outer_r - indent_depth + indent_r * 0.3;

module kidney_2d(r_out, r_in, off_x) {
  difference() {
    circle(r = r_out);
    translate([off_x, 0]) circle(r = r_in);
  }
}

// 外轮廓先圆角；内腔从同一轮廓整体内缩，凹陷处才不会把壁挖穿
module outline() {
  offset(r = fillet_radius) kidney_2d(outer_r, indent_r, indent_offset_x);
}

module box_outer() {
  linear_extrude(height = height) outline();
}

module box_inner() {
  translate([0, 0, bottom_thickness])
    linear_extrude(height = height - bottom_thickness + 0.1)
      offset(r = -wall_thickness) outline();
}

difference() {
  box_outer();
  box_inner();
}
`,
  },
  {
    id: 4,
    name: '方盒（直角厚壁）',
    category: '盒体收纳',
    level: 'basic',
    applies: '方盒、收纳箱、抽屉、外壳、支架；要圆角就直接用范例 17',
    idea: '外立方体减去内腔立方体：内腔从底厚之上开始、四周留墙、向上多挖 0.1 保证开顶',
    points: [
      '内腔 = 外形 - 2×wall，墙厚参数用 min() 夹住，极端取值不会把侧壁挖穿',
      '内腔只从 z = bottom_thickness 起，底部是实心板，不会成漏斗',
      '内腔顶面多挖 0.1mm，保证开口处不留一层薄膜',
      '要做圆角别用 minkowski（会膨胀尺寸、拐角壁厚变薄），改用范例 17 的 offset 方案',
    ],
    code: `/* [主体尺寸] */
length = 100; // [40:5:200]
width = 80; // [30:5:150]
height = 50; // [20:5:100]
wall_thickness = 2.5; // [1:0.5:6]
bottom_thickness = 3; // [1:0.5:8]

/* [Hidden] */
$fn = 32;

// 参数收敛：壁厚不能超过短边一半，底厚不能吃掉整个高度
wall = min(wall_thickness, min(length, width) / 2 - 1);
bottom = min(bottom_thickness, height - 1);

difference() {
  cube([length, width, height]);
  translate([wall, wall, bottom])
    cube([length - 2*wall, width - 2*wall, height - bottom + 0.1]);
}
`,
  },
  {
    id: 5,
    name: '多肉架（重复阵列）',
    category: '盒体收纳',
    level: 'basic',
    applies: '多格架、阵列孔、齿轮齿、栅栏、任何重复结构',
    idea: 'for 循环生成多个子模块，用 translate/rotate 定位',
    points: [
      '演算：cell_l = (length - (cols+1)*wall) / cols，行列同理',
      '每格从底厚之上开始挖，+1 上溢保证挖穿',
    ],
    code: `/* [主体尺寸] */
length = 150; // [60:5:300]
width = 80; // [30:5:150]
height = 40; // [20:5:80]

/* [格子] */
cols = 3; // [1:1:6]
rows = 2; // [1:1:4]
wall_thickness = 2; // [1:0.5:6]

/* [Hidden] */
$fn = 32;

cell_l = (length - (cols + 1) * wall_thickness) / cols;
cell_w = (width - (rows + 1) * wall_thickness) / rows;

difference() {
  cube([length, width, height]);
  for (i = [0 : cols - 1], j = [0 : rows - 1]) {
    translate([
      wall_thickness + i * (cell_l + wall_thickness),
      wall_thickness + j * (cell_w + wall_thickness),
      wall_thickness
    ])
      cube([cell_l, cell_w, height - wall_thickness + 1]);
  }
}
`,
  },
  {
    id: 6,
    name: '卡扣收纳盒',
    category: '盒体收纳',
    level: 'classic',
    applies: '带盖收纳盒、保鲜盒、电子元件盒',
    idea: '盒身顶部留凸缘，盖子底部留凹槽，两者卡扣配合',
    points: [
      '盒身凸缘是顶部外扩的"环"，中间必须留空，否则盒子被封死',
      '盖子凹槽向内凹陷',
      '凸缘和凹槽尺寸精确配合',
    ],
    code: `/* [主体尺寸] */
length = 80; // [40:5:200]
width = 60; // [30:5:150]
height = 40; // [20:5:100]
wall_thickness = 2; // [1:0.5:6]
bottom_thickness = 2; // [1:0.5:6]

/* [盖子] */
lid_height = 8; // [5:1:20]
lid_gap = 0.3; // [0.1:0.05:0.8]

/* [Hidden] */
$fn = 32;

module box_body() {
  difference() {
    cube([length, width, height]);
    translate([wall_thickness, wall_thickness, bottom_thickness])
      cube([length - 2*wall_thickness, width - 2*wall_thickness, height]);
  }
  // 凸缘：顶部外扩的环（中间留空，盒子仍能装东西）
  translate([-lid_gap, -lid_gap, height - 2])
    difference() {
      cube([length + 2*lid_gap, width + 2*lid_gap, 2]);
      translate([lid_gap, lid_gap, -0.5])
        cube([length, width, 3]);
    }
}

module lid() {
  translate([0, width + 10, 0])
    difference() {
      cube([length + 2*lid_gap, width + 2*lid_gap, lid_height]);
      translate([1, 1, 2])
        cube([length + 2*lid_gap - 2, width + 2*lid_gap - 2, lid_height]);
    }
}

box_body();
lid();
`,
  },
  {
    id: 7,
    name: '文字铭牌',
    category: '文字铭牌',
    level: 'basic',
    applies: '铭牌、门牌、印章、浮雕文字',
    idea: '用 text() 生成 2D 文字，linear_extrude 拉伸成 3D',
    points: [
      'text() 是 2D 原语，必须 linear_extrude 或投影后才能变 3D',
      '不写 font 就用引擎默认的 Liberation Sans，最稳；写别的字体名可能找不到',
      '引擎内置字体没有中文字形，中文会渲染成方框——要中文必须先上传系统字体',
      'halign/valign 控制对齐；文字基准面放在底板上表面，两者才会连成一体',
    ],
    code: `/* [铭牌] */
length = 100; // [40:5:300]
width = 40; // [20:5:100]
thickness = 3; // [1:0.5:10]

/* [文字] */
text_content = "Hello"; // 仅拉丁字符（中文需先上传字体）
text_size = 20; // [10:1:50]
text_depth = 2; // [0.5:0.1:5]

/* [Hidden] */
$fn = 32;

// 底板
cube([length, width, thickness]);

// 文字（居中，底面贴底板顶面）
translate([length/2, width/2, thickness])
  linear_extrude(height = text_depth)
    text(text_content, size = text_size,
         halign = "center", valign = "center");
`,
  },
  {
    id: 8,
    name: '镂空球',
    category: '球体与螺纹',
    level: 'basic',
    applies: '球形灯罩、镂空球、装饰球、储物球',
    idea: '外球 - 内球，内球半径减壁厚',
    points: [
      '球形需要顶部开口时，用 difference 切掉一部分',
      '$fn 影响球面平滑度',
    ],
    code: `/* [球体] */
outer_diameter = 80; // [30:5:200]
wall_thickness = 3; // [1:0.5:8]

/* [开口] */
opening_angle = 90; // [0:5:180]

/* [Hidden] */
$fn = 64;

outer_r = outer_diameter / 2;
inner_r = outer_r - wall_thickness;

// 球心原本在原点会有一半埋到热床下，整体抬高一个半径
translate([0, 0, outer_r])
  difference() {
    sphere(r = outer_r);
    sphere(r = inner_r);
    // 开口：切掉顶部球冠。切割立方体必须【从开口平面向上】延伸，
    // 不能 center=true 居中——居中会把下半也盖住，整个球被切没
    if (opening_angle > 0) {
      opening_z = outer_r * cos(opening_angle / 2);
      translate([-outer_r * 1.1, -outer_r * 1.1, opening_z])
        cube([outer_r * 2.2, outer_r * 2.2, outer_r * 2]);
    }
  }
`,
  },
  {
    id: 9,
    name: '螺旋螺纹螺栓',
    category: '球体与螺纹',
    level: 'advanced',
    applies: '螺纹件、螺母、螺栓、瓶盖、需要真实螺旋升角的结构',
    idea: '把螺纹剖面（径向×轴向的矩形）用 rotate_extrude 切成 10° 小段，每段转 10°、升高 pitch/36，逐段叠成一个真实的螺旋牙；下面是六角螺栓头，中心是螺杆芯',
    points: [
      '螺纹是"小段旋转 + 逐段抬升"的螺旋：seg_angle = 360/36，seg_lift = pitch/36',
      '每段 rotate_extrude 多扫 12%，段与段在角度上重叠，接缝不会出现缺口',
      '牙高 thread_height 要小于 pitch，否则相邻两圈会粘在一起，看着就是个柱子',
      '牙顶到牙底 thread_depth 决定螺纹多"咬"进螺杆芯；螺杆芯半径 = 外半径 - 牙深',
      '螺栓头用 $fn=6 的圆柱，天然六角；它同时是整件贴床的底面',
    ],
    code: `/* [螺栓] */
outer_diameter = 20; // [10:1:50]
pitch = 3; // [1:0.5:10]
turns = 5; // [2:1:20]
thread_depth = 1.5; // [0.5:0.1:3]
thread_height = 1.5; // [0.8:0.1:3]

/* [螺栓头] */
head_height = 8; // [5:1:20]

/* [Hidden] */
$fn = 48;
seg_per_turn = 36;
seg_angle = 360 / seg_per_turn;
seg_lift = pitch / seg_per_turn;

outer_r = outer_diameter / 2;
inner_r = outer_r - thread_depth;
thread_len = turns * pitch;

// 螺纹剖面（径向 × 轴向的矩形），绕 Z 扫一小段
// 内缘故意埋进螺杆芯 0.6mm：贴着圆柱面放会产生共面破面
module thread_segment() {
  rotate_extrude(angle = seg_angle * 1.12)
    polygon(points = [
      [inner_r - 0.6, 0],
      [outer_r, 0],
      [outer_r, thread_height],
      [inner_r - 0.6, thread_height]
    ]);
}

module thread() {
  for (i = [0 : turns * seg_per_turn - 1])
    rotate([0, 0, i * seg_angle])
      translate([0, 0, i * seg_lift])
        thread_segment();
}

union() {
  // 六角螺栓头（贴床）
  cylinder(h = head_height, r = outer_r + 2, $fn = 6);
  // 螺杆芯
  translate([0, 0, head_height])
    cylinder(h = thread_len + 1, r = inner_r);
  // 螺旋牙
  translate([0, 0, head_height])
    thread();
}
`,
  },
  {
    id: 10,
    name: '有机形状（hull 凸包）',
    category: '有机造型',
    level: 'classic',
    applies: '有机形状、流线型、鹅卵石、宝石、抽象雕塑',
    idea: '用 hull() 包裹多个球体，形成光滑凸面体',
    points: [
      'hull 自动生成凸包',
      '球体位置决定形状，球体大小影响平滑度',
    ],
    code: `/* [形状] */
size = 40; // [20:5:100]
stretch = 1.5; // [1:0.1:3]
flatness = 0.6; // [0.3:0.05:1]

/* [细节] */
smoothness = 32; // [16:4:64]

/* [Hidden] */
$fn = smoothness;

module organic_shape() {
  hull() {
    // 顶部
    translate([0, 0, size * stretch]) sphere(r = size * 0.4);
    // 中部四周
    for (a = [0 : 90 : 270])
      rotate([0, 0, a])
        translate([size * 0.7, 0, 0]) sphere(r = size * 0.5);
    // 底部
    translate([0, 0, -size * stretch * flatness]) sphere(r = size * 0.4);
  }
}

// 球体凸包最低点会低于 z=0，整体抬高到热床（留 0.1mm 补偿多面体逼近误差）
bottom_extent = max(size * 0.5, size * stretch * flatness + size * 0.4) - 0.1;
translate([0, 0, bottom_extent]) organic_shape();
`,
  },
  {
    id: 11,
    name: '低多边形群山摆件',
    category: '山水景观',
    level: 'advanced',
    applies: '山脉、群峰、山形摆件、低多边形景观',
    idea: '圆台（r1 > r2）就是山坡；$fn 取 5~6 在真引擎里渲染成棱锥，形成低多边形风格。主峰居中、副峰沿椭圆环排，峰径由底座尺寸反推，绝不超出底板',
    points: [
      '峰底半径必须由底座反推：main_r ≤ min(底长, 底宽)/2 - 4，否则山脚悬空到底板外面',
      '副峰中心排在一个椭圆上，椭圆的 rx / ry 也要扣掉副峰半径，四角不会越界',
      '山 = 岩体圆台 + 雪顶锥体（两层圆柱叠放），雪顶从 %(1-snow_ratio) 高度起',
      '所有山峰从底座顶面 (z = base_height) 起，和底板实体重叠',
    ],
    code: `/* [底座] */
base_length = 120; // [60:5:250]
base_width = 80; // [40:5:150]
base_height = 5; // [3:1:12]

/* [山峰] */
main_height = 70; // [30:5:160]
side_height = 40; // [15:5:100]
side_count = 4; // [0:1:8]
snow_ratio = 0.25; // [0.1:0.05:0.5]

/* [Hidden] */
$fn = 5;

// 峰径由底座反推：保证整个山脚都落在底板以内
main_r = min(main_height * 0.55, min(base_length, base_width) / 2 - 4);
side_r = min(side_height * 0.55, min(base_length, base_width) / 2 - 6);
ring_rx = max(0, base_length / 2 - side_r - 4);
ring_ry = max(0, base_width / 2 - side_r - 4);

module mountain(h, r) {
  cylinder(h = h * (1 - snow_ratio), r1 = r, r2 = r * snow_ratio * 1.2);
  translate([0, 0, h * (1 - snow_ratio)])
    cylinder(h = h * snow_ratio, r1 = r * snow_ratio * 1.2, r2 = 0);
}

union() {
  cube([base_length, base_width, base_height]);
  translate([base_length / 2, base_width / 2, base_height])
    mountain(main_height, main_r);
  if (side_count > 0)
    for (i = [0 : side_count - 1]) {
      angle = i * 360 / side_count;
      translate([base_length / 2 + ring_rx * cos(angle),
                 base_width / 2 + ring_ry * sin(angle),
                 base_height])
        mountain(side_height, side_r);
    }
}
`,
  },
  {
    id: 12,
    name: '层叠梯田山（富士山式）',
    category: '山水景观',
    level: 'classic',
    applies: '梯田山、富士山、蛋糕山、分层装饰山',
    idea: 'for 循环从下到上堆圆台，直径线性收缩，顶部平台 + 火山口凹陷',
    points: [
      '每层 +0.01 重叠量避免 z-fighting',
      '火山口 = 顶部 difference 下凹小圆柱',
      '演算：第 i 层直径 d = base + (top - base) * (i+1) / layers',
    ],
    code: `/* [山体] */
base_diameter = 100; // [50:5:200]
total_height = 60; // [30:5:120]
layers = 8; // [4:1:16]

/* [火山口] */
crater_diameter = 18; // [6:2:40]
crater_depth = 6; // [2:1:15]

/* [Hidden] */
$fn = 48;

layer_h = total_height / layers;
top_d = base_diameter * 0.25;

difference() {
  union() {
    for (i = [0 : layers - 1]) {
      d = base_diameter + (top_d - base_diameter) * (i + 1) / layers;
      translate([0, 0, i * layer_h])
        cylinder(h = layer_h + 0.01, d = d);
    }
  }
  translate([0, 0, total_height - crater_depth])
    cylinder(h = crater_depth + 1, d = crater_diameter);
}
`,
  },
  {
    id: 13,
    name: '波浪雕塑板',
    category: '山水景观',
    level: 'advanced',
    applies: '波浪、水流、水纹装饰板、书立、屏风隔断',
    idea: '列表推导式生成正弦上边缘点列，补两个底角点闭合成 2D 剖面，linear_extrude 拉伸出厚度，rotate([90,0,0]) 立起来装在底座上',
    points: [
      'wave_pts 只算上边缘；闭合剖面 = wave_pts + [[length,0],[0,0]]',
      'y = base_height + amplitude * sin(x * 360 / wavelength)',
      'rotate([90,0,0]) 后剖面 y 变成 z（板立起），厚度朝 -y，底座位置要对齐',
    ],
    code: `/* [波浪板] */
length = 150; // [60:5:300]
base_height = 15; // [5:1:40]
amplitude = 8; // [2:0.5:25]
wavelength = 50; // [20:5:120]
thickness = 6; // [2:0.5:15]

/* [细节] */
resolution = 2; // [1:0.5:5]
base_depth = 10; // [4:1:20]

/* [Hidden] */
$fn = 32;

n_points = floor(length / resolution);
wave_pts = [ for (i = [0 : n_points])
  [i * resolution, base_height + amplitude * sin(i * resolution * 360 / wavelength)] ];
profile = concat(wave_pts, [[length, 0], [0, 0]]);

// 底座（居中包裹板厚）
translate([-base_depth / 2, -thickness - base_depth / 2, 0])
  cube([length + base_depth, thickness + base_depth, base_height * 0.3]);

// 波浪板立起
rotate([90, 0, 0])
  linear_extrude(height = thickness)
    polygon(profile);
`,
  },
  {
    id: 14,
    name: '涟漪托盘',
    category: '山水景观',
    level: 'classic',
    applies: '涟漪、水波纹托盘、首饰盘、ripple 装饰盘',
    idea: '圆托盘（外筒 - 内筒）打底，盘底上 for 生成同心圆环，环 = 外圆柱 - 内圆柱，模拟水面涟漪由中心向外扩散',
    points: [
      '演算：ripple_step = (tray_r - 2*wall) / (ripple_count + 1)，第 i 环半径 = tray_r - wall - i * ripple_step',
      '环必须贴盘底（z 从 0 起），高度低于盘沿',
    ],
    code: `/* [托盘] */
tray_diameter = 120; // [60:5:250]
tray_height = 18; // [8:1:40]
wall_thickness = 2.5; // [1:0.5:6]
bottom_thickness = 3; // [1:0.5:8]

/* [涟漪] */
ripple_count = 4; // [1:1:8]
ripple_height = 1.6; // [0.8:0.2:4]

/* [Hidden] */
$fn = 96;

tray_r = tray_diameter / 2;
ripple_step = (tray_r - wall_thickness * 2) / (ripple_count + 1);

difference() {
  cylinder(h = tray_height, r = tray_r);
  translate([0, 0, bottom_thickness])
    cylinder(h = tray_height, r = tray_r - wall_thickness);
}

for (i = [1 : ripple_count]) {
  ring_r = tray_r - wall_thickness - i * ripple_step;
  difference() {
    cylinder(h = bottom_thickness + ripple_height, r = ring_r);
    translate([0, 0, -0.5])
      cylinder(h = bottom_thickness + ripple_height + 1, r = ring_r - 1.2);
  }
}
`,
  },
  {
    id: 15,
    name: '葫芦瓶',
    category: '轴对称容器',
    level: 'advanced',
    applies: '葫芦瓶、双肚容器、酒葫芦、亚腰器物',
    idea: '套范例 2 的 smooth_pts，控制点排成"大腹 → 收腰 → 小腹 → 口"，一条平滑曲线出双鼓腹轮廓',
    points: [
      '外壁底部接 [0,0]，口部补末段终点 [mouth_r,h] 后接 [0,h] 封顶（防 polygon 隐式斜边闭合削掉瓶口）',
      '内壁同高接 [0,h]，difference 挖开顶盖成瓶口',
      '收腰处 neck_r 必须比 wall_thickness 大，否则内壁反转',
      '演算：控制点 (r, h*0.3) → (neck, h*0.5) → (r2, h*0.75) → (mouth, h)',
    ],
    code: `/* [主体尺寸] */
gourd_height = 140; // [60:5:250]
belly1_diameter = 80; // [40:5:140]
belly2_diameter = 60; // [30:5:120]
neck_diameter = 24; // [12:2:50]
mouth_diameter = 30; // [15:2:60]
wall_thickness = 2.5; // [1:0.5:6]

/* [细节] */
curve_smoothness = 12; // [6:2:24]

/* [Hidden] */
$fn = 64;

function csmooth(a, b, t) = a + (b - a) * (1 - cos(180 * t)) / 2;
function lerp(a, b, t) = a + (b - a) * t;
function smooth_pts(pts, steps) = [
  for (i = [0 : len(pts)-2])
    for (s = [0 : steps-1])
      [csmooth(pts[i][0], pts[i+1][0], s/steps), lerp(pts[i][1], pts[i+1][1], s/steps)]
];

belly1_r = belly1_diameter / 2;
belly2_r = belly2_diameter / 2;
neck_r = neck_diameter / 2;
mouth_r = mouth_diameter / 2;

outer_pts = [
  [belly1_r * 0.7, 0],
  [belly1_r, gourd_height * 0.3],
  [neck_r, gourd_height * 0.5],
  [belly2_r, gourd_height * 0.75],
  [mouth_r, gourd_height]
];
// 口部补末段终点 [mouth_r,h] 后接 [0,h] 封顶，内壁同高挖开成瓶口
outer_profile = concat(
  [[0, 0]],
  smooth_pts(outer_pts, curve_smoothness),
  [[mouth_r, gourd_height], [0, gourd_height]]
);

inner_pts = [
  [belly1_r * 0.7 - wall_thickness, wall_thickness],
  [belly1_r - wall_thickness, gourd_height * 0.3],
  [neck_r - wall_thickness, gourd_height * 0.5],
  [belly2_r - wall_thickness, gourd_height * 0.75],
  [mouth_r - wall_thickness, gourd_height]
];
inner_profile = concat(
  [[0, wall_thickness]],
  smooth_pts(inner_pts, curve_smoothness),
  [[mouth_r - wall_thickness, gourd_height], [0, gourd_height]]
);

difference() {
  rotate_extrude() polygon(outer_profile);
  rotate_extrude() polygon(inner_profile);
}
`,
  },
  {
    id: 16,
    name: '马克杯',
    category: '轴对称容器',
    level: 'classic',
    applies: '马克杯、水杯、带把手容器、啤酒杯',
    idea: '杯身 = 圆筒 difference 内腔；把手 = 半圆环（rotate_extrude 只扫 180°），两端埋进杯壁，最后再整体挖一次内腔，保证把手不会伸进杯子里',
    points: [
      '把手必须是半圆环：rotate_extrude(angle=180) 再绕 Z 转 -90°，得到的弧从杯子上下两端向外鼓',
      '环心放在杯壁内侧 (cup_r - embed)，两端端点埋进壁里，union 后是实体连接',
      '先 union 把手再 difference 内腔：伸进杯内那一截会被切掉，内壁保持干净',
      'handle_ring 是整环直径，实际把手高度只有一半；环越大把手越高',
      '演算：管中心半径 r_mid = (handle_out + handle_in) / 2，handle_in = handle_out - handle_thickness',
    ],
    code: `/* [杯身] */
cup_diameter = 80; // [50:5:140]
cup_height = 95; // [50:5:160]
wall_thickness = 3; // [1.5:0.5:6]
bottom_thickness = 4; // [2:0.5:8]

/* [把手] */
handle_ring = 50; // [18:2:70]
handle_thickness = 8; // [4:0.5:12]
embed = 3; // [1:0.5:5]

/* [Hidden] */
$fn = 64;

cup_r = cup_diameter / 2;
handle_out = handle_ring / 2;
// 内半径下限 0.5：handle_thickness 取大值时不会出现负半径
handle_in = max(handle_out - handle_thickness, 0.5);
handle_mid = (handle_out + handle_in) / 2;

// 半圆环，埋在杯壁 embed 毫米处
module handle() {
  translate([cup_r - embed, 0, cup_height / 2])
    rotate([90, 0, 0])
      rotate([0, 0, -90])
        rotate_extrude(angle = 180)
          translate([handle_mid, 0])
            circle(r = handle_thickness / 2);
}

difference() {
  union() {
    cylinder(h = cup_height, r = cup_r);
    handle();
  }
  // 内腔最后挖：把手伸进杯内的部分被一起切掉
  translate([0, 0, bottom_thickness])
    cylinder(h = cup_height, r = cup_r - wall_thickness);
}
`,
  },
  {
    id: 17,
    name: '圆角方盒（offset）',
    category: '盒体收纳',
    level: 'classic',
    applies: '圆角方盒、收纳盒、抽屉、外壳——优先用本范例替代范例 4 的 minkowski',
    idea: '2D 用 offset(r) 外扩圆角（先缩小再放大），linear_extrude 拉伸；内腔 = 同轮廓 offset(-wall) 内缩后从 bottom_thickness 高度向上挖',
    points: [
      'rounded_square(l,w,r) = offset(r) square([l-2r, w-2r], center=true)',
      '尺寸不会像 minkowski 那样膨胀，l/w 即最终外尺寸',
      '内腔高度 +0.1 防 z-fighting',
    ],
    code: `/* [主体尺寸] */
length = 100; // [40:5:250]
width = 70; // [30:5:200]
height = 45; // [15:5:120]
wall_thickness = 2.5; // [1:0.5:6]
bottom_thickness = 3; // [1:0.5:8]

/* [细节] */
fillet_radius = 6; // [2:0.5:15]

/* [Hidden] */
$fn = 48;

module rounded_square(l, w, r) {
  // r 上限 = 短边一半减 1：极端参数下内缩矩形不会退化成零
  rr = max(0.5, min(r, min(l, w) / 2 - 1));
  offset(r = rr) square([l - 2*rr, w - 2*rr], center = true);
}

difference() {
  linear_extrude(height)
    rounded_square(length, width, fillet_radius);
  translate([0, 0, bottom_thickness])
    linear_extrude(height = height - bottom_thickness + 0.1)
      offset(r = -wall_thickness)
        rounded_square(length, width, fillet_radius);
}
`,
  },
  {
    id: 18,
    name: '可堆叠收纳盒',
    category: '盒体收纳',
    level: 'advanced',
    applies: '堆叠收纳盒、嵌套箱、可摞周转盒',
    idea: '范例 17 的圆角盒 + 底部外裙环；上层盒底落入下层裙环内实现定位',
    points: [
      '裙环 = offset(rim_depth+gap) 外轮廓 − offset(-0.5) 内轮廓：内边与盒壁重叠 0.5mm，裙环与盒身连成一体',
      '裙环高度 rim_height < 盒高 1/3',
      '演算：裙外尺寸 = 盒外尺寸 + 2*(rim_depth + rim_gap)',
    ],
    code: `/* [盒体] */
box_length = 120; // [60:5:250]
box_width = 90; // [40:5:200]
box_height = 55; // [25:5:120]
wall_thickness = 2.5; // [1:0.5:6]
bottom_thickness = 3; // [1:0.5:8]

/* [堆叠] */
rim_height = 8; // [4:1:20]
rim_gap = 0.4; // [0.1:0.05:1]
rim_depth = 3; // [1.5:0.5:6]

/* [细节] */
fillet_radius = 5; // [2:0.5:12]

/* [Hidden] */
$fn = 48;

module rounded_square(l, w, r) {
  // r 上限 = 短边一半减 1：极端参数下内缩矩形不会退化成零
  rr = max(0.5, min(r, min(l, w) / 2 - 1));
  offset(r = rr) square([l - 2*rr, w - 2*rr], center = true);
}

difference() {
  union() {
    // 盒身
    linear_extrude(box_height)
      rounded_square(box_length, box_width, fillet_radius);
    // 底裙环（上层盒底嵌进来）：内边向内缩 0.5mm 与盒壁实体重叠，避免悬空；
    // 整体抬高 0.2mm，避开与盒底共面导致的非流形边
    translate([0, 0, 0.2])
      linear_extrude(rim_height)
        difference() {
          offset(r = rim_depth + rim_gap)
            rounded_square(box_length, box_width, fillet_radius);
          offset(r = -0.5)
            rounded_square(box_length, box_width, fillet_radius);
        }
  }
  // 内腔
  translate([0, 0, bottom_thickness])
    linear_extrude(box_height)
      offset(r = -wall_thickness)
        rounded_square(box_length, box_width, fillet_radius);
}
`,
  },
  {
    id: 19,
    name: '花盆（含托盘）',
    category: '园艺家居',
    level: 'classic',
    applies: '花盆、种植盆、多肉盆',
    idea: '盆身 = 上大下小圆台 difference 内腔；盆底 for 环排排水孔；托盘单独摆在旁边（分开打印）',
    points: [
      '排水孔必须穿透盆底：cylinder h = bottom_thickness + 1，z 从 -0.5 起',
      '演算：孔环半径 hole_ring = pot_bot_r * 0.55，孔数 N 时第 i 孔圆心角 = i * 360 / N',
    ],
    code: `/* [盆体] */
pot_top_diameter = 100; // [50:5:200]
pot_bottom_diameter = 70; // [35:5:160]
pot_height = 85; // [40:5:180]
wall_thickness = 2.5; // [1.5:0.5:6]
bottom_thickness = 3; // [2:0.5:8]

/* [排水] */
hole_count = 5; // [1:1:10]
hole_diameter = 8; // [4:1:20]

/* [托盘] */
saucer_diameter = 115; // [60:5:230]
saucer_height = 10; // [5:1:25]

/* [Hidden] */
$fn = 64;

pot_top_r = pot_top_diameter / 2;
pot_bot_r = pot_bottom_diameter / 2;
hole_r = min(hole_diameter / 2, pot_bot_r * 0.28);
hole_ring = pot_bot_r * 0.55;

difference() {
  cylinder(h = pot_height, r1 = pot_bot_r, r2 = pot_top_r);
  translate([0, 0, bottom_thickness])
    cylinder(h = pot_height, r1 = pot_bot_r - wall_thickness, r2 = pot_top_r - wall_thickness);
  for (i = [0 : hole_count - 1]) {
    angle = i * 360 / hole_count;
    translate([hole_ring * cos(angle), hole_ring * sin(angle), -0.5])
      cylinder(h = bottom_thickness + 1, r = hole_r);
  }
}

// 托盘：浅盘，摆在盆旁（间距 12mm）
translate([saucer_diameter / 2 + pot_top_r + 12, 0, 0])
  difference() {
    cylinder(h = saucer_height, d = saucer_diameter);
    translate([0, 0, 2])
      cylinder(h = saucer_height, d = saucer_diameter - 8);
  }
`,
  },
  {
    id: 20,
    name: '手机支架',
    category: '园艺家居',
    level: 'classic',
    applies: '手机支架、平板托架、展示架、阅读架',
    idea: '托槽 = 外方块 − 内腔（留出手机厚度空间），前唇挡滑；背板绕 X 轴倾斜 tilt_angle 度（从竖直向后仰），手机靠在上面',
    points: [
      '背板倾角就是 rotate([-tilt_angle, 0, 0])：tilt=18 表示从竖直向后倒 18°，不是从水平算',
      '背板根部要压在托槽后沿上并低于槽底 1mm，union 才有实体连接',
      '托槽内深 = phone_depth + 余量，手机底部连同保护壳一起塞得进去',
      '前唇 lip_height 只挡手机下沿，不要高到遮住屏幕',
      '演算：背板高度方向 = +Z 绕 X 轴旋转 -tilt 后的方向向量 [0, sin(tilt), cos(tilt)]',
    ],
    code: `/* [支架] */
phone_width = 75; // [60:5:110]
phone_depth = 13; // [8:1:25]
back_height = 95; // [50:5:160]
tilt_angle = 18; // [10:1:35]
lip_height = 14; // [8:1:30]
material = 4; // [2:0.5:8]

/* [Hidden] */
$fn = 32;

tray_depth = phone_depth + material;

// 托槽：底板 + 两侧壁 + 前唇一体
module tray() {
  difference() {
    cube([phone_width + 2*material, tray_depth + material, lip_height]);
    translate([material, material, material])
      cube([phone_width, tray_depth, lip_height]);
  }
}

// 背板：根部压在托槽后沿，绕 X 轴向后仰 tilt_angle
module back() {
  translate([0, tray_depth + material, 0])
    rotate([-tilt_angle, 0, 0])
      translate([0, -material, 0])
        cube([phone_width + 2*material, material, back_height]);
}

union() {
  tray();
  back();
}
`,
  },
  {
    id: 21,
    name: '分格笔筒',
    category: '园艺家居',
    level: 'classic',
    applies: '笔筒、化妆刷筒、工具分格筒',
    idea: '范例 16 的圆筒 + 过圆心的放射薄板隔断，rotate 绕 Z 均布',
    points: [
      'dividers = 2 → 十字；3 → 六分（每片隔 180/3 = 60°）',
      '隔板长度 = 2 * 内半径，不能超出内壁',
      '隔板从 bottom_thickness 起到口沿',
    ],
    code: `/* [笔筒] */
cup_diameter = 90; // [50:5:160]
cup_height = 100; // [50:5:200]
wall_thickness = 2.5; // [1.5:0.5:6]
bottom_thickness = 3; // [2:0.5:8]

/* [分格] */
dividers = 2; // [0:1:4]
divider_thickness = 2; // [1:0.5:4]

/* [Hidden] */
$fn = 64;

cup_r = cup_diameter / 2;
inner_r = cup_r - wall_thickness;

difference() {
  cylinder(h = cup_height, r = cup_r);
  translate([0, 0, bottom_thickness])
    cylinder(h = cup_height, r = inner_r);
}

if (dividers > 0) {
  for (i = [0 : dividers - 1]) {
    rotate([0, 0, i * 180 / dividers])
      translate([-inner_r, -divider_thickness / 2, bottom_thickness])
        cube([inner_r * 2, divider_thickness, cup_height - bottom_thickness]);
  }
}
`,
  },
  {
    id: 22,
    name: '沥水皂盒',
    category: '园艺家居',
    level: 'classic',
    applies: '皂盒、沥水盘、筷子架、笔托',
    idea: '四边围边的中空框 + 若干躺倒圆柱平行排列，水从条缝流走',
    points: [
      '沥水条 = rotate([0,90,0]) 的 cylinder（轴向沿 X），z 抬到 bar_diameter/2 让圆棒坐底（center=true 只管轴向居中）',
      '演算：条间距 step = 内宽 / bar_count，第 i 条 y = 边厚 + step*(i+0.5)',
      '条面低于框顶，边框挡住肥皂、条缝漏水',
    ],
    code: `/* [皂盒] */
soap_length = 110; // [70:5:180]
soap_width = 75; // [50:5:120]
rim_height = 8; // [4:1:15]
rim_thickness = 4; // [2:0.5:8]

/* [沥水条] */
bar_count = 5; // [3:1:9]
bar_diameter = 7; // [4:0.5:10]

/* [Hidden] */
$fn = 32;

step = (soap_width - rim_thickness * 2) / bar_count;

// 中空边框
difference() {
  cube([soap_length, soap_width, rim_height]);
  translate([rim_thickness, rim_thickness, -0.5])
    cube([soap_length - 2*rim_thickness, soap_width - 2*rim_thickness, rim_height + 1]);
}

// 平行沥水条（圆柱躺倒，轴向 X，坐底不悬空）
for (i = [0 : bar_count - 1]) {
  translate([soap_length / 2, rim_thickness + step * (i + 0.5), bar_diameter / 2])
    rotate([0, 90, 0])
      cylinder(h = soap_length - rim_thickness * 2, r = bar_diameter / 2, center = true);
}
`,
  },
  {
    id: 23,
    name: '黄金螺旋盘（斐波那契）',
    category: '数学曲线',
    level: 'advanced',
    applies: '黄金螺旋、斐波那契螺旋、对数螺旋盘、鹦鹉螺轮廓',
    idea: '对数螺旋 r = r0·φ^(θ/90°)（每转过 90° 半径乘黄金比 φ=1.618，正是斐波那契数列相邻项之比的极限）。外缘点列 + 内缘点列反向拼成环带 polygon，linear_extrude 拉伸成盘',
    points: [
      '演算：spiral_r(θ) = r0 * pow(phi, θ/90)，θ 步长 5° 平滑',
      '螺旋必须坐在一块圆底板上，否则只是一条悬空的带子；带子最高点留 2mm 边距',
      '带状闭合 = 外缘（θ 从 0→总角）+ 内缘（θ 从 总角→0，半径减带宽）',
      '带宽要小于起始半径：bw = min(band_width, r0 - 3)，否则中心段退化成一个自交尖角（实测会有 2 条开放边）',
    ],
    code: `/* [螺旋盘] */
outer_diameter = 100; // [50:5:200]
turns = 2; // [1:0.5:4]
band_width = 6; // [2:0.5:15]
thickness = 6; // [3:0.5:12]

/* [底板] */
base_thickness = 2; // [1:0.5:6]

/* [Hidden] */
$fn = 64;

phi = (1 + sqrt(5)) / 2;
r_end = outer_diameter / 2 - 2;
r0 = r_end / pow(phi, turns * 360 / 90);

function spiral_r(t) = r0 * pow(phi, t / 90);
// 带宽不能吃掉起始半径，否则中心段会退化成一个自交的尖角
bw = max(1, min(band_width, r0 - 3));
function band_inner_r(t) = max(spiral_r(t) - bw, 0.4);
total = turns * 360;

outer_edge = [ for (t = [0 : 5 : total])
  [spiral_r(t) * cos(t), spiral_r(t) * sin(t)] ];
inner_edge = [ for (t = [total : -5 : 0])
  [band_inner_r(t) * cos(t), band_inner_r(t) * sin(t)] ];

union() {
  // 圆底板
  linear_extrude(height = base_thickness)
    circle(r = outer_diameter / 2);
  // 螺旋带（坐在底板上）
  translate([0, 0, base_thickness - 0.5])
    linear_extrude(height = thickness + 0.5)
      polygon(concat(outer_edge, inner_edge));
}
`,
  },
  {
    id: 24,
    name: '阿基米德螺旋香薰盘',
    category: '数学曲线',
    level: 'advanced',
    applies: '阿基米德螺旋、等距螺旋、香薰盘、迷宫盘',
    idea: '阿基米德螺旋 r = r0 + k·θ（圈距处处相等）。盘面挖一条等宽螺旋槽，盘心再挖茶蜡凹槽；槽必须按 6° 小段逐段挖，不能用一个自交的大多边形',
    points: [
      '演算：r(θ) = r0 + (盘半径 - r0 - 边距) × θ / 总角，槽宽固定 band_width',
      '槽是"挖"出来的，不是凸起来的一条带：difference 盘体，槽深 = plate_thickness - 留底',
      '螺旋槽逐 6° 一段用梯形多边形挖，相邻段共享边界，避免大 polygon 自交翻面',
      '槽起点半径要大于烛槽半径，两个凹槽之间至少留 3mm 料',
      '中心烛槽最后挖，深度浅于槽深，茶蜡放进去不会掉到底',
    ],
    code: `/* [盘体] */
plate_diameter = 110; // [60:5:220]
plate_thickness = 6; // [3:0.5:12]
turns = 3; // [2:0.5:5]
band_width = 5; // [2:0.5:10]
groove_depth = 3; // [1:0.5:5]

/* [烛槽] */
candle_diameter = 40; // [20:5:70]
candle_depth = 2; // [1:0.5:6]

/* [Hidden] */
$fn = 64;

plate_r = plate_diameter / 2;
r0 = candle_diameter / 2 + 3;
r_max = plate_r - 6;
total = turns * 360;
depth = min(groove_depth, plate_thickness - 1.5);

function arch_r(t) = r0 + (r_max - r0) * t / total;

// 一段 6° 的螺旋槽（梯形多边形）
module groove_segment(t0, t1) {
  r0a = arch_r(t0);
  r1a = arch_r(t1);
  inner0 = max(r0a - band_width, 1);
  inner1 = max(r1a - band_width, 1);
  polygon(points = [
    [r0a * cos(t0), r0a * sin(t0)],
    [r1a * cos(t1), r1a * sin(t1)],
    [inner1 * cos(t1), inner1 * sin(t1)],
    [inner0 * cos(t0), inner0 * sin(t0)]
  ]);
}

difference() {
  linear_extrude(height = plate_thickness)
    circle(r = plate_r);
  // 螺旋槽
  for (t = [0 : 6 : total - 6])
    translate([0, 0, plate_thickness - depth])
      linear_extrude(height = depth + 1)
        groove_segment(t, t + 6);
  // 中心烛槽
  translate([0, 0, plate_thickness - candle_depth])
    cylinder(h = candle_depth + 1, r = candle_diameter / 2);
}
`,
  },
  {
    id: 25,
    name: '高斯钟形摆件',
    category: '数学曲线',
    level: 'advanced',
    applies: '高斯曲线/正态分布曲面、钟形摆件、僧帽、裙摆造型',
    idea: '高斯函数 y = h·e^(−(x/σ)²)。把这条 bell curve 作为剖面绕轴旋转（rotate_extrude），就是经典正态分布曲面。σ 控制胖瘦，h 控制峰高',
    points: [
      '演算：剖面点 [x, h * exp(-pow(x/sigma, 2))]，x 从 0 采样到 2.5σ（之后趋近 0）',
      '剖面闭合：首点 [0,0] 封底 → 曲线 → 尾点 [2.5σ, 0] 回到轴',
      'σ = 全宽/5：σ 太小会变成尖锥，肩部要占全宽的一半才像钟形',
    ],
    code: `/* [钟形] */
bell_height = 40; // [20:5:160]
bell_width = 120; // [50:5:200]

/* [底座] */
base_diameter = 120; // [40:5:200]
base_height = 5; // [3:1:12]

/* [Hidden] */
$fn = 64;

sigma = bell_width / 5;  // 5σ 覆盖全宽，肩部饱满，不会缩成尖锥
x_max = min(2.5 * sigma, bell_width / 2);

curve_pts = [ for (x = [0 : 2 : x_max])
  [x, bell_height * exp(-pow(x / sigma, 2))] ];
profile = concat([[0, 0]], curve_pts, [[x_max, 0]]);

union() {
  // 钟形主体（实心摆件）
  rotate_extrude() polygon(profile);
  // 圆环底座（放在 z=0，与钟形主体底部重叠）
  difference() {
    cylinder(h = base_height, d = base_diameter);
    translate([0, 0, -0.5]) cylinder(h = base_height + 1, d = base_diameter - 16);
  }
}
`,
  },
  {
    id: 26,
    name: '心形线首饰盘',
    category: '数学曲线',
    level: 'advanced',
    applies: '心形线 cardioid、爱心首饰盘、心形托盘、礼盒',
    idea: '经典心形参数方程 x=16sin³t、y=13cost−5cos2t−2cos3t−cos4t：顶部双瓣 + 中间 V 形凹口 + 底部尖点，天生正立。心形线 r=a(1+cosθ) 圆顶无凹口更像苹果，不用',
    points: [
      '演算：t=180° 时 y=−17 为底部尖点，t=0 时 y=5 为顶部凹口，x 半宽 16，按 heart_size/16 缩放',
      '外盘 = 心形 polygon 拉伸；内腔 = offset(r=−wall_thickness) 同心内缩，底留 bottom_thickness',
      '步长 5° 共 72 点足够平滑；凹口 V 形处内缩后自然变浅，不影响成型',
    ],
    code: `/* [首饰盘] */
heart_size = 45; // [25:5:90]
plate_height = 22; // [10:5:50]
wall_thickness = 3; // [1.5:0.5:6]
bottom_thickness = 3; // [1:0.5:8]

/* [Hidden] */
$fn = 64;

// 经典心形参数方程（原始轮廓半宽 16）
heart_scale = heart_size / 16;

heart_pts = [ for (t = [0 : 5 : 359])
  [
    16 * pow(sin(t), 3) * heart_scale,
    (13 * cos(t) - 5 * cos(2 * t) - 2 * cos(3 * t) - cos(4 * t)) * heart_scale
  ] ];

module heart_plate() {
  polygon(heart_pts);
}

difference() {
  linear_extrude(height = plate_height)
    heart_plate();
  translate([0, 0, bottom_thickness])
    linear_extrude(height = plate_height)
      offset(r = -wall_thickness) heart_plate();
}
`,
  },
  {
    id: 27,
    name: '玫瑰线杯垫',
    category: '数学曲线',
    level: 'advanced',
    applies: '玫瑰线 rose curve、花瓣杯垫、花朵托盘、装饰盘',
    idea: '玫瑰线 r = |a·cos(kθ)|。k 为奇数时 k 片花瓣，k 为偶数时 2k 片；取绝对值避免奇数 k 负半径导致 polygon 绕数抵消',
    points: [
      'k 为奇数（3/5/7）→ k 瓣；k 为偶数（4/8）→ 2k 瓣',
      'θ 扫 0→360 全周期；步长 4° 足够平滑',
      '必须对 r 取 abs：奇数 k 的负半径会把点翻到对侧，让 polygon 自重叠成空模型',
      '中心 difference 圆孔穿挂绳，或留实心直接当杯垫',
    ],
    code: `/* [花朵盘] */
flower_size = 48; // [25:5:100]
petals = 5; // [3:1:9]
plate_height = 6; // [3:0.5:15]

/* [细节] */
hole_diameter = 6; // [0:1:20]

/* [Hidden] */
$fn = 64;

function rose_r(a, k, t) = abs(a * cos(k * t));

rose_pts = [ for (t = [0 : 4 : 359])
  [rose_r(flower_size, petals, t) * cos(t), rose_r(flower_size, petals, t) * sin(t)] ];

difference() {
  linear_extrude(height = plate_height)
    polygon(rose_pts);
  if (hole_diameter > 0)
    translate([0, 0, -0.5])
      cylinder(h = plate_height + 1, d = hole_diameter);
}
`,
  },
  {
    id: 28,
    name: '渐开线齿轮（梯形齿近似）',
    category: '数学曲线',
    level: 'advanced',
    applies: '齿轮、棘轮、传动件、机械摆件',
    idea: '渐开线齿廓用梯形齿近似：每齿 4 个点在齿根圆与齿顶圆之间交替，for 嵌套生成全周点列。中心轴孔 + 环排减重孔',
    points: [
      '演算：每齿角 ta = 360/teeth；点角度 = i*ta + [0, 0.25, 0.5, 0.75]*ta',
      '第 1、4 点在齿根圆 root_r，第 2、3 点在齿顶圆 tip_r，连成梯形齿',
      '齿顶厚 ≈ 齿距的一半，太薄打印易断',
    ],
    code: `/* [齿轮] */
teeth = 12; // [6:1:30]
pitch_diameter = 60; // [24:2:200]
tooth_height = 4; // [2:0.5:10]
gear_thickness = 8; // [3:0.5:20]

/* [轴孔] */
bore_diameter = 8; // [4:0.5:30]

/* [减重孔] */
vent_count = 5; // [0:1:10]
vent_diameter = 10; // [4:1:24]

/* [Hidden] */
$fn = 64;

root_r = pitch_diameter / 2 - tooth_height;
tip_r = pitch_diameter / 2 + tooth_height;

function tooth_pts(i) =
  let (ta = 360 / teeth)
  [
    [root_r * cos(i * ta),                root_r * sin(i * ta)],
    [tip_r  * cos(i * ta + 0.25 * ta),    tip_r  * sin(i * ta + 0.25 * ta)],
    [tip_r  * cos(i * ta + 0.5 * ta),     tip_r  * sin(i * ta + 0.5 * ta)],
    [root_r * cos(i * ta + 0.75 * ta),    root_r * sin(i * ta + 0.75 * ta)]
  ];

gear_pts = [ for (i = [0 : teeth - 1]) for (p = tooth_pts(i)) p ];
vent_ring = pitch_diameter / 2 - tooth_height * 2 - vent_diameter / 2 - 2;

difference() {
  linear_extrude(height = gear_thickness)
    polygon(gear_pts);
  // 轴孔
  translate([0, 0, -0.5])
    cylinder(h = gear_thickness + 1, d = bore_diameter);
  // 环排减重孔
  if (vent_count > 0 && vent_ring > vent_diameter / 2 + bore_diameter / 2) {
    for (i = [0 : vent_count - 1]) {
      angle = i * 360 / vent_count;
      translate([vent_ring * cos(angle), vent_ring * sin(angle), -0.5])
        cylinder(h = gear_thickness + 1, d = vent_diameter);
    }
  }
}
`,
  },
  {
    id: 29,
    name: '六角凉亭',
    category: '建筑营造',
    level: 'advanced',
    applies: '凉亭、六角亭、中式景观小品、庭院摆件',
    idea: '亭 = 台基（$fn=6 双层圆台）+ 6 柱环排 + 攒尖顶（收缩 $fn=6 圆台叠层）+ 出檐（大薄六角板）+ 宝顶。全部用 $fn=6 圆柱/圆台拼装，rotate 30° 错缝出檐',
    points: [
      '柱高 ≈ 台基宽的 0.7~1.0 倍，攒尖顶高 ≈ 柱高的 0.6 倍，比例才像亭',
      '檐板直径 = 柱环直径 × 1.4，rotate 30° 与顶盖错缝更像双层檐',
      '宝顶 = 小圆柱 + 压扁 sphere，压扁用 scale([1,1,1.4]) 拉长',
    ],
    code: `/* [台基] */
base_width = 90; // [50:5:200]
base_height = 8; // [4:1:16]

/* [亭身] */
column_count = 6; // [4:1:12]
column_height = 65; // [30:5:140]
column_diameter = 6; // [3:0.5:12]
ring_diameter = 60; // [30:5:150]

/* [攒尖顶] */
roof_height = 40; // [20:5:90]
eave_diameter = 90; // [40:5:220]

/* [宝顶] */
finial_height = 18; // [8:1:40]

/* [Hidden] */
$fn = 6;

ring_r = ring_diameter / 2;

// 台基：两层收缩圆台
cylinder(h = base_height / 2, d = base_width + 14);
translate([0, 0, base_height / 2])
  cylinder(h = base_height / 2, d1 = base_width + 14, d2 = base_width);

// 6 柱环排
for (i = [0 : column_count - 1]) {
  angle = i * 360 / column_count;
  translate([ring_r * cos(angle), ring_r * sin(angle), base_height])
    cylinder(h = column_height, d = column_diameter, $fn = 24);
}

// 出檐：大薄六角板，rotate 30° 错缝
translate([0, 0, base_height + column_height])
  rotate([0, 0, 30])
    cylinder(h = 3, d = eave_diameter);

// 攒尖顶：收缩六角圆台
translate([0, 0, base_height + column_height + 3])
  cylinder(h = roof_height, d1 = eave_diameter * 0.8, d2 = 6);

// 宝顶：小柱 + 拉长球
translate([0, 0, base_height + column_height + 3 + roof_height])
  cylinder(h = finial_height * 0.4, d = 5, $fn = 24);
translate([0, 0, base_height + column_height + 3 + roof_height + finial_height * 0.4])
  scale([1, 1, 1.4])
    sphere(d = 8, $fn = 24);
`,
  },
  {
    id: 30,
    name: '楼阁式塔',
    category: '建筑营造',
    level: 'advanced',
    applies: '宝塔、楼阁、多层塔、雷峰塔式摆件',
    idea: 'for 层堆叠：每层 = 方形层身 + 出檐（比层身大的薄方板）。层身逐层收缩，层高逐层降低，顶层收尖',
    points: [
      '演算：第 i 层身宽 w = base_w * (1 - i * taper)，taper 取 4%~6%',
      '层高逐层降 5%，所以下一层起点必须按累计高度算，否则层与层之间会悬空',
      '每层身四面开圆窗（环排 difference），层底落在下一层檐板上',
    ],
    code: `/* [塔身] */
base_width = 60; // [30:5:120]
levels = 5; // [3:1:9]
level_height = 30; // [15:5:60]
wall_thickness = 3; // [1.5:0.5:8]

/* [檐顶] */
eave_over = 6; // [2:0.5:15]
eave_thickness = 4; // [2:0.5:8]
taper = 0.05; // [0.02:0.01:0.1]

/* [Hidden] */
$fn = 32;

module level_body(w, h) {
  difference() {
    translate([-w / 2, -w / 2, 0]) cube([w, w, h]);
    // 四面圆窗
    for (a = [0 : 90 : 270]) {
      rotate([0, 0, a])
        translate([0, w / 2 + 0.5, h * 0.6])
          rotate([90, 0, 0])
            cylinder(h = wall_thickness + 1, r = w * 0.08, $fn = 24);
    }
  }
}

module eave(w, t) {
  translate([-w / 2, -w / 2, 0]) cube([w, w, t]);
}

// 每层收缩 5%，层身逐层变矮：层起点必须累计，不能简单用 i*(level_height + eave)
shrink = 0.05;
function level_h(i) = level_height * (1 - i * shrink);
function level_z(i) = i * eave_thickness + level_height * (i - shrink * i * (i - 1) / 2);
last_level = levels - 1;
top_z = level_z(last_level) + level_h(last_level) + eave_thickness;
top_w = base_width * (1 - last_level * taper);

union() {
  for (i = [0 : last_level]) {
    w = base_width * (1 - i * taper);
    h = level_h(i);
    z = level_z(i);
    translate([0, 0, z]) level_body(w, h);
    translate([0, 0, z + h]) eave(w + eave_over * 2, eave_thickness);
  }
  // 顶层收尖（坐在最后一层檐板上）
  translate([0, 0, top_z])
    cylinder(h = level_height * 0.9, d1 = top_w, d2 = 4, $fn = 4);
}
`,
  },
  {
    id: 31,
    name: '立体主义头像（毕加索风格）',
    category: '艺术风格',
    level: 'advanced',
    applies: '立体主义、抽象头像、毕加索风雕塑、多视角构成',
    idea: '立体主义 = 多视角同框：侧脸剪影板与正面脸板呈 90° 交叉，五官拆成独立几何块（棱锥鼻、圆孔眼、圆弧眉）错位摆放，不对称即风格',
    points: [
      '侧脸剪影 = 手绘 polygon（额头→鼻梁→鼻尖→人中→下巴→颈），linear_extrude 薄板',
      '正面板 = 圆角方板 difference 两个圆孔眼；两板呈 90° 相交，插接处实体重叠',
      '五官块故意错位/不对称：一只眼睛是孔，一只是凸球，鼻子是 $fn=4 棱锥',
    ],
    code: `/* [整体] */
head_width = 60; // [30:5:120]
head_height = 80; // [40:5:160]
plate_thickness = 6; // [3:0.5:12]

/* [五官] */
eye_diameter = 14; // [6:1:30]
nose_size = 16; // [8:1:40]

/* [Hidden] */
$fn = 32;

// 侧脸剪影（朝 +x 的侧脸：额→鼻→唇→下巴）
side_profile = [
  [0, 0],
  [0, head_height * 0.92],
  [head_width * 0.18, head_height],        // 额头顶
  [head_width * 0.30, head_height * 0.78], // 鼻梁
  [head_width * 0.38, head_height * 0.66], // 鼻尖
  [head_width * 0.26, head_height * 0.58], // 人中
  [head_width * 0.34, head_height * 0.50], // 唇
  [head_width * 0.24, head_height * 0.42], // 下巴窝
  [head_width * 0.30, head_height * 0.28], // 下巴
  [head_width * 0.10, 0]
];

// 底座：放在 z=0 且与两块头板在底部重叠，整件连成一体
cylinder(h = 6, d1 = head_width * 0.9, d2 = head_width * 0.8, $fn = 48);

union() {
  // 侧脸板（YZ 平面立起，面朝 +x）
  rotate([90, 0, 90])
    linear_extrude(height = plate_thickness)
      polygon(side_profile);

  // 正面板（XY 平面立起，面朝 +z 的观察者），带两只"孔眼"
  // z 向上抬 0.4*head_height + 0.12*head_width，让板底落在 z=0 而不是一半埋到床下
  translate([-plate_thickness / 2, 0, head_height * 0.4 + head_width * 0.12])
    rotate([90, 0, 0])
      translate([0, 0, -plate_thickness / 2])
        linear_extrude(height = plate_thickness, center = true)
          difference() {
            offset(r = head_width * 0.12)
              square([head_width * 0.55, head_height * 0.8], center = true);
            translate([-head_width * 0.12, head_height * 0.18])
              circle(d = eye_diameter);
            translate([head_width * 0.14, head_height * 0.20])
              circle(d = eye_diameter * 0.7);
          }

  // 棱锥鼻（$fn=4 锥体，立体主义的"分析期"几何）
  translate([plate_thickness / 2 + nose_size * 0.3, 0, head_height * 0.55])
    rotate([0, -90, 0])
      cylinder(h = nose_size, d1 = nose_size, d2 = 0, $fn = 4);

  // 凸球眼（贴在侧脸板上，与孔眼形成不对称）
  translate([plate_thickness, head_height * 0.08, head_height * 0.72])
    sphere(d = eye_diameter * 0.8, $fn = 24);
}
`,
  },
  {
    id: 32,
    name: '构成主义动态雕塑（考尔德风）',
    category: '艺术风格',
    level: 'advanced',
    applies: '动态雕塑、构成主义、考尔德风、平衡装置摆件',
    idea: '底座竖杆 + 顶端横杆，两端一上一下挂不同大小的圆盘，重心故意不对称——"不稳定中的平衡"就是风格本体。全部 union 成一体，吊杆与盘面重叠 2mm',
    points: [
      '主杆沉入底座 2mm、横杆穿过主杆，所有零件都在同一个 union 里',
      '横杆沿 X 轴，整体绕竖杆偏转 arm_yaw；两端盘径一大一小（重量错觉）',
      '挂盘 = 薄 cylinder，吊杆底端埋进盘面 2mm，保证一体打印不断裂',
    ],
    code: `/* [底座] */
base_diameter = 60; // [30:5:120]
base_height = 8; // [4:1:16]

/* [主杆] */
mast_height = 110; // [50:5:220]
rod_diameter = 5; // [2:0.5:10]

/* [横杆与挂盘] */
arm_length = 80; // [40:5:160]
big_disc = 34; // [15:2:70]
small_disc = 20; // [10:2:50]
arm_yaw = 12; // [0:1:35]

/* [Hidden] */
$fn = 48;

top_z = base_height + mast_height;
arm_z = top_z - 4;
arm_in_x = -arm_length * 0.35;
arm_out_x = arm_length * 0.65;
disc_rod = rod_diameter * 0.6;

union() {
  // 底座
  cylinder(h = base_height, d1 = base_diameter, d2 = base_diameter * 0.85);
  // 主杆（沉入底座 2mm）
  translate([0, 0, base_height - 2])
    cylinder(h = mast_height + 2, d = rod_diameter);

  // 横杆与挂盘：整体绕竖杆偏转 arm_yaw
  rotate([0, 0, arm_yaw]) {
    // 横杆（沿 X 轴，穿过主杆）
    translate([arm_in_x, 0, arm_z])
      rotate([0, 90, 0])
        cylinder(h = arm_length, d = rod_diameter * 0.8);

    // 大盘：吊杆从横杆垂下，底端埋进盘面 2mm
    translate([arm_in_x, 0, arm_z - 12])
      cylinder(h = 12, d = disc_rod);
    translate([arm_in_x, 0, arm_z - 13])
      rotate([18, 0, 0])
        cylinder(h = 3, d = big_disc);

    // 小盘：吊杆从横杆向上，顶端埋进盘面 2mm
    translate([arm_out_x, 0, arm_z])
      cylinder(h = 10, d = disc_rod);
    translate([arm_out_x, 0, arm_z + 8])
      rotate([-25, 0, 0])
        cylinder(h = 3, d = small_disc);
  }
}
`,
  },
  {
    id: 33,
    name: '新造型主义浮雕板（蒙德里安风）',
    category: '艺术风格',
    level: 'classic',
    applies: '蒙德里安式构成、几何浮雕、墙面装饰画、新造型主义',
    idea: '经典红黄蓝构成 → 三种深度的凸块。格子布局用黄金比例递归分割：整块先按 0.618 分两块，再各自细分，最后一次 for 把布局数组里的矩形凸到不同高度',
    points: [
      '布局数组 cells = [[x, y, w, h, depth], ...]，depth 取 2/4/6 三级对应"色块权重"',
      '分割用黄金比 0.618：横竖交替分割比经典均分更有蒙德里安味',
      '底板边框留 4mm 平边，凸块互不重叠（布局数组已保证）',
    ],
    code: `/* [画板] */
board_length = 140; // [60:5:300]
board_width = 100; // [40:5:250]
board_thickness = 5; // [3:0.5:12]

/* [浮雕] */
depth_low = 2;   // [1:0.5:6]
depth_mid = 4;   // [2:0.5:10]
depth_high = 6;  // [3:0.5:14]
frame = 4; // [2:0.5:10]

/* [Hidden] */
$fn = 32;

g = 0.618;  // 黄金分割比
L = board_length - frame * 2;
W = board_width - frame * 2;

// 黄金比例网格布局：x 方向按 0.618 递归两刀，y 方向一刀
// 每格 [x, y, w, h, depth]（depth：1=低 2=中 3=高，映射到三级深度）
cells = [
  [0, 0, L * g * g, W, 3],
  [L * g * g, 0, L * g, W * g, 1],
  [L * g * g, W * g, L * g * 0.5, W * (1 - g), 2],
  [L * g * g + L * g * 0.5, W * g, L * g * 0.5, W * (1 - g), 1],
  [L * (g + g * g), 0, L * (1 - g - g * g), W, 2]
];

module relief() {
  cube([board_length, board_width, board_thickness]);
  for (c = cells) {
    depth = c[4] == 3 ? depth_high : (c[4] == 2 ? depth_mid : depth_low);
    translate([frame + c[0], frame + c[1], board_thickness - 0.5])
      cube([c[2], c[3], depth + 0.5]);
  }
}

relief();
`,
  },
  {
    id: 35,
    name: '手机横放支架',
    category: '实用工具',
    level: 'classic',
    applies: '横屏看视频、视频通话、平板托架',
    idea: '低矮底座 + 后仰背板 + 前唇三件套：手机横放，下沿卡在前唇与背板之间，靠重力自稳',
    points: [
      '前唇与背板都下沉 1mm 与底座相交，不是只贴面',
      '背板用 rotate([-tilt_angle,0,0]) 让顶端向 +Y 后仰，整块重心仍在底座范围内',
      '演算：背板底边 y = base_depth*0.5，顶端后移 back_height*sin(tilt) 不超出底座',
    ],
    code: `/* [底座] */
stand_width = 150; // [100:5:220]
base_depth = 80; // [60:5:140]
base_thickness = 6; // [4:1:12]

/* [背板] */
back_height = 100; // [60:5:160]
tilt_angle = 20; // [5:1:40]
board_thickness = 4; // [2:0.5:8]

/* [前唇] */
lip_height = 12; // [6:1:30]
lip_thickness = 5; // [3:0.5:10]

/* [Hidden] */
$fn = 48;

back_y = base_depth * 0.5;

// 底座
cube([stand_width, base_depth, base_thickness]);

// 背板：底部沉入底座 1mm，顶端后仰
translate([0, back_y, base_thickness - 1])
  rotate([-tilt_angle, 0, 0])
    cube([stand_width, board_thickness, back_height]);

// 前唇：挡手机下沿
translate([0, 0, base_thickness - 1])
  cube([stand_width, lip_thickness, lip_height + 1]);
`,
  },
  {
    id: 36,
    name: '线缆夹',
    category: '实用工具',
    level: 'basic',
    applies: '桌面理线、耳机线/充电线固定、线束收纳',
    idea: 'C 形弹性夹：外圆减内孔，再从侧面开一道比线径窄的口，线压进去后被夹住',
    points: [
      '开口从圆心沿 +Y 一直切到外圆（cube 伸出 outer_r+1）',
      '开口宽 gap_width 必须小于线径，否则失去夹持力',
      '壁厚 =（外半径 - 线半径），2~3mm 兼顾弹性与强度',
    ],
    code: `/* [线缆] */
cable_diameter = 6; // [3:0.5:14]

/* [夹体] */
clip_width = 10; // [4:1:25]
wall_thickness = 2.5; // [1.5:0.5:5]
gap_width = 3.5; // [1.5:0.5:8]

/* [Hidden] */
$fn = 64;

outer_r = cable_diameter / 2 + wall_thickness;

difference() {
  cylinder(h = clip_width, r = outer_r);
  // 内孔
  translate([0, 0, -0.5])
    cylinder(h = clip_width + 1, r = cable_diameter / 2);
  // 侧向开口：比线径窄，靠材料弹性卡入
  translate([-gap_width / 2, 0, -0.5])
    cube([gap_width, outer_r + 1, clip_width + 1]);
}
`,
  },
  {
    id: 37,
    name: '墙壁挂钩',
    category: '实用工具',
    level: 'classic',
    applies: '钥匙/背包/耳机挂钩、墙面收纳钩、衣帽钩',
    idea: '竖直背板开两个螺丝孔，正面伸出一段横臂，臂端用 rotate_extrude 的四分之一圆环向上回卷成钩',
    points: [
      '横臂从 plate_thickness-1 处起，埋进背板 1mm，union 后是一体',
      '弯钩 = rotate_extrude(angle=90) 的圆环，再 rotate([0,-90,0]) 把圆弧立到 Y-Z 平面',
      '臂端与弯钩交接处补一个 sphere，避免只共面不重叠',
    ],
    code: `/* [背板] */
plate_width = 30; // [20:2:60]
plate_height = 55; // [30:5:100]
plate_thickness = 4; // [2:0.5:8]

/* [挂钩] */
arm_length = 35; // [20:5:70]
hook_radius = 12; // [6:1:25]
rod_radius = 3.5; // [2:0.5:6]

/* [螺丝孔] */
screw_hole = 4.5; // [3:0.5:8]

/* [Hidden] */
$fn = 48;

arm_z = plate_height * 0.55;
arm_end = plate_thickness - 1 + arm_length;

difference() {
  union() {
    // 背板（X 居中）
    translate([-plate_width / 2, 0, 0])
      cube([plate_width, plate_thickness, plate_height]);
    // 水平臂：末端收在关节柱内部，避免端面共面
    translate([0, plate_thickness - 1, arm_z])
      rotate([-90, 0, 0])
        cylinder(h = arm_length + 1, r = rod_radius);
    // 弯钩：圆弧从臂端向上回卷
    translate([0, arm_end - hook_radius, arm_z])
      rotate([0, -90, 0])
        rotate_extrude(angle = 90)
          translate([hook_radius, 0])
            circle(r = rod_radius);
    // 关节柱：略大于杆径，完整包住臂端与弯钩端面，避免相切产生开放边
    translate([0, arm_end - 2, arm_z])
      rotate([-90, 0, 0])
        cylinder(h = 4, r = rod_radius + 0.4);
  }
  // 螺丝孔（贯穿背板）
  for (p = [[-plate_width * 0.28, plate_height * 0.82],
            [ plate_width * 0.28, plate_height * 0.82],
            [ 0,                  plate_height * 0.18]])
    translate([p[0], plate_thickness / 2, p[1]])
      rotate([-90, 0, 0])
        cylinder(h = plate_thickness + 2, r = screw_hole / 2, center = true);
}
`,
  },
  {
    id: 38,
    name: '内六角扳手架',
    category: '实用工具',
    level: 'basic',
    applies: '内六角扳手收纳、螺丝刀/钻头立放、小工具排插',
    idea: '条状底座上按序号等距开一排六边形盲孔，孔径逐级递增，一套扳手从大到小各就各位',
    points: [
      '六角孔 = cylinder($fn=6)，孔径沿序号等差递增',
      '孔径上限同时受条宽与孔间距约束（max_hole），极端参数不会打穿侧壁或并孔',
      '孔是盲孔：从顶面向下挖 pocket_depth，底面留料',
    ],
    code: `/* [底座] */
base_length = 90; // [50:5:160]
base_width = 24; // [14:1:40]
base_height = 12; // [8:1:28]

/* [六角孔] */
wrench_count = 6; // [3:1:9]
min_size = 2.5; // [1.5:0.5:5]
size_step = 1.2; // [0.2:0.2:2.5]
hole_clearance = 0.4; // [0.1:0.1:1]
hole_depth_ratio = 0.6; // [0.3:0.05:0.9]

/* [Hidden] */
$fn = 64;

spacing = base_length / (wrench_count + 1);
pocket_depth = base_height * hole_depth_ratio;
max_hole = min(base_width - 4, spacing * 0.8);

difference() {
  translate([-base_length / 2, -base_width / 2, 0])
    cube([base_length, base_width, base_height]);
  for (i = [0 : wrench_count - 1]) {
    d = min(min_size + i * size_step, max_hole) + hole_clearance;
    translate([-base_length / 2 + spacing * (i + 1), 0, base_height - pocket_depth])
      cylinder(h = pocket_depth + 1, d = d, $fn = 6);
  }
}
`,
  },
  {
    id: 39,
    name: 'SD 卡收纳盒',
    category: '实用工具',
    level: 'classic',
    applies: 'SD/microSD 卡收纳、名片盒、薄片样品收纳',
    idea: '方形盒体正面（-Y）开放，内部按卡厚 + 间隙切成多层水平槽，卡片从前面滑入，后壁和顶盖挡灰',
    points: [
      '槽高 = 卡厚 + clearance，槽与槽之间留 separator 隔板',
      '槽从 -1 起挖到 box_w - back_thickness，后壁厚度正好保留',
      '顶面留 wall_thickness 压边，卡片不会从上方掉出',
    ],
    code: `/* [盒体] */
card_length = 32; // [22:1:45]
card_width = 24; // [17:1:35]
slots = 3; // [1:1:6]
wall_thickness = 2.5; // [1.5:0.5:5]
bottom_thickness = 3; // [2:0.5:6]
back_thickness = 2; // [1.5:0.5:5]

/* [卡槽] */
card_thickness = 2.1; // [1:0.1:4]
clearance = 1; // [0.4:0.2:2]
separator = 1.5; // [0.8:0.2:3]

/* [Hidden] */
$fn = 48;

gap = card_thickness + clearance;
box_l = card_length + 2 * wall_thickness;
box_w = card_width + wall_thickness + back_thickness;
box_h = bottom_thickness + slots * gap + (slots - 1) * separator + wall_thickness;

difference() {
  cube([box_l, box_w, box_h]);
  for (i = [0 : slots - 1]) {
    z = bottom_thickness + i * (gap + separator);
    // 前面开放，卡片沿 +Y 滑入
    translate([wall_thickness, -1, z])
      cube([card_length, box_w - back_thickness + 1, gap]);
  }
}
`,
  },
  {
    id: 40,
    name: '杯垫套装',
    category: '家居生活',
    level: 'basic',
    applies: '杯垫、锅垫、鼠标垫片，一套多件一起打印',
    idea: '六边形轮廓（cylinder + $fn=6）顶面挖一层浅凹槽挡水，count 个按两列自动排布成一套',
    points: [
      '所有圆统一用 $fn=6，杯垫和凹槽都是同向六边形，边距均匀',
      '凹槽深 recess_depth、外沿留 rim_width，洒出的水不会流到桌面',
      '2 列排布，count 1~6 时不会超出热床（默认 4 件约 190mm 宽）',
    ],
    code: `/* [杯垫] */
coaster_size = 90; // [60:5:120]
coaster_thickness = 6; // [4:0.5:12]
rim_width = 6; // [3:1:12]
recess_depth = 1.5; // [0.5:0.2:3]

/* [套装布局] */
count = 4; // [1:1:6]
gap = 6; // [2:1:20]

/* [Hidden] */
$fn = 6;

module coaster() {
  difference() {
    cylinder(h = coaster_thickness, d = coaster_size);
    translate([0, 0, coaster_thickness - recess_depth])
      cylinder(h = recess_depth + 1, d = coaster_size - 2 * rim_width);
  }
}

for (i = [0 : count - 1]) {
  col = i % 2;
  row = floor(i / 2);
  translate([col * (coaster_size + gap), row * (coaster_size + gap), 0])
    coaster();
}
`,
  },
  {
    id: 41,
    name: '书立',
    category: '家居生活',
    level: 'classic',
    applies: '书立、挡书板、唱片/文件分隔立板',
    idea: 'L 形主体：横向底板压在书下，端头一块竖背板，背面再加两片三角形加强筋，单体打印无需支撑',
    points: [
      '背板与底板在 x∈[-plate_thickness,0] 内重叠，不是贴面拼接',
      '加强筋在 X-Z 平面画三角形，再 rotate([90,0,0]) 沿 Y 拉伸',
      '加强筋从背板背面一直压到底板，受力方向正好是书本推力',
    ],
    code: `/* [底板] */
base_length = 75; // [50:5:140]
base_width = 90; // [50:5:160]
base_thickness = 5; // [3:1:12]

/* [背板] */
plate_height = 120; // [60:5:200]
plate_thickness = 5; // [3:1:10]

/* [加强筋] */
rib_length = 45; // [20:5:80]
rib_height = 70; // [30:5:150]
rib_thickness = 4; // [2:1:8]

/* [Hidden] */
$fn = 32;

// 底板（x 从 -plate_thickness 起，与背板重叠）
translate([-plate_thickness, 0, 0])
  cube([base_length + plate_thickness, base_width, base_thickness]);

// 背板
translate([-plate_thickness, 0, 0])
  cube([plate_thickness, base_width, plate_height]);

// 三角形加强筋：X-Z 平面画三角形，沿 Y 拉伸
for (y = [base_width * 0.15, base_width * 0.85])
  translate([0, y, 0])
    rotate([90, 0, 0])
      linear_extrude(height = rib_thickness, center = true)
        polygon([[-plate_thickness, 0], [rib_length, 0], [-plate_thickness, rib_height]]);
`,
  },
  {
    id: 42,
    name: '抽屉分隔条',
    category: '家居生活',
    level: 'basic',
    applies: '抽屉分区、收纳盒隔断、零件盒分格',
    idea: '条状隔板平放打印，沿上边按等距开槽；打印两条同款交叉对插即成网格',
    points: [
      '平放打印：X-Y 大面贴床，只有 strip_thickness 在 Z，无需支撑',
      '槽宽 = 条厚 + slot_gap，两条同款才能对插',
      '槽深取高度的一半（ratio 0.5），对插后上下沿齐平',
    ],
    code: `/* [分隔条] */
strip_length = 180; // [80:10:280]
strip_height = 25; // [15:1:60]
strip_thickness = 3; // [1.5:0.5:6]

/* [插槽] */
slot_count = 7; // [2:1:15]
slot_gap = 0.4; // [0.2:0.1:1]
slot_depth_ratio = 0.5; // [0.35:0.05:0.5]

/* [Hidden] */
$fn = 32;

slot_width = strip_thickness + slot_gap;
slot_depth = strip_height * slot_depth_ratio;

difference() {
  cube([strip_length, strip_height, strip_thickness]);
  for (i = [0 : slot_count - 1]) {
    x = strip_length * (i + 0.5) / slot_count;
    translate([x - slot_width / 2, strip_height - slot_depth, -1])
      cube([slot_width, slot_depth + 1, strip_thickness + 2]);
  }
}
`,
  },
  {
    id: 43,
    name: '纸巾盒',
    category: '家居生活',
    level: 'classic',
    applies: '抽纸盒、纸巾收纳、桌面收纳盒',
    idea: '圆角方盒整体拉伸，底部敞开方便塞入整包纸巾，顶部留一层实心板再开椭圆抽纸口',
    points: [
      '内腔从 z=-1 起挖，底部完全开通，纸巾包从下面塞进去',
      '顶部保留 top_thickness 实心板，再挖椭圆口',
      '抽纸口尺寸用 min() 夹在内腔范围内，极端参数不会切穿盒壁',
    ],
    code: `/* [盒体] */
box_length = 240; // [120:10:300]
box_width = 120; // [80:5:200]
box_height = 75; // [40:5:150]
wall_thickness = 3; // [1.5:0.5:6]
top_thickness = 4; // [2:0.5:10]

/* [圆角] */
corner_radius = 12; // [2:1:30]

/* [抽纸口] */
opening_length = 100; // [50:5:220]
opening_width = 40; // [20:5:100]

/* [Hidden] */
$fn = 48;

module rounded_square(l, w, r) {
  // r 上限 = 短边一半减 1：极端参数下内缩矩形不会退化成零
  rr = max(0.5, min(r, min(l, w) / 2 - 1));
  offset(r = rr) square([l - 2*rr, w - 2*rr], center = true);
}

// 抽纸口必须落在内腔以内
open_l = min(opening_length, box_length - 2 * wall_thickness - 10);
open_w = min(opening_width, box_width - 2 * wall_thickness - 10);

difference() {
  linear_extrude(height = box_height)
    rounded_square(box_length, box_width, corner_radius);
  // 内腔：底部开口，整包纸巾从下面塞入
  translate([0, 0, -1])
    linear_extrude(height = box_height - top_thickness + 1)
      offset(r = -wall_thickness)
        rounded_square(box_length, box_width, corner_radius);
  // 顶部椭圆抽纸口
  translate([0, 0, box_height - top_thickness - 1])
    scale([open_l / open_w, 1, 1])
      cylinder(h = top_thickness + 2, d = open_w);
}
`,
  },
  {
    id: 44,
    name: '自吸水花盆',
    category: '园艺家居',
    level: 'advanced',
    applies: '自吸水种植盆、懒人花盆、多肉/香草双盆结构',
    idea: '外盆储水、内盆悬空：内盆法兰坐在外盆口沿上，盆底与水面留出储水空间，棉绳孔吸水、环排孔排水',
    points: [
      '内盆外径与高度都用 min() 夹在储水槽内，极端参数组合也不会穿模',
      '法兰坐在外盆口沿（z = reservoir_height），内盆底部悬空留出储水层',
      '中心棉绳孔 + 环排排水孔都从盆底钻通，吸水靠棉绳毛细',
    ],
    code: `/* [外盆] */
reservoir_diameter = 110; // [70:5:200]
reservoir_height = 75; // [40:5:160]
wall_thickness = 3; // [2:0.5:6]
bottom_thickness = 3; // [2:0.5:6]

/* [内盆] */
pot_diameter = 96; // [50:5:180]
pot_height = 60; // [30:5:120]
pot_taper = 0.75; // [0.5:0.05:0.95]
flange_thickness = 3; // [2:0.5:6]

/* [排水] */
wick_hole = 8; // [4:1:20]
drain_count = 3; // [0:1:8]
drain_hole = 5; // [3:1:12]

/* [Hidden] */
$fn = 64;

// 内盆口径与高度都限制在储水槽内部
pot_top_r = min(pot_diameter / 2, reservoir_diameter / 2 - wall_thickness - 1);
pot_bottom_r = pot_top_r * pot_taper;
pot_h = min(pot_height, reservoir_height - bottom_thickness - 6);
// 法兰底面落在外盆口沿上，由此反推内盆原点
pot_z = reservoir_height - (pot_h - flange_thickness);

// 外盆：储水槽
difference() {
  cylinder(h = reservoir_height, d = reservoir_diameter);
  translate([0, 0, bottom_thickness])
    cylinder(h = reservoir_height, d = reservoir_diameter - 2 * wall_thickness);
}

// 内盆：外沿法兰 + 排水孔 + 中心棉绳孔
translate([0, 0, pot_z])
  difference() {
    union() {
      cylinder(h = pot_h, r1 = pot_bottom_r, r2 = pot_top_r);
      translate([0, 0, pot_h - flange_thickness])
        cylinder(h = flange_thickness, d = reservoir_diameter + 4);
    }
    translate([0, 0, bottom_thickness])
      cylinder(h = pot_h, r1 = pot_bottom_r - wall_thickness, r2 = pot_top_r - wall_thickness);
    translate([0, 0, -1])
      cylinder(h = bottom_thickness + 1, d = wick_hole);
    for (i = [0 : drain_count - 1]) {
      angle = i * 360 / max(drain_count, 1);
      translate([pot_bottom_r * 0.6 * cos(angle), pot_bottom_r * 0.6 * sin(angle), -1])
        cylinder(h = bottom_thickness + 1, d = drain_hole);
    }
  }
`,
  },
  {
    id: 45,
    name: '多肉标签牌',
    category: '园艺家居',
    level: 'basic',
    applies: '多肉/香草标签、花园插牌、样品标识牌',
    idea: '整块 2D 轮廓（牌面 + 柄 + 尖头）一次拉伸，平放打印；牌面再挖一层浅凹槽方便书写',
    points: [
      '牌面、柄、尖头三段在 2D 里重叠 0.01，union 后没有接缝',
      '尖头用 polygon 三角形，斜插进土里不易折断',
      '凹槽用 offset 圆角方框，margin 用 min() 夹紧保证不超边',
    ],
    code: `/* [标签牌] */
tag_height = 100; // [60:5:160]
plate_width = 34; // [20:2:70]
plate_height = 30; // [15:2:60]
stake_width = 8; // [5:1:20]
tip_length = 14; // [6:1:30]
tag_thickness = 2; // [1.2:0.2:4]

/* [书写面] */
recess_depth = 0.6; // [0.2:0.1:1.5]
recess_margin = 5; // [2:1:12]

/* [Hidden] */
$fn = 32;

plate_bottom = tag_height - plate_height;
// 凹槽内缩量上限：保证凹槽始终落在牌面内
margin = min(recess_margin, min(plate_width, plate_height) / 2 - 3);

module tag_2d() {
  translate([-plate_width / 2, plate_bottom])
    square([plate_width, plate_height]);
  translate([-stake_width / 2, tip_length])
    square([stake_width, plate_bottom - tip_length + 0.01]);
  translate([-stake_width / 2, 0])
    polygon([[0, tip_length], [stake_width, tip_length], [stake_width / 2, 0]]);
}

difference() {
  linear_extrude(height = tag_thickness) tag_2d();
  // 顶部浅凹槽：马克笔书写不打滑
  translate([0, tag_height - plate_height / 2, tag_thickness - recess_depth])
    linear_extrude(height = recess_depth + 1)
      offset(r = 2)
        square([plate_width - 2 * margin, plate_height - 2 * margin], center = true);
}
`,
  },
  {
    id: 46,
    name: '笔筒带手机槽',
    category: '桌面收纳',
    level: 'classic',
    applies: '桌面笔筒 + 手机立槽、化妆刷筒、工具筒',
    idea: '圆筒笔筒外挂两片竖直夹板：夹板间距 = 手机厚 + 间隙，底部用一块垫板把它们和筒壁连成一体',
    points: [
      '槽宽 gap = phone_thickness + slot_clearance，手机插进去不晃',
      '内夹板伸进筒壁 2mm、垫板横跨两片夹板，union 后是一体',
      '手机下沿落在垫板顶面 pad_height，不会漏到桌面',
    ],
    code: `/* [笔筒] */
cup_diameter = 85; // [50:5:140]
cup_height = 100; // [50:5:180]
wall_thickness = 2.5; // [1.5:0.5:6]
bottom_thickness = 3; // [2:0.5:8]

/* [手机槽] */
phone_thickness = 8; // [5:0.5:15]
slot_clearance = 0.6; // [0.2:0.2:2]
slot_length = 60; // [40:2:100]
slot_height = 45; // [25:5:90]
fin_thickness = 4; // [2:0.5:8]
pad_height = 4; // [2:0.5:10]

/* [Hidden] */
$fn = 64;

cup_r = cup_diameter / 2;
inner_r = cup_r - wall_thickness;
gap = phone_thickness + slot_clearance;
fin1_x = inner_r - 2;
fin2_x = fin1_x + fin_thickness + gap;
pad_end = fin2_x + fin_thickness;

union() {
  // 笔筒
  difference() {
    cylinder(h = cup_height, r = cup_r);
    translate([0, 0, bottom_thickness])
      cylinder(h = cup_height, r = inner_r);
  }
  // 垫板：把两片夹板与筒壁连起来
  translate([fin1_x, -slot_length / 2, 0])
    cube([pad_end - fin1_x, slot_length, pad_height]);
  // 内夹板 / 外夹板
  translate([fin1_x, -slot_length / 2, 0])
    cube([fin_thickness, slot_length, slot_height]);
  translate([fin2_x, -slot_length / 2, 0])
    cube([fin_thickness, slot_length, slot_height]);
}
`,
  },
  {
    id: 47,
    name: 'XYZ 校准块',
    category: '桌面收纳',
    level: 'basic',
    applies: '打印机 XYZ 尺寸自检、孔径收缩对比、耗材公差快速验证',
    idea: '20mm 立方体作为通用 XYZ 基准，中心通孔、侧面横槽、顶部公差柱各测一项尺寸特征',
    points: [
      '20mm 立方体是通用 XYZ 基准，量外廓即可知道三轴是否准确',
      '通孔测孔径收缩，横槽贯通侧壁测层间结合，顶部柱测外径',
      '柱径与槽深都用 min() 夹紧，参数拉到极限也不会粘连或切穿',
    ],
    code: `/* [基准块] */
cube_size = 20; // [10:1:50]

/* [孔与槽] */
hole_diameter = 8; // [4:1:16]
slot_width = 2; // [1:0.5:6]
slot_depth = 8; // [3:1:20]

/* [公差柱] */
pin_count = 3; // [0:1:6]
pin_diameter = 4; // [2:0.5:8]
pin_height = 10; // [5:1:25]

/* [Hidden] */
$fn = 64;

difference() {
  cube([cube_size, cube_size, cube_size]);
  // 中心通孔
  translate([cube_size / 2, cube_size / 2, -0.5])
    cylinder(h = cube_size + 1, d = min(hole_diameter, cube_size - 4));
  // 侧向横槽：检验层间结合与缝隙
  translate([-1, cube_size / 2 - cube_size * 0.15, cube_size / 2 - slot_width / 2])
    cube([min(slot_depth, cube_size - 2) + 1, cube_size * 0.3, slot_width]);
}

// 顶部公差柱：柱径按间距夹紧，避免相邻柱粘连；
// Y 方向避开中心通孔，否则中间柱会悬在孔里成为独立零件
for (i = [0 : pin_count - 1]) {
  spacing = cube_size / (pin_count + 1);
  d = min(pin_diameter, spacing * 0.7);
  hole_r = min(hole_diameter, cube_size - 4) / 2;
  pin_y = max(cube_size * 0.18, cube_size / 2 - hole_r - d / 2 - 1);
  translate([spacing * (i + 1), pin_y, cube_size - 1])
    cylinder(h = pin_height + 1, d = d);
}
`,
  },
  {
    id: 48,
    name: '螺旋花瓶',
    category: '装饰造型',
    level: 'advanced',
    applies: '螺旋纹花瓶、扭曲纹装饰瓶、笔筒/收纳筒（改壁厚）',
    idea: '把带波浪起伏的环形轮廓用 linear_extrude 的 twist + scale 一次挤出：一边旋转一边收口，成型即是螺旋扭曲的瓶身',
    points: [
      'twist 单位是度，slices 要跟着加大（默认 72），否则扭曲面会拉成折面',
      '内腔 = 同一轮廓内缩 wall_thickness 再做 2D 差集，壁厚沿高度按 scale 等比变薄',
      '瓶底用同轮廓薄片 union 封口，瓶口保持开放',
    ],
    code: `/* [瓶体] */
vase_height = 140; // [60:5:250]
vase_diameter = 80; // [40:5:160]
wall_thickness = 2.5; // [1.5:0.5:5]
bottom_thickness = 3; // [2:0.5:8]

/* [螺旋] */
twist_angle = 90; // [0:15:360]
ripple_count = 6; // [0:1:12]
ripple_depth = 0.06; // [0:0.02:0.3]
top_scale = 0.8; // [0.65:0.05:1.2]

/* [细节] */
segments = 64; // [48:8:128]
slices = 72; // [40:8:160]

/* [Hidden] */
base_r = vase_diameter / 2;

function prof_r(t) = base_r * (1 + ripple_depth * cos(ripple_count * t));

outer_pts = [ for (i = [0 : segments - 1])
  let (t = i * 360 / segments)
  let (r = prof_r(t))
  [r * cos(t), r * sin(t)] ];

inner_pts = [ for (i = [0 : segments - 1])
  let (t = i * 360 / segments)
  let (r = prof_r(t) - wall_thickness)
  [r * cos(t), r * sin(t)] ];

module ring_2d() {
  difference() {
    polygon(outer_pts);
    polygon(inner_pts);
  }
}

union() {
  // 瓶身：twist 扭曲 + scale 收口
  linear_extrude(height = vase_height, twist = twist_angle, slices = slices, scale = top_scale)
    ring_2d();
  // 瓶底：同轮廓薄片封口
  linear_extrude(height = bottom_thickness)
    polygon(outer_pts);
}
`,
  },
  {
    id: 49,
    name: '燕尾榫拼接块',
    category: '装配结构',
    level: 'classic',
    applies: '两块板/两个盒体的可拆装拼接、燕尾滑轨、无螺丝装配',
    idea: '燕尾截面沿 Z 贯通挤出：榫头外端比根部宽，沿竖直方向滑入后就被斜面锁住；榫槽按 clearance 放大一圈，保证能滑动又不松垮',
    points: [
      '榫根埋进块体 1mm，union 才有实体重叠；只共面相接会产生开放边',
      '榫槽做成沿 Z 贯通的开槽（不是盲孔），装配方向是"从上往下套进去"',
      'clearance 取 0.2~0.4mm；FDM 上小于 0.15 基本装不进去',
      'tenon_d / neck 用 min() 收敛到块体尺寸以内，参数拉满时不会穿出块体',
      '这是两件套：左件带榫头、右件带榫槽，一起打印（测试里允许 2 个实体）',
    ],
    code: `/* [拼接块] */
block_w = 40; // [20:5:80]
block_d = 30; // [15:5:60]
block_h = 20; // [10:5:40]

/* [燕尾榫] */
tenon_neck = 12; // [6:1:24]
tenon_depth = 12; // [6:1:24]
tenon_flare = 4; // [1:0.5:8]
clearance = 0.3; // [0.1:0.05:0.6]

/* [排布] */
part_gap = 8; // [4:2:30]

/* [Hidden] */
$fn = 32;

// 参数收敛：榫不能长过块体，也不能宽过块体
tenon_d = min(tenon_depth, block_d - 4);
neck = min(tenon_neck, block_w - 2 * tenon_flare - 4);

// 燕尾截面（2D）：根部窄、外端宽 → 沿 Z 滑入后自锁
module dovetail_2d(clear = 0) {
  polygon([[-neck / 2 - clear, -1],
           [ neck / 2 + clear, -1],
           [ neck / 2 + tenon_flare + clear, tenon_d + clear],
           [-neck / 2 - tenon_flare - clear, tenon_d + clear]]);
}

// 左件：块体 + 榫头
union() {
  cube([block_w, block_d, block_h]);
  translate([block_w / 2, block_d, 0])
    linear_extrude(height = block_h)
      dovetail_2d();
}

// 右件：块体 - 榫槽（沿 Z 贯通，从上方套入）
translate([block_w + part_gap, 0, 0])
  difference() {
    cube([block_w, block_d, block_h]);
    translate([block_w / 2, 0, -1])
      linear_extrude(height = block_h + 2)
        dovetail_2d(clearance);
  }
`,
  },
  {
    id: 50,
    name: '卡扣式圆盖',
    category: '盒体收纳',
    level: 'classic',
    applies: '圆盒/圆罐的盖子、卡扣密封盖、样品盒盖',
    idea: '整块圆柱从底面掏空做出裙边与盖顶，再在裙边内壁 union 一圈向内凸的卡扣凸缘；凸缘靠裙边弹性越过盒口后卡住',
    points: [
      '先 difference 掏内腔，再 union 卡扣圈——顺序反了凸缘会被内腔一起切掉',
      '裙边内半径 = 盒外半径 + wall_clearance，凸缘再向内凸 bead_depth',
      '凸缘轴向位置用 min() 收敛到裙边高度以内，否则会藏进盖顶里',
      '凸缘外半径只比裙边内半径大 0.6mm，刚好嵌进裙边壁，不要超过盖体外径',
    ],
    code: `/* [盒体] */
box_outer_diameter = 60; // [30:2:120]
wall_clearance = 0.3; // [0.15:0.05:0.6]

/* [盖体] */
lid_wall = 2.5; // [1.5:0.5:5]
top_thickness = 3; // [2:0.5:6]
skirt_height = 10; // [6:1:25]

/* [卡扣] */
bead_depth = 0.8; // [0.3:0.1:1.5]
bead_height = 1.5; // [0.8:0.1:3]
bead_lift = 2; // [1:0.5:6]

/* [Hidden] */
$fn = 96;

rim_r = box_outer_diameter / 2 + wall_clearance;  // 裙边内半径
cap_r = rim_r + lid_wall;                          // 裙边外半径
bead_z = min(bead_lift, skirt_height - bead_height - 1);

// 主体：整块圆柱，从底面掏空，只留盖顶
difference() {
  cylinder(h = skirt_height + top_thickness, r = cap_r);
  translate([0, 0, -1])
    cylinder(h = skirt_height + 1, r = rim_r);
}

// 卡扣凸缘：内壁向内凸出一圈（放在掏空之后 union，才不会被切掉）
translate([0, 0, bead_z])
  difference() {
    cylinder(h = bead_height, r = rim_r + 0.6);
    translate([0, 0, -1])
      cylinder(h = bead_height + 2, r = rim_r - bead_depth);
  }
`,
  },
  {
    id: 51,
    name: '六边形壁架',
    category: '墙面收纳',
    level: 'advanced',
    applies: '六边形蜂窝墙架、多肉/香薰展示架、钥匙杂物架',
    idea: '六边形平台 + 内缩一圈的六边形边框组成托盘；后侧立一块背板，开两个"钥匙孔"（入口圆 + 上窄槽），挂在墙上的螺丝头上',
    points: [
      'circle($fn=6) 的第一个顶点在 0°，所以默认就有一条平边朝 -Y，背板正好贴这条边',
      '六边形平边到中心的距离是 hex_r * cos(30°)',
      '背板底面沉进平台 1mm 再 union，避免只有一条棱相接',
      '钥匙孔 = 入口圆 + 向上窄槽，都沿 Y 穿透背板；槽宽必须小于螺钉头直径',
      '边框 = 实心六棱柱减内缩六棱柱，再与平台重叠 1mm union',
    ],
    code: `/* [搁板] */
hex_radius = 70; // [40:5:150]
plate_thickness = 4; // [2.5:0.5:8]
rim_height = 12; // [6:1:30]
rim_wall = 3; // [2:0.5:6]

/* [背板] */
back_height = 40; // [25:5:90]
back_thickness = 5; // [3:0.5:8]

/* [钥匙孔] */
hole_spacing = 60; // [30:5:100]
entry_diameter = 8; // [6:0.5:12]
slot_width = 3.6; // [2.5:0.2:6]
slot_rise = 8; // [4:1:16]
hole_lift = 10; // [6:2:30]

/* [Hidden] */
$fn = 96;

apothem = hex_radius * cos(30);   // 平边到中心距离

hole_z = plate_thickness + max(2, min(hole_lift, back_height - slot_rise - 2));

module hex_prism(r, h) {
  linear_extrude(height = h)
    circle(r = r, $fn = 6);
}

difference() {
  union() {
    // 托盘底
    hex_prism(hex_radius, plate_thickness);
    // 边框：实心六棱柱减内缩六棱柱，底部与托盘重叠 1mm
    translate([0, 0, plate_thickness - 1])
      difference() {
        hex_prism(hex_radius, rim_height + 1);
        hex_prism(hex_radius - rim_wall, rim_height + 2);
      }
    // 背板：贴在 -Y 平边上，底面沉进平台 1mm
    translate([-hex_radius * 0.5, -apothem, plate_thickness - 1])
      cube([hex_radius, back_thickness, back_height + 1]);
  }
  // 钥匙孔：入口圆 + 向上窄槽，沿 Y 穿透背板
  for (sx = [-1, 1])
    translate([sx * hole_spacing / 2, -apothem + back_thickness / 2, hole_z]) {
      rotate([-90, 0, 0])
        cylinder(h = back_thickness + 4, r = entry_diameter / 2, center = true);
      translate([-slot_width / 2, -(back_thickness + 4) / 2, 0])
        cube([slot_width, back_thickness + 4, slot_rise]);
    }
}
`,
  },
  {
    id: 52,
    name: '香薰烛台',
    category: '装饰造型',
    level: 'classic',
    applies: '茶蜡烛台、香薰蜡烛杯、礼品烛座',
    idea: '同心双筒：外筒内部掏一个更小的烛槽，槽底留料；槽壁上开一圈等高径向通气孔给火焰供氧，外壁再切竖槽做装饰',
    points: [
      '烛槽深度用 min() 收敛，别把底掏穿；pocket_floor 就是通气孔的高度基准',
      '通气孔沿径向钻穿侧壁，孔的下沿要高于烛槽底面，否则会漏蜡',
      '装饰竖槽用"加长 1mm 的立方体"切外壁，只切出凹槽、不穿透',
      '底沿外扩 1mm 做稳定裙边，烛台不容易被碰倒',
    ],
    code: `/* [烛杯] */
outer_diameter = 46; // [35:1:80]
cup_height = 26; // [14:1:50]
wall_thickness = 3; // [2:0.5:6]
base_thickness = 3; // [2:0.5:8]

/* [烛槽] */
candle_diameter = 39.5; // [30:0.5:60]
candle_depth = 18; // [8:1:40]

/* [通气孔] */
vent_count = 6; // [0:1:12]
vent_diameter = 5; // [3:0.5:10]
vent_lift = 4; // [2:0.5:10]

/* [装饰] */
flute_count = 12; // [0:1:24]
flute_depth = 1; // [0.5:0.25:3]

/* [Hidden] */
$fn = 96;

outer_r = outer_diameter / 2;
pocket_d = min(candle_diameter, outer_diameter - 2 * wall_thickness - 2);
pocket_h = min(candle_depth, cup_height - base_thickness - 2);
pocket_floor = cup_height - pocket_h;

difference() {
  union() {
    cylinder(h = cup_height, r = outer_r);
    // 底沿外扩，增加稳定性
    cylinder(h = 2.5, r = outer_r + 1);
  }
  // 烛槽
  translate([0, 0, pocket_floor])
    cylinder(h = pocket_h + 1, r = pocket_d / 2);
  // 通气孔：径向钻穿侧壁
  if (vent_count > 0)
    for (i = [0 : vent_count - 1])
      rotate([0, 0, i * 360 / vent_count])
        translate([0, 0, pocket_floor + vent_lift])
          rotate([0, 90, 0])
            cylinder(h = outer_r + 4, r = vent_diameter / 2);
  // 装饰竖槽：只在外壁凹进去，不穿透
  if (flute_count > 0)
    for (i = [0 : flute_count - 1])
      rotate([0, 0, i * 360 / flute_count])
        translate([outer_r - flute_depth, -2, -1])
          cube([flute_depth + 2, 4, cup_height + 2]);
}
`,
  },
  {
    id: 53,
    name: '批头收纳座',
    category: '实用工具',
    level: 'basic',
    applies: '六角/圆柄批头收纳、钻头座、螺丝刀头架',
    idea: '圆角矩形底座上开两排盲孔：一排 $fn=6 的六角孔插六角批头，一排圆孔插圆柄；孔深小于座高，底部留料托住批头',
    points: [
      '六角孔直接给 cylinder 的 $fn = 6，不用手算多边形',
      '两排各自均分：间距 = (长度 - 2×边距) / max(列数-1, 1)，列数为 1 时不除零',
      '盲孔深度用 min() 收敛到 base_height - 2，底部至少留 2mm 料',
      '圆角用 offset + linear_extrude，比 minkowski 快得多',
    ],
    code: `/* [底座] */
base_length = 100; // [60:5:160]
base_width = 55; // [35:5:120]
base_height = 16; // [10:2:40]
corner_radius = 6; // [0:1:15]

/* [六角孔（6.35mm 批头）] */
hex_cols = 8; // [2:1:16]
hex_hole = 6.7; // [5:0.25:9]

/* [圆孔（4mm 细批头）] */
round_cols = 8; // [2:1:16]
round_hole = 4.2; // [3:0.25:6]

/* [孔深] */
hole_depth = 11; // [4:1:30]
margin = 6; // [3:1:15]

/* [Hidden] */
$fn = 48;

hole_d = min(hole_depth, base_height - 2);
hole_span = base_length - 2 * margin;
hex_pitch = hole_span / max(hex_cols - 1, 1);
round_pitch = hole_span / max(round_cols - 1, 1);
hex_y = base_width * 0.30 - base_width / 2;
round_y = base_width * 0.72 - base_width / 2;

difference() {
  translate([-base_length / 2, -base_width / 2, 0])
    linear_extrude(height = base_height)
      offset(r = corner_radius)
        square([base_length - 2 * corner_radius, base_width - 2 * corner_radius]);

  // 六角孔
  for (i = [0 : hex_cols - 1])
    translate([-hole_span / 2 + i * hex_pitch, hex_y, base_height - hole_d])
      cylinder(h = hole_d + 1, r = hex_hole / 2, $fn = 6);

  // 圆孔
  for (i = [0 : round_cols - 1])
    translate([-hole_span / 2 + i * round_pitch, round_y, base_height - hole_d])
      cylinder(h = hole_d + 1, r = round_hole / 2);
}
`,
  },
  {
    id: 54,
    name: '线轴支架',
    category: '实用工具',
    level: 'classic',
    applies: '3D 打印机料盘架、线轴立架、胶带/绳卷支架',
    idea: '配重底板 + 一端立柱 + 悬臂轴：轴水平伸出并悬在底板正上方，线轴套上去后重心仍落在底板范围内',
    points: [
      '轴要伸到底板上方（不是伸出板外），否则装上料盘就翻倒',
      '立柱底部沉进底板 1mm 才 union 成一体',
      '三角加强筋：先在 X-Y 平面画三角形 linear_extrude，再 rotate([0,-90,0]) 把挤出方向转到 X、三角形立到 Y-Z 平面',
      '轴径要小于料盘内孔（常见 50~55mm 孔，轴取 40mm 左右）',
    ],
    code: `/* [底板] */
base_length = 90; // [60:5:170]
base_depth = 90; // [60:5:170]
base_thickness = 6; // [4:0.5:12]

/* [立柱] */
post_width = 30; // [16:1:60]
post_thickness = 12; // [8:1:30]
post_height = 50; // [30:2:90]

/* [悬臂轴] */
shaft_diameter = 40; // [20:1:60]
shaft_length = 70; // [40:2:150]

/* [Hidden] */
$fn = 64;

base_half = base_depth / 2;
// 轴心高度：至少让轴底离开底板，同时尽量收在立柱高度内
shaft_z = max(base_thickness + shaft_diameter / 2,
              min(base_thickness + shaft_diameter / 2 + 2, base_thickness + post_height - 2));
shaft_y0 = -base_half + post_thickness - 1;

// 底板
translate([-base_length / 2, -base_half, 0])
  cube([base_length, base_depth, base_thickness]);

// 立柱：立在 -Y 端
translate([-post_width / 2, -base_half, base_thickness - 1])
  cube([post_width, post_thickness, post_height + 1]);

// 三角加强筋：X-Y 平面三角形挤出后转到 Y-Z 平面
translate([post_width / 2, shaft_y0, base_thickness - 1])
  rotate([0, -90, 0])
    linear_extrude(height = post_width - 4)
      polygon([[0, 0], [post_height * 0.75, 0], [0, post_height * 0.75]]);

// 悬臂轴：从立柱前面伸出，末端留在底板范围内
translate([0, shaft_y0, shaft_z])
  rotate([-90, 0, 0])
    cylinder(h = min(shaft_length, base_depth - post_thickness - 4), r = shaft_diameter / 2);
`,
  },
  {
    id: 56,
    name: '直角角码',
    category: '实用工具',
    level: 'classic',
    applies: '层板/框架直角连接、桌面加固角码、家具补强',
    idea: '两条互相垂直的立板在拐角重叠成一体；横腿开沉头通孔（螺丝从外侧拧入），竖腿开直通孔 + 六角螺母槽（螺母嵌入）',
    points: [
      '两腿在拐角共享一块 plate_thickness×plate_thickness 的方料，union 后自然成一体',
      '沉头 = 上大下小的圆台（cylinder 的 r1 小、r2 大）+ 直通孔，锥深 head_depth',
      '螺母槽是 $fn=6 的六棱柱，r 取"对边距 / (2·cos30°)"',
      '沉头孔和螺母槽不要开在同一条腿上，否则螺纹件互相打架',
    ],
    code: `/* [角码] */
leg_length = 60; // [35:2:150]
bracket_width = 30; // [16:1:80]
plate_thickness = 5; // [3:0.5:12]

/* [沉头腿] */
screw_hole = 3.4; // [2.5:0.1:6]
head_hole = 6.4; // [4:0.2:12]
head_depth = 2.2; // [1:0.2:5]
screw_count = 2; // [1:1:4]

/* [螺母槽腿] */
nut_depth = 3; // [2:0.2:6]
nut_across = 5.6; // [4:0.1:12]

/* [Hidden] */
$fn = 48;

nut_r = nut_across / (2 * cos(30));  // 对边距 → 六棱柱外接半径

difference() {
  union() {
    // 竖腿（贴 -Y 面）
    cube([bracket_width, plate_thickness, leg_length]);
    // 横腿（贴底面）
    cube([bracket_width, leg_length, plate_thickness]);
  }

  for (i = [0 : screw_count - 1]) {
    p = leg_length * (i + 1) / (screw_count + 1);

    // 横腿：顶部沉头 + 贯穿孔
    translate([bracket_width / 2, p, plate_thickness - head_depth])
      cylinder(h = head_depth + 1, r1 = screw_hole / 2, r2 = head_hole / 2);
    translate([bracket_width / 2, p, -1])
      cylinder(h = plate_thickness + 2, r = screw_hole / 2);

    // 竖腿：贯穿孔 + 内侧六角螺母槽
    translate([bracket_width / 2, -1, p])
      rotate([-90, 0, 0])
        cylinder(h = plate_thickness + 2, r = screw_hole / 2);
    translate([bracket_width / 2, plate_thickness - nut_depth, p])
      rotate([-90, 0, 0])
        cylinder(h = nut_depth + 1, r = nut_r, $fn = 6);
  }
}
`,
  },
  {
    id: 57,
    name: '螺旋桨（扭转挤出叶片）',
    category: '机械零件',
    level: 'advanced',
    applies: '螺旋桨、风扇叶片、涡轮叶片、船桨、流线型翼片',
    idea: '叶片就是一条"两端全圆的翼型截面"沿展向 linear_extrude：twist 让它边伸边扭转，scale 让它边伸边收窄；再 rotate 把桨距立起来，2~5 片绕桨毂阵列',
    points: [
      '截面 = hull(两个圆)，圆半径 = 半个厚度，两圆间距 = 弦长 - 厚度 → 得到两头全圆的翼型',
      'twist 是沿挤出轴的总扭转角；slices 要 ≥ 40，否则扭曲面会拉成折面',
      '挤出方向默认 +Z，用 rotate([0,90,0]) 把展向转到 +X；再 rotate([root_pitch,0,0]) 立起桨距',
      'scale 是等比缩放：桨尖弦长和厚度一起收，想单独收厚度就改截面圆半径',
      '桨根埋进桨毂 2mm；桨毂半径要 ≥ 桨根弦长的一半，否则根部会露在外面',
      '别用 hull 逐段链式放样：叶片本体干净，但和桨毂 union 后接缝处会随机冒出 8~40 条非流形边（实测）',
    ],
    code: `/* [桨毂] */
hub_diameter = 26; // [12:1:50]
hub_height = 16; // [8:1:30]
shaft_bore = 5.2; // [0:0.2:12]

/* [桨叶] */
blade_count = 3; // [2:1:5]
blade_length = 60; // [30:5:120]
root_chord = 24; // [10:0.5:40]
root_thickness = 4; // [1.5:0.2:8]
tip_scale = 0.55; // [0.25:0.05:1]

/* [扭转] */
root_pitch = 30; // [0:5:60]
twist_angle = 25; // [-60:5:60]
slices = 40; // [20:1:120]

/* [Hidden] */
$fn = 48;
profile_fn = 24;

hub_r = hub_diameter / 2;
blade_z = hub_height / 2;
root_d = hub_r - 2;              // 桨根埋进桨毂 2mm
pr = root_thickness / 2;         // 截面圆半径 = 半厚

module blade_profile() {
  hull() {
    translate([0, root_chord / 2 - pr]) circle(r = pr, $fn = profile_fn);
    translate([0, -root_chord / 2 + pr]) circle(r = pr, $fn = profile_fn);
  }
}

module blade() {
  rotate([root_pitch, 0, 0])
    rotate([0, 90, 0])
      linear_extrude(height = blade_length, twist = twist_angle, slices = slices, scale = tip_scale)
        blade_profile();
}

difference() {
  union() {
    cylinder(h = hub_height, r = hub_r);
    for (k = [0 : blade_count - 1])
      rotate([0, 0, k * 360 / blade_count])
        translate([root_d, 0, blade_z])
          blade();
  }
  translate([0, 0, -1])
    cylinder(h = hub_height + 2, r = shaft_bore / 2);
}
`,
  },
  {
    id: 58,
    name: '体素地形摆件（hash 噪声）',
    category: '体素造型',
    level: 'classic',
    applies: '我的世界风地形、像素方块摆件、随机山脉装饰、体素地形沙盘',
    idea: '用 fract(sin(n)·43758.5) 自己造伪随机，再做值噪声 + 平滑插值得到高度场；每个格子拉一根方块柱，柱高离散成层级，就是方块地形',
    points: [
      'OpenSCAD 没有 random()，标准做法是 hash(n) = fract(sin(n + seed) * 43758.5453)',
      '值噪声 = 四角 hash 双线性插值，插值前用 smoothstep 让过渡不生硬',
      '一个格子只生成一根柱（不是每层一个方块），实体数 = 格数，不会爆',
      '整片规则网格可以严格相邻：Manifold 会把共面合并掉，实测 100 根柱 = 0 开放边',
      '但别给方块加 0.01 这种"贴容差"的微小缩放，角上会留下退化的 0.01×0.01 重叠，实测冒出 14 条开放边',
      '所有柱子下沉 0.5mm 插进底座，保证是一整块',
    ],
    code: `/* [地形] */
grid_size = 10; // [6:1:16]
block = 6; // [3:0.5:10]
max_levels = 5; // [2:1:10]

/* [噪声] */
seed = 12345; // [1:1:99999]
noise_scale = 0.18; // [0.05:0.01:0.6]
octave2 = 0.45; // [0:0.05:1]

/* [底座] */
base_thickness = 2; // [1:0.5:6]
base_margin = 3; // [0:1:8]

/* [Hidden] */
$fn = 24;

world = grid_size * block;
half = world / 2;

function hash(n) = let (v = sin(n * 12.9898 + seed) * 43758.5453) v - floor(v);
function smooth(t) = t * t * (3 - 2 * t);
function mix(a, b, t) = a + (b - a) * t;

function vnoise(x, y) =
  let (i = floor(x), j = floor(y), fx = smooth(x - i), fy = smooth(y - j))
  let (a = hash(i + j * 57), b = hash(i + 1 + j * 57),
       c = hash(i + (j + 1) * 57), d = hash(i + 1 + (j + 1) * 57))
  mix(mix(a, b, fx), mix(c, d, fx), fy);

function height_at(x, y) =
  let (v = (vnoise(x * noise_scale, y * noise_scale)
          + vnoise(x * noise_scale * 2, y * noise_scale * 2) * octave2) / (1 + octave2))
  min(max_levels, max(1, floor(v * max_levels) + 1));

translate([-half, -half, 0]) {
  // 底座：比地形大一圈
  translate([-base_margin, -base_margin, 0])
    cube([world + 2 * base_margin, world + 2 * base_margin, base_thickness]);

  // 方块柱：每格一根，下沉 0.5mm 与底座相交
  for (i = [0 : grid_size - 1])
    for (j = [0 : grid_size - 1]) {
      h = height_at(i, j);
      translate([i * block, j * block, base_thickness - 0.5])
        cube([block, block, h * block + 0.5]);
    }
}
`,
  },
  {
    id: 59,
    name: '蜂窝穿孔减重板',
    category: '机械零件',
    level: 'classic',
    applies: '蜂窝镂空装饰板、散热格栅、减重盖板、透气墙板',
    idea: '圆角矩形板做外形，用 intersection 把"内缩边框区"和"蜂窝阵列"取交集，得到的蜂窝再一次性减掉——边框完整、内部是规整的六边形网格',
    points: [
      'circle(r, $fn=6) 得到的就是正六边形，不用手算顶点',
      '蜂窝排布：列距 1.5r，行距 1.732r，奇数列再偏移半个行距',
      '孔半径乘系数 k = 1 + web/(2r) 放大间距，六边形之间才留出筋',
      '用 intersection(内缩区, 蜂窝) 再差集，边框自然保留，不会切到外轮廓',
      '安装孔放在边框正中；边框宽度要 ≥ 孔径 + 2.4，否则孔边只剩一层皮',
    ],
    code: `/* [面板] */
panel_width = 120; // [40:5:200]
panel_depth = 80; // [30:5:150]
panel_thickness = 4; // [2:0.5:10]
corner_radius = 8; // [0:1:20]
border = 8; // [3:1:20]

/* [蜂窝] */
hole_radius = 6; // [3:0.5:14]
web = 1.2; // [0.8:0.1:4]

/* [安装孔] */
mount_holes = true;
mount_hole = 4.2; // [0:0.2:8]

/* [Hidden] */
$fn = 36;

r = hole_radius;
k = 1 + web / (2 * r);                 // 间距放大，留出筋
dx = 1.5 * r * k;
dy = 1.732 * r * k;
cols = max(1, floor((panel_width - 2 * border) / dx) + 1);
rows = max(1, floor((panel_depth - 2 * border) / dy) + 1);
mount_r = min(mount_hole / 2, border / 2 - 1.2);
mount_x = panel_width / 2 - border / 2;
mount_y = panel_depth / 2 - border / 2;

module panel_2d() {
  offset(r = corner_radius)
    square([panel_width - 2 * corner_radius, panel_depth - 2 * corner_radius], center = true);
}

module hexes_2d() {
  start_x = -(cols - 1) * dx / 2;
  start_y = -(rows - 1) * dy / 2;
  for (i = [0 : cols - 1])
    for (j = [0 : rows - 1])
      translate([start_x + i * dx, start_y + j * dy + (i % 2) * dy / 2 - dy / 4])
        circle(r = r, $fn = 6);
}

difference() {
  linear_extrude(height = panel_thickness)
    panel_2d();

  // 蜂窝孔只挖在边框以内
  translate([0, 0, -1])
    linear_extrude(height = panel_thickness + 2)
      intersection() {
        offset(r = -border) panel_2d();
        hexes_2d();
      }

  // 四角安装孔
  if (mount_holes && mount_r > 0.5)
    for (sx = [-1, 1], sy = [-1, 1])
      translate([sx * mount_x, sy * mount_y, -1])
        cylinder(h = panel_thickness + 2, r = mount_r);
}
`,
  },
  {
    id: 60,
    name: '像素画 / 拼豆板',
    category: '像素与图案',
    level: 'classic',
    applies: '图片转像素画、拼豆底板、头像浮雕、logo 摆件、儿童拼板',
    idea: '像素数据塞进一个字符串常量，SCAD 端用 [for (c = pixels) ord(c) - 48] 还原成数字数组；每格按等级拉成方块（浮雕）或摆一颗空心珠（拼豆）',
    points: [
      '字符串是塞一堆数据的轻量写法：每格一个字符，16×16 只有 256 字节',
      'OpenSCAD 没有字符串下标，但可以直接迭代字符串，for (c = pixels) 逐个拿到 1 字符',
      'ord(c) 取字符编码，减 48 就是 0~9 的数字；0 = 空白，1~3 = 逐级变高',
      '底座用 offset + linear_extrude 做圆角，所有像素块下沉 1mm 与底座相交',
      '像素块露出高度 = 等级 × layer_height，从底板顶面往上长；不要从底板内部起算',
      '拼豆珠 = 圆柱减通孔，孔只在该珠自己的 difference 里切，不会伤到底板',
      '格子按 0.84 倍收缩留缝，像素之间才有分隔感；改 cell 就能整体缩放',
    ],
    code: `/* [画板] */
cell = 6; // [3:0.5:12]
base_thickness = 2.4; // [1.2:0.2:8]
corner_radius = 3; // [0:0.5:12]

/* [样式] */
style = 0; // [0: 分层浮雕, 1: 拼豆空心珠]
layer_height = 1.2; // [0.4:0.2:4]
bead_height = 4; // [2:0.5:8]

/* [Hidden] */
$fn = 32;

// 像素数据：16×16，每格一个字符。0=空白，1~2=逐级变高（拼豆模式下 >0 就是一颗）
cols = 16;
rows = 16;
pixels = str(
  "0000000000000000",  // 第 1 行
  "0000000000000000",
  "0011100000111000",
  "0122210001222100",
  "1222221122222210",
  "1222222222222221",
  "1222222222222221",
  "0122222222222210",
  "0012222222222100",
  "0001222222221000",
  "0000122222210000",
  "0000012222100000",
  "0000001221000000",
  "0000000110000000",
  "0000000000000000",
  "0000000000000000"
);

data = [for (c = pixels) ord(c) - 48];
function px(i, j) = let (k = j * cols + i) (k >= 0 && k < len(data)) ? data[k] : 0;

board_w = cols * cell;
board_d = rows * cell;

union() {
  // 底板
  linear_extrude(height = base_thickness)
    offset(r = corner_radius)
      square([board_w - 2 * corner_radius, board_d - 2 * corner_radius], center = true);

  // 像素块 / 拼豆珠
  for (i = [0 : cols - 1])
    for (j = [0 : rows - 1]) {
      v = px(i, j);
      if (v > 0) {
        x = -board_w / 2 + (i + 0.5) * cell;
        y = board_d / 2 - (j + 0.5) * cell;
        translate([x, y, base_thickness - 1]) {
          if (style == 0) {
            translate([-cell * 0.42, -cell * 0.42, 0])
              cube([cell * 0.84, cell * 0.84, v * layer_height + 1]);
          } else {
            difference() {
              cylinder(h = bead_height + 1, r = cell * 0.42);
              translate([0, 0, -0.5])
                cylinder(h = bead_height + 2, r = cell * 0.17);
            }
          }
        }
      }
    }
}
`,
  },
  {
    id: 61,
    name: '磁吸收纳条',
    category: '墙面收纳',
    level: 'basic',
    applies: '冰箱贴条、工具磁条、洞洞板磁吸底座、厨房刀架背条',
    idea: '一根圆角长条，背后等距开一排圆磁铁沉孔；打印时正面朝下、孔朝上，不用桥接，磁铁用胶固定后整条吸在金属面上',
    points: [
      '磁铁孔是盲孔：深度 = 磁铁厚 + 0.2，直径 = 磁铁径 + 0.2（过盈靠胶补）',
      '孔朝上打印：把正面放在热床上，孔是竖直的，不会出现桥接',
      '孔之间至少留 2mm 筋，否则相邻孔壁被掏空，条子一掰就断',
      '孔从背面往下切，孔底留 1.5mm 以上的料，不能把条子打穿',
      '磁铁极性会互相排斥，装之前先按同一面吸一遍再点胶',
    ],
    code: `/* [条体] */
bar_length = 200; // [80:10:300]
bar_width = 20; // [12:1:60]
bar_thickness = 8; // [5:0.5:20]
edge_radius = 3; // [0:0.5:8]

/* [磁铁] */
magnet_diameter = 8; // [3:0.5:20]
magnet_depth = 3; // [1:0.2:8]
magnet_count = 5; // [2:1:12]

/* [Hidden] */
$fn = 48;

magnet_d = magnet_diameter + 0.2;              // 过盈靠胶补
pocket_d = min(magnet_depth + 0.2, bar_thickness - 1.5);
pitch = bar_length / (magnet_count + 1);

difference() {
  // 条体：圆角矩形，正面（z=0）贴床打印
  linear_extrude(height = bar_thickness)
    offset(r = edge_radius)
      square([bar_length - 2 * edge_radius, bar_width - 2 * edge_radius], center = true);

  // 背面磁铁沉孔
  for (i = [0 : magnet_count - 1])
    translate([-bar_length / 2 + pitch * (i + 1), 0, bar_thickness - pocket_d])
      cylinder(h = pocket_d + 1, r = magnet_d / 2, $fn = 36);
}
`,
  },
  // ─────────────────────────────────────────────────────────────
  // 复杂结构（机构 / 工程结构 / 装配体）：展示"结构可以做到多完整"
  // ─────────────────────────────────────────────────────────────
  {
    id: 62,
    name: '行星齿轮组',
    category: '机械传动',
    level: 'advanced',
    applies: '行星减速器教学模型、齿轮传动演示件、机器人关节减速箱外观件',
    idea: '太阳轮居中、行星轮绕它公转、内齿圈包在最外——三者齿数必须满足 ring = sun + 2×planet 才能同轴啮合；整套按拆解图平铺在热床上，一件一套',
    points: [
      '齿数约束是硬条件：内齿数 = 太阳齿数 + 2×行星齿数，改了任意一个另外两个必须跟着改',
      '中心距 = 模数 × (z1 + z2) / 2；太阳-行星啮合的中心距必须等于 (z_sun + z_planet) × 模数 / 2',
      '齿形用梯形近似：齿顶半角 0.16×齿距角、齿根半角 0.30，比理论渐开线简单但轮廓干净',
      '齿根比齿顶高（1.15 模数 vs 0.9 模数），留出齿顶间隙，啮合时不会顶死',
      '内齿圈用"外圆 - 中心孔 - 反齿槽"三步做，齿槽是开向圆心的梯形',
      '这是拆解件：内齿圈、太阳轮、若干行星轮分列摆开，不互相接触',
    ],
    code: `/* [齿轮组] */
module_size = 2.4; // [1.2:0.1:5]
sun_teeth = 12; // [8:1:24]
planet_teeth = 9; // [6:1:18]
planet_count = 3; // [2,3,4,5]
gear_thickness = 8; // [4:1:20]
ring_rim = 7; // [4:1:16]

/* [拆解排布] */
part_gap = 12; // [6:2:40]

/* [Hidden] */
$fn = 48;

addendum = 0.9 * module_size;
dedendum = 1.15 * module_size;
ring_teeth = sun_teeth + 2 * planet_teeth;   // 同轴啮合的必要条件

function pol(r, a) = [r * cos(a), r * sin(a)];

// 外齿轮：轮毂圆柱 + 一圈梯形齿
module spur_gear(teeth) {
  pitch_r = module_size * teeth / 2;
  r_tip = pitch_r + addendum;
  r_root = pitch_r - dedendum;
  pa = 360 / teeth;
  tooth = [pol(r_root - 1, -pa * 0.30), pol(r_tip, -pa * 0.16),
           pol(r_tip, pa * 0.16), pol(r_root - 1, pa * 0.30)];
  union() {
    cylinder(h = gear_thickness, r = r_root + 0.5);
    for (i = [0 : teeth - 1])
      rotate([0, 0, i * pa])
        linear_extrude(height = gear_thickness)
          polygon(points = tooth);
  }
}

// 内齿圈：外缘圆柱 - 中心孔 - 朝内的反齿槽
module ring_gear() {
  pitch_r = module_size * ring_teeth / 2;
  r_tip = pitch_r - addendum;          // 内齿齿顶（朝圆心）
  r_root = pitch_r + dedendum;         // 齿槽底
  pa = 360 / ring_teeth;
  gap = [pol(r_tip - 2, -pa * 0.30), pol(r_root + 0.6, -pa * 0.24),
         pol(r_root + 0.6, pa * 0.24), pol(r_tip - 2, pa * 0.30)];
  difference() {
    cylinder(h = gear_thickness, r = r_root + ring_rim);
    translate([0, 0, -1])
      cylinder(h = gear_thickness + 2, r = r_tip + 0.4);
    for (i = [0 : ring_teeth - 1])
      rotate([0, 0, (i + 0.5) * pa])
        translate([0, 0, -1])
          linear_extrude(height = gear_thickness + 2)
            polygon(points = gap);
  }
}

ring_od = 2 * (module_size * ring_teeth / 2 + dedendum + ring_rim);
sun_od = 2 * (module_size * sun_teeth / 2 + addendum);
planet_od = 2 * (module_size * planet_teeth / 2 + addendum);

// 拆解图：内齿圈 / 太阳轮 / 一列行星轮
translate([ring_od / 2, 0, 0]) ring_gear();
translate([ring_od + part_gap + sun_od / 2, 0, 0]) spur_gear(sun_teeth);
for (i = [0 : planet_count - 1])
  translate([ring_od + part_gap + sun_od + part_gap + planet_od / 2,
             (i - (planet_count - 1) / 2) * (planet_od + part_gap), 0])
    spur_gear(planet_teeth);
`,
  },
  {
    id: 63,
    name: '桁架桥摆件',
    category: '工程结构',
    level: 'advanced',
    applies: '桥梁模型、桌面景观、结构教学件、可按跨度/高度/节间数自由缩放',
    idea: '桥面 + 两侧 Warren 桁架：上下弦各一根通长梁，竖杆按节间均分，斜杆左右交替成锯齿；全部用同一个 beam 模块按两点坐标生成，改节间数整桥自动重排',
    points: [
      '所有杆件都是同一个 beam 模块：输入两端点 [x, z]，内部算长度和倾角再旋转',
      '杆件截面统一 member×member，端点埋进弦杆 1 个截面深度，union 后没有共面接触',
      '斜杆按 i % 2 交替方向，形成连续的 W 形，受力路径完整',
      '上弦之间加横向连系杆，桥面横跨两侧下弦——三者共同把两片桁架连成一个整体',
      '栏杆高度参数设 0 可以去掉扶手，整桥仍是单一连通体',
    ],
    code: `/* [桥体] */
span = 200; // [80:10:300]
bridge_width = 60; // [30:5:120]
truss_height = 42; // [20:5:90]
panels = 8; // [4:1:14]

/* [构件截面] */
member = 4; // [2:0.5:10]
deck_t = 6; // [3:1:12]
rail_height = 14; // [0:5:40]

/* [Hidden] */
$fn = 24;

panel_len = span / panels;
truss_y = bridge_width / 2 - member / 2;

// 在 XZ 平面里放一根从 p1 到 p2 的方梁（p = [x, z]）
module beam_xz(p1, p2) {
  dx = p2[0] - p1[0];
  dz = p2[1] - p1[1];
  len = norm([dx, dz]);
  ang = atan2(dz, dx);
  translate([p1[0], 0, p1[1]])
    rotate([0, -ang, 0])
      translate([0, -member / 2, -member / 2])
        cube([len, member, member]);
}

module side_truss() {
  // 下弦 / 上弦
  cube([span, member, member]);
  translate([0, 0, truss_height - member]) cube([span, member, member]);
  // 竖杆
  for (i = [1 : panels - 1])
    translate([i * panel_len - member / 2, 0, 0])
      cube([member, member, truss_height]);
  // 斜杆：左右交替
  for (i = [0 : panels - 1]) {
    x0 = i * panel_len;
    x1 = (i + 1) * panel_len;
    if (i % 2 == 0)
      beam_xz([x0, member], [x1, truss_height - member]);
    else
      beam_xz([x0, truss_height - member], [x1, member]);
  }
}

union() {
  // 桥面
  cube([span, bridge_width, deck_t]);
  // 两侧桁架（下弦埋进桥面）
  translate([0, truss_y, 0]) side_truss();
  translate([0, -truss_y, 0]) side_truss();
  // 上弦横向连系杆
  for (i = [1 : panels - 1])
    translate([i * panel_len - member / 2, -truss_y, truss_height - member])
      cube([member, 2 * truss_y, member]);
  // 栏杆
  if (rail_height > 0) {
    for (y = [-truss_y, truss_y]) {
      translate([0, y - member / 2, truss_height])
        cube([span, member, member]);
      for (i = [0 : panels])
        translate([i * panel_len - member / 2, y - member / 2, truss_height - member])
          cube([member, member, rail_height + member]);
    }
  }
}
`,
  },
  {
    id: 64,
    name: '螺旋楼梯',
    category: '工程结构',
    level: 'advanced',
    applies: '建筑模型、桌摆、灯座底盘、可按层高/转角/踏步数缩放的旋转结构',
    idea: '中心柱承担全部连接，扇形踏步绕柱逐级旋转抬升，踏步内弧伸进柱子 1mm；外圈立柱从踏板表面长出来，顶端用 beam3d 方梁连成螺旋扶手',
    points: [
      '扇形踏步用内弧+外弧两段折线拼成 polygon，段数 8 已足够顺滑，再多只是浪费三角面',
      '每级踏步比节距宽 6%（overlap），投影上互相咬合，视觉连续但不会真的相交',
      '踏步起始角 = i × 总转角/踏步数；高度 = i × 单级升高，两者共用同一个 i，改踏步数时旋转和抬升同步变化',
      '任意两点之间的梁用 beam3d：先算偏航角绕 Z，再算俯仰角绕 Y，最后放一根方梁',
      '栏杆立柱下沉 1mm 埋进踏板，避免底面与踏板顶面共面',
      '中心柱、底座、踏步、栏杆全部并进同一个 union，整体是一个连通体',
    ],
    code: `/* [楼梯] */
step_count = 14; // [6:1:24]
total_turn = 300; // [90:15:360]
step_rise = 16; // [8:1:30]
column_radius = 9; // [5:1:20]
outer_radius = 55; // [30:5:120]
step_thickness = 8; // [4:1:16]

/* [栏杆] */
baluster_height = 45; // [0:5:90]
rail_size = 3.2; // [2:0.2:6]

/* [底座] */
base_radius = 34; // [20:2:90]

/* [Hidden] */
$fn = 36;

sweep = total_turn / step_count;
overlap = 1.06;
r_in = column_radius - 1;
rail_r = outer_radius - 4;

function pol(r, a) = [r * cos(a), r * sin(a)];
function step_top(i) = i * step_rise + step_thickness;
function baluster_pos(i) =
  [rail_r * cos(i * sweep), rail_r * sin(i * sweep), step_top(i) - 1];
function rail_point(i) =
  let (p = baluster_pos(i)) [p[0], p[1], p[2] + baluster_height];

// 扇形踏步截面
module tread_2d(a0, a1) {
  seg = 8;
  outer = [for (k = [0 : seg]) pol(outer_radius, a0 + (a1 - a0) * k / seg)];
  inner = [for (k = [0 : seg]) pol(r_in, a1 - (a1 - a0) * k / seg)];
  polygon(points = concat(outer, inner));
}

module step(i) {
  translate([0, 0, i * step_rise])
    rotate([0, 0, i * sweep])
      linear_extrude(height = step_thickness)
        tread_2d(-sweep * overlap / 2, sweep * overlap / 2);
}

// 任意两点之间的方梁
module beam3d(p1, p2, w) {
  d = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
  yaw = atan2(d[1], d[0]);
  pitch = atan2(d[2], sqrt(d[0] * d[0] + d[1] * d[1]));
  translate(p1)
    rotate([0, 0, yaw])
      rotate([0, -pitch, 0])
        translate([0, -w / 2, -w / 2])
          cube([norm(d), w, w]);
}

union() {
  // 底座 + 中心柱
  cylinder(h = 8, r = base_radius);
  cylinder(h = (step_count - 1) * step_rise + step_thickness + 12, r = column_radius);
  // 踏步
  for (i = [0 : step_count - 1]) step(i);
  // 立柱 + 螺旋扶手
  if (baluster_height > 0) {
    for (i = [0 : step_count - 1])
      translate(baluster_pos(i))
        cylinder(h = baluster_height + 1, r = 1.8);
    for (i = [0 : step_count - 2])
      beam3d(rail_point(i), rail_point(i + 1), rail_size);
  }
}
`,
  },
  {
    id: 65,
    name: 'DNA 双螺旋摆件',
    category: '科学造型',
    level: 'classic',
    applies: '科学摆件、桌面装饰、教学模型、可调圈数/高度/直径的螺旋结构',
    idea: '两条相位差 180° 的螺旋链：沿螺旋线按等角度步进摆放互相重叠的球，球链自动连成实体；每隔几级加一根横档穿过两条链，底部圆盘把所有链端收进同一底座',
    points: [
      '球心间距必须小于两倍球半径才会互相重叠成链：半径、圈数、每圈步数三者要联立检查',
      '两条链用同一个角度加 180°，天然保持对径',
      '横档是一根绕 Z 旋转的圆柱：rotate([0,90,0]) 让圆柱躺平，再按当前相位转正，一次穿过两条链',
      '横档位置用 round(k × 总步数 / (档数-1)) 均匀抽样，档数变化不会跑位',
      '底座半径要覆盖住螺旋半径 + 球半径，首节点下沉到基座内 1mm，避免点接触',
      '全部球、横档、底座并进一个 union，整体是单一连通体',
    ],
    code: `/* [螺旋] */
turns = 2.5; // [1:0.5:6]
height = 150; // [60:10:300]
helix_radius = 26; // [12:2:60]
node_radius = 4.2; // [1.5:0.2:8]
steps_per_turn = 24; // [12:2:48]

/* [横档] */
rung_count = 12; // [0:1:40]
rung_radius = 1.6; // [0.8:0.2:4]

/* [底座] */
base_radius = 40; // [20:2:90]
base_height = 6; // [3:1:20]

/* [Hidden] */
$fn = 20;

total_steps = max(2, round(turns * steps_per_turn));
dz = (height - base_height) / total_steps;

function z_of(i) = base_height - 1 + i * dz;
function node(i, side) =
  let (a = i * 360 / steps_per_turn + side * 180)
  [helix_radius * cos(a), helix_radius * sin(a), z_of(i)];

union() {
  // 底座
  cylinder(h = base_height, r = base_radius);
  // 两条螺旋链
  for (i = [0 : total_steps]) {
    translate(node(i, 0)) sphere(r = node_radius);
    translate(node(i, 1)) sphere(r = node_radius);
  }
  // 横档
  for (k = [0 : max(0, rung_count - 1)]) {
    i = rung_count > 1 ? round(k * total_steps / (rung_count - 1)) : 0;
    translate([0, 0, z_of(i)])
      rotate([0, 0, i * 360 / steps_per_turn])
        rotate([0, 90, 0])
          cylinder(h = 2 * helix_radius, r = rung_radius, center = true);
  }
}
`,
  },
];

/** 全部分类（按首个出现顺序）。 */
export const EXAMPLE_CATEGORIES: string[] = [...new Set(EXAMPLES.map((e) => e.category))];

/**
 * system prompt 里附完整源码的范例。
 *
 * 选取标准：模板复用率高、技巧不可替代，且每个大类至少保留 1 个。
 * 其余范例在 prompt 里只保留「名称 + 适用 + 思路」的目录条目——模型知道
 * 这类东西有解、知道思路，但不必把 66 份源码全文塞进上下文。
 * 源码仍然完整地留在 UI 范例库，用户一键即可载入。
 */
export const PROMPT_FULL_IDS: readonly number[] = [
  1, 2, 3, 3.5, 6, 7, 9, 10, 11, 16, 17, 20, 22, 30,
  37, 41, 49, 51, 54, 57, 58, 59, 60, 62, 63, 64,
];

const PROMPT_FULL = new Set(PROMPT_FULL_IDS);

/** 按难度层级名（UI 显示用）。 */
export const LEVEL_LABELS: Record<ExampleLevel, string> = {
  basic: '简单',
  classic: '经典',
  advanced: '复杂特殊',
};

/** 按 id 查找。 */
export function getExample(id: number): ModelingExample | undefined {
  return EXAMPLES.find((e) => e.id === id);
}

/**
 * 生成拼进 system prompt 的范例文本。
 *  - PROMPT_FULL_IDS 里的：编号 + 标题 + 适用 + 思路 + 关键点 + 完整源码
 *  - 其余：编号 + 标题 + 适用 + 思路（目录条目，不给源码）
 * id 为 3.5 的肾形范例在 prompt 里显示为"范例 3b"。
 */
export function examplesToPromptText(): string {
  const header = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
五、建模范例库（${EXAMPLES.length} 个：${PROMPT_FULL_IDS.length} 个附源码，其余为目录）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

每种器物都有成熟做法。附源码的范例要照着改；只列目录的范例知道思路后自己实现，
必要时组合附源码范例的手法。不要凭空发明建模方法。

所有范例都已用真实 OpenSCAD WASM 引擎（Manifold 后端）编译通过，并通过
结构审计（无开放边、贴床；多件拆解图按件数核对）。minkowski、text、hull 都可用，
按需要选型即可。范例只是起点：复杂件可以组合多个范例、拆成多件、写到六七百行。`;

  const blocks = EXAMPLES.map((e) => {
    const idLabel = e.id === 3.5 ? '3b' : String(e.id);
    if (!PROMPT_FULL.has(e.id)) {
      return `范例 ${idLabel}：${e.name}（${e.category}·${LEVEL_LABELS[e.level]}）｜目录
适用：${e.applies}
思路：${e.idea}`;
    }
    const points = e.points.map((p) => `  - ${p}`).join('\n');
    return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
范例 ${idLabel}：${e.name}（${e.category}·${LEVEL_LABELS[e.level]}）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
适用：${e.applies}
核心思路：${e.idea}
关键点：
${points}

\`\`\`openscad
${e.code}\`\`\``;
  });

  return [header, ...blocks].join('\n\n');
}
