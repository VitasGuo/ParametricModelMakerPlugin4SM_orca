/**
 * 建模范例库（结构化单一数据源）。
 *
 * 范例集中于此，单一数据源：
 *  - prompts.ts 调 examplesToPromptText() 把范例拼进 system prompt（AI 侧）
 *  - 范例库面板直接 import EXAMPLES 渲染列表，用户可一键载入（用户侧）
 *
 * code 必须是完整可运行、带 Customizer 注释协议的 SCAD。独立网页用真实
 * OpenSCAD WASM 编译验证，`verifiable` 字段保留用于兼容旧数据/标记复杂度。
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
  /** 本地求值器是否可验证。 */
  verifiable: boolean;
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

difference() {
  union() {
    rotate_extrude() polygon(bowl_outer);
    translate([0, 0, -foot_height]) rotate_extrude() polygon(foot_profile);
  }
  rotate_extrude() polygon(bowl_inner);
}
`,
    verifiable: true,
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
    verifiable: true,
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

module box_outer() {
  linear_extrude(height = height)
    offset(r = fillet_radius) crescent_2d(outer_r, inner_r, offset_x);
}

module box_inner() {
  translate([0, 0, bottom_thickness])
    linear_extrude(height = height - bottom_thickness + 0.1)
      offset(r = fillet_radius - wall_thickness)
        offset(r = -wall_thickness) crescent_2d(outer_r, inner_r, offset_x);
}

difference() {
  box_outer();
  box_inner();
}
`,
    verifiable: true,
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

module box_outer() {
  linear_extrude(height = height)
    offset(r = fillet_radius) kidney_2d(outer_r, indent_r, indent_offset_x);
}

module box_inner() {
  translate([0, 0, bottom_thickness])
    linear_extrude(height = height - bottom_thickness + 0.1)
      offset(r = fillet_radius - wall_thickness)
        offset(r = -wall_thickness) kidney_2d(outer_r, indent_r, indent_offset_x);
}

difference() {
  box_outer();
  box_inner();
}
`,
    verifiable: true,
  },
  {
    id: 4,
    name: '方盒（minkowski 圆角）',
    category: '盒体收纳',
    level: 'basic',
    applies: '方盒、收纳箱、抽屉、外壳、支架（圆角需求不敏感时可用范例 17 替代）',
    idea: '外立方体 - 内立方体，内立方体向上偏移留底厚',
    points: [
      'minkowski + cylinder 做圆角（会增大尺寸，需预先减去）',
      '内腔向上偏移 bottom_thickness',
    ],
    code: `/* [主体尺寸] */
length = 100; // [40:5:200]
width = 80; // [30:5:150]
height = 50; // [20:5:100]
wall_thickness = 2.5; // [1:0.5:6]
bottom_thickness = 3; // [1:0.5:8]

/* [细节] */
fillet_radius = 3; // [0:0.5:8]

/* [Hidden] */
$fn = 32;

difference() {
  minkowski() {
    cube([length - 2*fillet_radius, width - 2*fillet_radius, height - fillet_radius]);
    cylinder(r = fillet_radius, h = fillet_radius);
  }
  translate([wall_thickness, wall_thickness, bottom_thickness])
    cube([length - 2*wall_thickness, width - 2*wall_thickness, height - bottom_thickness + 1]);
}
`,
    verifiable: false,
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
    verifiable: true,
  },
  {
    id: 6,
    name: '卡扣收纳盒',
    category: '盒体收纳',
    level: 'classic',
    applies: '带盖收纳盒、保鲜盒、电子元件盒',
    idea: '盒身顶部留凸缘，盖子底部留凹槽，两者卡扣配合',
    points: [
      '盒身凸缘向外突出',
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
  // 凸缘
  translate([-lid_gap, -lid_gap, height - 2])
    cube([length + 2*lid_gap, width + 2*lid_gap, 2]);
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
    verifiable: true,
  },
  {
    id: 7,
    name: '文字铭牌',
    category: '文字铭牌',
    level: 'basic',
    applies: '铭牌、门牌、印章、浮雕文字',
    idea: '用 text() 生成 2D 文字，linear_extrude 拉伸成 3D',
    points: [
      'text() 是 2D 原语，需要 linear_extrude',
      'font 影响字体（默认 "Liberation Sans"）',
      'halign/valign 控制对齐',
    ],
    code: `/* [铭牌] */
length = 100; // [40:5:300]
width = 40; // [20:5:100]
thickness = 3; // [1:0.5:10]

/* [文字] */
text_content = "Hello"; // 输入文字
text_size = 20; // [10:1:50]
text_depth = 2; // [0.5:0.1:5]

/* [Hidden] */
$fn = 32;

// 底板
cube([length, width, thickness]);

// 文字（居中）
translate([length/2, width/2, thickness])
  linear_extrude(height = text_depth)
    text(text_content, size = text_size, font = "Liberation Sans",
         halign = "center", valign = "center");
`,
    verifiable: false,
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
    verifiable: true,
  },
  {
    id: 9,
    name: '螺旋螺纹螺栓',
    category: '球体与螺纹',
    level: 'advanced',
    applies: '螺纹件、螺母、螺栓、瓶盖',
    idea: '用线性变换的剖面沿 Z 轴旋转上升，形成螺旋',
    points: [
      '用 for 循环 + rotate + translate 生成螺旋阵列',
      '剖面是螺纹的横截面',
    ],
    code: `/* [螺纹] */
outer_diameter = 20; // [10:1:50]
pitch = 3; // [1:0.5:10]
turns = 5; // [2:1:20]
thread_depth = 1.5; // [0.5:0.1:3]

/* [Hidden] */
$fn = 32;

outer_r = outer_diameter / 2;
inner_r = outer_r - thread_depth;

// 螺纹剖面（三角形）
thread_profile = [
  [inner_r, 0],
  [outer_r, pitch/4],
  [inner_r, pitch/2]
];

// 生成螺旋螺纹
module thread() {
  for (i = [0 : turns * 4 - 1]) {
    rotate([0, 0, i * 90])
      translate([0, 0, i * pitch / 4])
        rotate_extrude(angle = 90)
          polygon(thread_profile);
  }
}

// 螺栓主体
module bolt() {
  cylinder(h = turns * pitch, r = inner_r);
  thread();
}

bolt();
`,
    verifiable: true,
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

organic_shape();
`,
    verifiable: false,
  },
  {
    id: 11,
    name: '低多边形群山摆件',
    category: '山水景观',
    level: 'advanced',
    applies: '山脉、群峰、山形摆件、低多边形景观',
    idea: '圆台（r1 > r2）就是山坡；$fn 取小值（4~6）在真引擎里渲染成棱锥，形成低多边形风格。主峰居中，副峰绕圈',
    points: [
      '山 = 岩体圆台 + 雪顶锥体（两层圆柱叠放）',
      '坡度可打印：峰底半径 ≥ 峰高 × 0.6',
      '底座先铺，山峰都从底座顶面 (z = base_height) 起',
    ],
    code: `/* [底座] */
base_length = 120; // [60:5:250]
base_width = 80; // [40:5:150]
base_height = 5; // [3:1:12]

/* [山峰] */
main_height = 80; // [30:5:160]
side_height = 45; // [15:5:100]
side_count = 4; // [0:1:8]
snow_ratio = 0.25; // [0.1:0.05:0.5]

/* [Hidden] */
$fn = 5;

ring_r = min(base_length, base_width) * 0.3;

module mountain(h) {
  r = h * 0.7;
  cylinder(h = h * (1 - snow_ratio), r1 = r, r2 = r * snow_ratio * 1.2);
  translate([0, 0, h * (1 - snow_ratio)])
    cylinder(h = h * snow_ratio, r1 = r * snow_ratio * 1.2, r2 = 0);
}

union() {
  cube([base_length, base_width, base_height]);
  translate([base_length / 2, base_width / 2, base_height])
    mountain(main_height);
  for (i = [0 : side_count - 1]) {
    angle = i * 360 / max(side_count, 1);
    translate([base_length / 2 + ring_r * cos(angle),
               base_width / 2 + ring_r * sin(angle),
               base_height])
      mountain(side_height);
  }
}
`,
    verifiable: true,
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
    verifiable: true,
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
    verifiable: true,
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
    verifiable: true,
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
    verifiable: true,
  },
  {
    id: 16,
    name: '马克杯',
    category: '轴对称容器',
    level: 'classic',
    applies: '马克杯、水杯、带把手容器、啤酒杯',
    idea: '杯身 = 圆筒 difference 内腔；把手 = 圆剖面 offset 后 rotate_extrude 成竖直圆环，一半埋进杯壁',
    points: [
      '把手环中心放到杯壁内侧 (cup_r - 埋深)，保证与壁实体相连',
      'rotate([90,0,0]) 把水平圆环立成竖直',
      '演算：管中心半径 r_mid = (handle_out + handle_in) / 2，handle_in = handle_out - handle_thickness',
    ],
    code: `/* [杯身] */
cup_diameter = 80; // [50:5:140]
cup_height = 95; // [50:5:160]
wall_thickness = 3; // [1.5:0.5:6]
bottom_thickness = 4; // [2:0.5:8]

/* [把手] */
handle_ring = 32; // [18:2:60]
handle_thickness = 7; // [4:0.5:12]
embed = 2; // [1:0.5:5]

/* [Hidden] */
$fn = 64;

cup_r = cup_diameter / 2;
handle_out = handle_ring / 2;
handle_in = handle_out - handle_thickness;

difference() {
  cylinder(h = cup_height, r = cup_r);
  translate([0, 0, bottom_thickness])
    cylinder(h = cup_height, r = cup_r - wall_thickness);
}

// D 形把手：竖直圆环，埋进杯壁 embed 毫米
translate([cup_r - embed, 0, cup_height / 2])
  rotate([90, 0, 0])
    rotate_extrude()
      translate([(handle_out + handle_in) / 2, 0])
        circle(handle_thickness / 2);
`,
    verifiable: true,
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
  offset(r = r) square([l - 2*r, w - 2*r], center = true);
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
    verifiable: true,
  },
  {
    id: 18,
    name: '可堆叠收纳盒',
    category: '盒体收纳',
    level: 'advanced',
    applies: '堆叠收纳盒、嵌套箱、可摞周转盒',
    idea: '范例 17 的圆角盒 + 底部外裙环；上层盒底落入下层裙环内实现定位',
    points: [
      '裙环 = offset(rim_depth+gap) 外轮廓 − offset(gap) 外轮廓，内边界与盒壁之间留 rim_gap 让上层嵌入',
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
  offset(r = r) square([l - 2*r, w - 2*r], center = true);
}

difference() {
  union() {
    // 盒身
    linear_extrude(box_height)
      rounded_square(box_length, box_width, fillet_radius);
    // 底裙环（上层盒底嵌进来）
    linear_extrude(rim_height)
      difference() {
        offset(r = rim_depth + rim_gap)
          rounded_square(box_length, box_width, fillet_radius);
        offset(r = rim_gap)
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
    verifiable: true,
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
hole_r = hole_diameter / 2;
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
    verifiable: true,
  },
  {
    id: 20,
    name: '手机支架',
    category: '园艺家居',
    level: 'classic',
    applies: '手机支架、平板托架、展示架、阅读架',
    idea: '托槽 = 外方块 − 内腔（留出手机厚度空间），前唇挡滑；背板从托槽后沿向上仰起 (90 - tilt_angle)',
    points: [
      '演算：托槽内宽 = phone_width，内深 = phone_depth + 余量；背板旋转支点在托槽后上沿，rotate([-(90 - tilt), 0, 0])',
      '前唇高度 lip_height 挡手机下沿，不遮屏幕',
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

// 背板：绕托槽后沿仰起
module back() {
  translate([0, tray_depth + material, 0])
    rotate([-(90 - tilt_angle), 0, 0])
      translate([0, -material, 0])
        cube([phone_width + 2*material, material, back_height]);
}

union() {
  tray();
  back();
}
`,
    verifiable: true,
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
    verifiable: true,
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
    verifiable: true,
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
      '带状闭合 = 外缘（θ 从 0→总角）+ 内缘（θ 从 总角→0，半径减带宽）',
      '起点 r0 > 带宽，中心不退化',
    ],
    code: `/* [螺旋盘] */
outer_diameter = 100; // [50:5:200]
turns = 2; // [1:0.5:4]
band_width = 6; // [2:0.5:15]
thickness = 5; // [2:0.5:12]

/* [Hidden] */
$fn = 64;

phi = (1 + sqrt(5)) / 2;
r0 = outer_diameter / 2 / pow(phi, turns * 360 / 90);

function spiral_r(t) = r0 * pow(phi, t / 90);
total = turns * 360;

outer_edge = [ for (t = [0 : 5 : total])
  [spiral_r(t) * cos(t), spiral_r(t) * sin(t)] ];
inner_edge = [ for (t = [total : -5 : 0])
  [(spiral_r(t) - band_width) * cos(t), (spiral_r(t) - band_width) * sin(t)] ];

linear_extrude(height = thickness)
  polygon(concat(outer_edge, inner_edge));
`,
    verifiable: true,
  },
  {
    id: 24,
    name: '阿基米德螺旋香薰盘',
    category: '数学曲线',
    level: 'advanced',
    applies: '阿基米德螺旋、等距螺旋、香薰盘、迷宫盘',
    idea: '阿基米德螺旋 r = r0 + k·θ（半径随角度线性增长，圈距处处相等，与对数螺旋的"越转越密"相反）。螺旋槽盘中心留蜡烛台',
    points: [
      '演算：r(θ) = r0 + (盘半径 - r0 - 边缘余量) * θ / 总角',
      '槽 = 外缘带 − 内缘带；圈距 = 带宽 × 2 左右才有槽感',
      '中心圆台承托蜡烛，比螺旋起点高出一截',
    ],
    code: `/* [香薰盘] */
plate_diameter = 110; // [60:5:220]
plate_thickness = 6; // [3:0.5:12]
turns = 3; // [2:0.5:5]
band_width = 4; // [2:0.5:10]

/* [蜡烛台] */
candle_diameter = 40; // [20:5:70]
candle_lip = 6; // [2:0.5:12]

/* [Hidden] */
$fn = 64;

plate_r = plate_diameter / 2;
r0 = candle_diameter / 2 + 2;
total = turns * 360;
r_max = plate_r - 4;

function arch_r(t) = r0 + (r_max - r0) * t / total;

outer_edge = [ for (t = [0 : 5 : total])
  [arch_r(t) * cos(t), arch_r(t) * sin(t)] ];
inner_edge = [ for (t = [total : -5 : 0])
  [(arch_r(t) - band_width) * cos(t), (arch_r(t) - band_width) * sin(t)] ];

union() {
  // 盘底
  linear_extrude(height = plate_thickness)
    circle(r = plate_r);
  // 螺旋槽带
  linear_extrude(height = plate_thickness + 2)
    polygon(concat(outer_edge, inner_edge));
  // 中心蜡烛台
  translate([0, 0, plate_thickness])
    difference() {
      cylinder(h = candle_lip, d = candle_diameter);
      translate([0, 0, 2]) cylinder(h = candle_lip, d = candle_diameter - 6);
    }
}
`,
    verifiable: true,
  },
  {
    id: 25,
    name: '高斯钟形摆件',
    category: '数学曲线',
    level: 'advanced',
    applies: '高斯曲线/正态分布曲面、钟形摆件、僧帽、裙摆造型',
    idea: '高斯函数 y = h·e^(−(x/σ)²)。把这条 bell curve 作为剖面绕轴旋转（rotate_extrude），就是经典正态分布曲面。σ 控制胖瘦，h 控制峰高',
    points: [
      '演算：剖面点 [x, h * exp(-pow(x/sigma, 2))]，x 从 0 采样到 3σ（之后趋近 0）',
      '剖面闭合：首点 [0,0] 封底 → 曲线 → 尾点 [3σ, 0] 回到轴',
      '底部加圆环底座更稳',
    ],
    code: `/* [钟形] */
bell_height = 70; // [30:5:160]
bell_width = 60; // [30:5:140]

/* [底座] */
base_diameter = 70; // [40:5:120]
base_height = 5; // [3:1:12]

/* [Hidden] */
$fn = 64;

sigma = bell_width / 4;  // 4σ = 全宽，两端曲线趋近零
x_max = bell_width / 2;

curve_pts = [ for (x = [0 : 1.5 : x_max])
  [x, bell_height * exp(-pow(x / sigma, 2))] ];
profile = concat([[0, 0]], curve_pts, [[x_max, 0]]);

union() {
  // 钟形主体（实心摆件）
  rotate_extrude() polygon(profile);
  // 圆环底座
  translate([0, 0, -base_height])
    difference() {
      cylinder(h = base_height, d = base_diameter);
      translate([0, 0, -0.5]) cylinder(h = base_height + 1, d = base_diameter - 16);
    }
}
`,
    verifiable: true,
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
    verifiable: true,
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
    verifiable: true,
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
    verifiable: true,
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
    verifiable: true,
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
      '层底 z = i * (level_h + eave_t)，出檐板比层身四周大出 eave_over',
      '每层身四面开圆窗（环排 difference），首层正面开方门',
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

union() {
  for (i = [0 : levels - 1]) {
    w = base_width * (1 - i * taper);
    h = level_height * (1 - i * 0.05);
    z = i * (level_height + eave_thickness);
    translate([0, 0, z]) level_body(w, h);
    translate([0, 0, z + h]) eave(w + eave_over * 2, eave_thickness);
  }
  // 顶层收尖
  top_z = levels * (level_height + eave_thickness);
  top_w = base_width * (1 - (levels - 1) * taper);
  translate([0, 0, top_z])
    cylinder(h = level_height * 0.9, d1 = top_w, d2 = 4, $fn = 4);
}
`,
    verifiable: true,
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

// 底座
translate([0, -head_width * 0.6, -6])
  cylinder(h = 6, d1 = head_width * 0.9, d2 = head_width * 0.8, $fn = 48);

union() {
  // 侧脸板（YZ 平面立起，面朝 +x）
  rotate([90, 0, 90])
    linear_extrude(height = plate_thickness)
      polygon(side_profile);

  // 正面板（XY 平面立起，面朝 +z 的观察者），带两只"孔眼"
  translate([-plate_thickness / 2, 0, 0])
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
    verifiable: true,
  },
  {
    id: 32,
    name: '构成主义动态雕塑（考尔德风）',
    category: '艺术风格',
    level: 'advanced',
    applies: '动态雕塑、构成主义、考尔德风、平衡装置摆件',
    idea: '底座竖杆 + 顶端斜出横杆，两端各挂不同大小的圆盘/弧片，重心故意不对称——"不稳定中的平衡"就是风格本体。一体打印，接触处实体重叠',
    points: [
      '主杆竖直，横杆 rotate 一定角度斜出，两端盘径一大一小（重量错觉）',
      '挂盘 = 薄 cylinder，各盘 rotate 不同角度制造"风中转动"瞬间感',
      '接触处重叠 ≥ 1mm 保证一体打印不断裂',
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
arm_tilt = 12; // [0:1:35]

/* [Hidden] */
$fn = 48;

top_z = base_height + mast_height;

// 底座
cylinder(h = base_height, d1 = base_diameter, d2 = base_diameter * 0.85);

// 主杆
translate([0, 0, base_height])
  cylinder(h = mast_height, d = rod_diameter);

union() {
  // 横杆（水平圆柱，绕 x 轴倾斜 arm_tilt）
  translate([0, 0, top_z])
    rotate([arm_tilt, 0, 0])
      rotate([0, 90, 0])
        translate([0, 0, -arm_length * 0.35])
          cylinder(h = arm_length, d = rod_diameter * 0.8);

  // 大盘（横杆后端，下垂挂）
  translate([-arm_length * 0.35 * cos(arm_tilt),
             arm_length * 0.35 * sin(arm_tilt) * 0.0,
             top_z - big_disc / 2 - 6])
    rotate([18, 0, 0])
      cylinder(h = 3, d = big_disc);
  // 大盘吊杆
  translate([-arm_length * 0.35, 0, top_z - 3])
    cylinder(h = 10, d = rod_diameter * 0.6);

  // 小盘（横杆前端，上翘挂）
  translate([arm_length * 0.65 * cos(arm_tilt),
             0,
             top_z + arm_length * 0.65 * sin(arm_tilt) - small_disc / 2 - 4])
    rotate([-25, 0, 0])
      cylinder(h = 3, d = small_disc);
  // 小盘吊杆
  translate([arm_length * 0.65 * cos(arm_tilt), 0, top_z + arm_length * 0.65 * sin(arm_tilt) - 4])
    cylinder(h = 8, d = rod_diameter * 0.6);
}
`,
    verifiable: true,
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
    verifiable: true,
  },
];

/** 全部分类（按首个出现顺序）。 */
export const EXAMPLE_CATEGORIES: string[] = [...new Set(EXAMPLES.map((e) => e.category))];

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
 * 生成拼进 system prompt 的范例文本（保持既有排版：编号 + 标题 + 适用 + 思路 + 关键点 + 代码）。
 * id 为 3.5 的肾形范例在 prompt 里显示为"范例 3b"。
 */
export function examplesToPromptText(): string {
  const header = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
四、建模范例库（${EXAMPLES.length} 个完整可运行范例）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

每种器物都有完整可运行范例。理解范例的建模思路，然后根据用户需求
套用最接近的范例，改参数和剖面即可。不要凭空发明建模方法。

范例 11~33 全部使用本地求值器支持的原语（circle/square/polygon、
cube/cylinder/sphere、translate/rotate/scale/mirror、offset、
linear_extrude、rotate_extrude、for/if），生成这类代码可被自动验证。
范例 4 的 minkowski、范例 7 的 text、范例 10 的 hull 本地不支持，
套用它们时验证会跳过——能用等价的 offset/范例 11~33 方案时优先用后者。`;

  const blocks = EXAMPLES.map((e) => {
    const idLabel = e.id === 3.5 ? '3b' : String(e.id);
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
