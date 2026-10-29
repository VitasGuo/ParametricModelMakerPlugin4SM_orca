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
fillet_radius = 3; // [0.5:0.5:8]

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
// 内半径下限 0.5：handle_thickness 取大值时不会出现负半径（rotate_extrude 会自交）
handle_in = max(handle_out - handle_thickness, 0.5);

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
      '带状闭合 = 外缘（θ 从 0→总角）+ 内缘（θ 从 总角→0，半径减带宽）',
      '内缘半径下限 0.4：中心段带宽自动收窄，r0 < 带宽时也不会出现负半径翻点',
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
// 内缘半径下限 0.4：r0 < band_width 时避免负半径把点翻到对侧
function band_inner_r(t) = max(spiral_r(t) - band_width, 0.4);
total = turns * 360;

outer_edge = [ for (t = [0 : 5 : total])
  [spiral_r(t) * cos(t), spiral_r(t) * sin(t)] ];
inner_edge = [ for (t = [total : -5 : 0])
  [band_inner_r(t) * cos(t), band_inner_r(t) * sin(t)] ];

linear_extrude(height = thickness)
  polygon(concat(outer_edge, inner_edge));
`,
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
twist_angle = 120; // [0:15:360]
ripple_count = 6; // [0:1:12]
ripple_depth = 0.12; // [0:0.02:0.3]
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
translate([block_w + part_gap, block_d + part_gap, 0])
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
    id: 55,
    name: '便签弹簧夹',
    category: '桌面收纳',
    level: 'basic',
    applies: '便签/便条夹、票据夹、名片立夹、食谱卡片夹',
    idea: '一整块立柱从顶面往下开"上宽下窄"的楔形缝：上半段宽口引纸，下半段窄缝夹紧，缝隙底部留料当弹性铰点',
    points: [
      '缝分两段：上段开口宽（3mm 左右）引纸，下段窄缝（1.2~1.6mm）夹持',
      '缝深用 min() 收敛到柱高的 75%，根部留够材料，否则一插就断',
      '窄缝底要高于底脚顶面，否则夹子会被切成两半',
      '缝沿 X 贯通整个柱宽，纸才能从顶部插进去',
    ],
    code: `/* [夹体] */
clip_width = 30; // [20:1:60]
clip_depth = 18; // [12:1:40]
clip_height = 40; // [20:1:80]

/* [夹口] */
jaw_gap = 1.4; // [0.8:0.1:3]
mouth_gap = 3.4; // [2:0.2:8]
slot_depth = 30; // [10:1:60]

/* [底脚] */
base_thickness = 4; // [2:0.5:10]
base_margin = 3; // [0:0.5:10]

/* [Hidden] */
$fn = 32;

cut_h = min(slot_depth, clip_height * 0.75);
mouth_h = min(cut_h * 0.45, clip_depth * 0.6);
narrow_h = cut_h - mouth_h;
narrow_bottom = clip_height - cut_h;

difference() {
  union() {
    // 立柱
    cube([clip_width, clip_depth, clip_height]);
    // 底脚：比立柱宽一圈
    translate([-base_margin, -base_margin, 0])
      cube([clip_width + 2 * base_margin, clip_depth + 2 * base_margin, base_thickness]);
  }
  // 窄缝（夹持段）
  translate([-1, (clip_depth - jaw_gap) / 2, narrow_bottom])
    cube([clip_width + 2, jaw_gap, narrow_h + 1]);
  // 宽口（引纸段）
  translate([-1, (clip_depth - mouth_gap) / 2, clip_height - mouth_h])
    cube([clip_width + 2, mouth_gap, mouth_h + 1]);
}
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
hub_diameter = 20; // [12:1:40]
hub_height = 14; // [8:1:30]
shaft_bore = 5.2; // [0:0.2:12]

/* [桨叶] */
blade_count = 2; // [2:1:5]
blade_length = 70; // [30:5:120]
root_chord = 12; // [6:0.5:24]
root_thickness = 3.2; // [1.5:0.2:6]
tip_scale = 0.5; // [0.25:0.05:1]

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
五、建模范例库（${EXAMPLES.length} 个完整可运行范例）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

每种器物都有完整可运行范例。理解范例的建模思路，然后根据用户需求
套用最接近的范例，改参数和剖面即可。不要凭空发明建模方法。

所有范例都已用真实 OpenSCAD WASM 引擎（Manifold 后端）编译通过，并通过
结构审计（单连通体、无开放边、贴床）。minkowski、text、hull 都可用，
按需要选型即可。`;

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
