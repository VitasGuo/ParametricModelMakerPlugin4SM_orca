/**
 * 知识库 · 标准件模块库（L5）。
 *
 * 机械件的精度不靠"网格更密"，靠"尺寸用标准、牙型不重画"：
 * 把公制螺纹/螺母做成经过真实引擎与装配校验的 SCAD 模块，AI 只调用、不重写。
 *
 * 模块会原样注入 system prompt；范例 9 与单测复用同一份几何约定。
 */

export const PARTS_CODE = `
// ---------- 公制螺纹（可打印梯形牙，牙高 0.55P） ----------
module thread_ridge(d, pitch, length, axial_width, depth) {
  seg = 48;
  step = pitch / seg;
  angle = 360 / seg;
  r_root = max(d / 2 - depth - 0.6, 0.6);
  r_crest = d / 2;
  w = max(axial_width, 0.8);
  crest = min(0.125, w * 0.2);
  count = ceil((length / pitch) * seg);
  for (i = [0 : count - 1])
    rotate([0, 0, i * angle])
      translate([0, 0, i * step])
        rotate_extrude(angle = angle * 1.15, $fn = 6)
          polygon([
            [r_root, 0], [r_crest, crest],
            [r_crest, w - crest], [r_root, w]
          ]);
}

// 六角头螺栓：默认 M8×1.25，头贴床、杆朝上
module std_bolt(d = 8, length = 30, pitch = 1.25, head_d = 14, head_h = 5.3) {
  depth = 0.55 * pitch;
  cylinder(h = head_h, r = head_d / 2, $fn = 6);
  translate([0, 0, head_h]) {
    cylinder(h = length + 0.2, r = d / 2 - depth, $fn = 48);
    thread_ridge(d, pitch, length, pitch * 0.5, depth);
  }
}

// 六角螺母：内螺纹 = 同一螺旋放大 clearance 后挖掉，保证能拧
module std_nut(d = 8, pitch = 1.25, thickness = 6.5, outer_d = 14, clearance = 0.3) {
  depth = 0.55 * pitch;
  bore_r = d / 2 - depth + clearance;
  difference() {
    cylinder(h = thickness, r = outer_d / 2, $fn = 6);
    translate([0, 0, -1])
      cylinder(h = thickness + 2, r = bore_r, $fn = 48);
    // 牙从螺母底面起，相位与螺栓螺距对齐（不要再向下平移，否则装配相位错开）
    thread_ridge(d + 2 * clearance, pitch, thickness + 1,
                 pitch * 0.5 + 2 * clearance, depth + clearance + 1);
  }
}

// 螺钉过孔（被连接件上的通孔/沉孔底孔）
module std_screw_hole(d = 8, depth = 20, clearance = 0.4) {
  cylinder(h = depth, r = (d + 2 * clearance) / 2, $fn = 32);
}

// 平垫圈（按公制内径、外径近似）
module std_washer(d = 8, outer_d = 16, thickness = 1.6) {
  difference() {
    cylinder(h = thickness, r = outer_d / 2, $fn = 48);
    translate([0, 0, -1])
      cylinder(h = thickness + 2, r = (d + 0.4) / 2, $fn = 32);
  }
}
`;

export const PARTS_LIBRARY = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
九、标准件模块库（机械件优先调用，禁止重画牙型）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

使用规则：
- 凡是要"拧"的螺纹，必须用 std_bolt / std_nut，不要自己画牙型；视觉摆件才允许近似螺纹
- 公制粗牙默认牙距：M3=0.5、M4=0.7、M5=0.8、M6=1.0、M8=1.25、M10=1.5、M12=1.75
- FDM 上 M6 以下很难拧，功能件优先 ≥M8；螺母已内置 clearance，不要再手工放大
- 螺栓打印方向：六角头贴床、杆朝上；螺母平放；装配靠"拧进去"，不是直插
- 需要螺纹孔而不是螺母时，用 std_screw_hole（通孔按 clearance 放大）
- 装配体里螺栓和螺母是两件，分列摆开；装配校验按整牙距对齐

${PARTS_CODE}`;

/** 供单测使用：模块库 + 一段装配场景。 */
export function partsScad(body: string): string {
  return `${PARTS_CODE}\n${body}`;
}
