/**
 * 知识库 · 标准件模块库（L5）。
 *
 * 机械件的精度不靠"网格更密"，靠"尺寸用标准、牙型不重画"：
 * 把公制螺纹/螺母做成经过真实引擎与装配校验的 SCAD 模块，AI 只调用、不重写。
 *
 * 模块会原样注入 system prompt；范例 9 与单测复用同一份几何约定。
 */

export const PARTS_CODE = `
// ---------- 公制螺纹（可打印梯形牙，牙高 0.55P；M3~M12 通用） ----------

// 公制粗牙 / 六角对边 / 头部与螺母厚度速查
function std_pitch(d)  = lookup(d, [[3, 0.5], [4, 0.7], [5, 0.8], [6, 1.0], [8, 1.25], [10, 1.5], [12, 1.75]]);
function std_waf(d)    = lookup(d, [[3, 5.5], [4, 7], [5, 8], [6, 10], [8, 13], [10, 17], [12, 19]]);
function std_head_h(d) = lookup(d, [[3, 2.1], [4, 2.8], [5, 3.5], [6, 4], [8, 5.3], [10, 6.4], [12, 7.5]]);
function std_nut_h(d)  = lookup(d, [[3, 2.4], [4, 3.2], [5, 4], [6, 5], [8, 6.5], [10, 8], [12, 10]]);

// 梯形牙螺旋：牙宽钳 ≤0.64P（M8 恰好 0.8mm），防止小牙距互相穿插（traps #42）。
// 内缘向芯内埋 0.6mm 防共面开放边（traps #29）
module thread_ridge(d, pitch, length, axial_width, depth) {
  seg = 48;
  step = pitch / seg;
  angle = 360 / seg;
  r_root = max(d / 2 - depth - 0.6, 0.6);
  r_crest = d / 2;
  w = min(max(axial_width, 0.8), 0.64 * pitch);
  crest = min(0.125, w * 0.2);
  // 只留完整圈段，首尾牙不骑端面（traps #42）
  count = floor((length - w) / step) + 1;
  for (i = [0 : count - 1])
    rotate([0, 0, i * angle])
      translate([0, 0, i * step])
        rotate_extrude(angle = angle * 1.15, $fn = 6)
          polygon([
            [r_root, 0], [r_crest, crest],
            [r_crest, w - crest], [r_root, w]
          ]);
}

// 六角头螺栓：头贴床、杆朝上；pitch / 螺头尺寸按 d 自动查表
module std_bolt(d = 8, length = 30, pitch = undef, head_d = undef, head_h = undef) {
  P  = is_undef(pitch)  ? std_pitch(d)  : pitch;
  hd = is_undef(head_d) ? std_waf(d)    : head_d;
  hh = is_undef(head_h) ? std_head_h(d) : head_h;
  depth = 0.55 * P;
  cylinder(h = hh, r = hd / 2, $fn = 6);
  translate([0, 0, hh]) {
    cylinder(h = length + 0.2, r = d / 2 - depth, $fn = 48);
    thread_ridge(d, P, length, P * 0.5, depth);
  }
}

// 六角螺母：内螺纹 = 同一螺旋放大 clearance 后挖掉；间隙默认 0.24P 缩放（M8 恰 0.3），牙宽钳 ≤0.98P
module std_nut(d = 8, pitch = undef, thickness = undef, outer_d = undef, clearance = undef) {
  P  = is_undef(pitch)     ? std_pitch(d) : pitch;
  th = is_undef(thickness) ? std_nut_h(d) : thickness;
  od = is_undef(outer_d)   ? std_waf(d)   : outer_d;
  c  = is_undef(clearance) ? min(0.3, 0.24 * P) : clearance;
  depth = 0.55 * P;
  bore_r = d / 2 - depth + c;
  difference() {
    cylinder(h = th, r = od / 2, $fn = 6);
    translate([0, 0, -1])
      cylinder(h = th + 2, r = bore_r, $fn = 48);
    // 刀路下移整牙距 P 保相位 + 半步长 P/96 防棱角贴端面（traps #42）
    translate([0, 0, -P + P / 96])
      thread_ridge(d + 2 * c, P, th + 1.4 + P,
                 P * 0.5 + 2 * c, depth + c + 1);
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
- 凡是要"拧"的螺纹必须用 std_bolt / std_nut，不要自己画牙型；M6 以下牙薄、强度低，优先 ≥M6，但 M3~M12 都经过引擎校验
- pitch / 六角对边 / 螺头与螺母厚度已按 d 查表（M3~M12）：std_bolt(d, length) 与 std_nut(d) 传两个参数就行
- 间隙自动按 min(0.3, 0.24×牙距) 缩放（M8 恰 0.3），全尺寸能拧合；不要手工放大
- 螺栓头贴床、杆朝上；螺母平放；装配靠拧不是直插；两件分列摆开，校验按整牙距对齐
- 需要螺纹孔而不是螺母时，用 std_screw_hole（通孔按 clearance 放大）

${PARTS_CODE}`;

/** 供单测使用：模块库 + 一段装配场景。 */
export function partsScad(body: string): string {
  return `${PARTS_CODE}\n${body}`;
}
