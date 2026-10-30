/**
 * 知识库 · 齿轮模块库（L5）。
 *
 * 齿轮的可用性取决于两件事：齿廓是渐开线（能连续传动、不"卡"）、
 * 中心距按模数/齿数算对。这两件都做成模块，AI 只选齿数与模数。
 *
 * 内齿圈暂不提供渐开线版本（范例 62 的梯形近似仍可用），
 * 因为内齿的齿顶/齿根方向相反，容易画错，收益不如外啮合大。
 */

export const GEARS_CODE = `
// ---------- 渐开线齿轮（压力角 20°，标准齿顶/齿根） ----------
// inv_deg：渐开线函数 inv(a) = tan(a) - a，按半径换算成角度
// 注意 OpenSCAD 的 atan 返回度数、t 是弧度，所以 t 乘 180/PI 后直接度减度
function inv_deg(r, rb) =
  r <= rb ? 0 : let (t = sqrt(r * r / (rb * rb) - 1)) t * 180 / PI - atan(t);

// 单齿点列（含到下一齿的齿槽圆弧）；th 为该齿中心角
function gear_tooth(th, z, rb, pr, ra, rf, n, gap_n) =
  let (
    pa = 360 / z,
    r0 = max(rf, rb + 0.02),
    A = 90 / z + inv_deg(pr, rb),          // 半齿角常数：分度圆处 = 90/z
    a0 = A - inv_deg(r0, rb),
    // 齿廓左侧由齿根升到齿顶
    left = [ for (j = [0 : n - 1])
               let (r = r0 + (ra - r0) * j / (n - 1), a = A - inv_deg(r, rb))
                 [r * cos(th - a), r * sin(th - a)] ],
    // 右侧回落到齿根（跳过齿顶点，避免重复点）
    right = [ for (j = [n - 2 : -1 : 0])
                let (r = r0 + (ra - r0) * j / (n - 1), a = A - inv_deg(r, rb))
                  [r * cos(th + a), r * sin(th + a)] ],
    // 齿根圆低于基圆时补一段径向裙边
    skirt = rf < r0 ? [[rf * cos(th - a0), rf * sin(th - a0)]] : [],
    skirt_end = rf < r0 ? [[rf * cos(th + a0), rf * sin(th + a0)]] : [],
    // 到下一齿的齿槽圆弧
    gap = [ for (j = [1 : gap_n])
              let (g = a0 + (pa - 2 * a0) * j / gap_n)
                [rf * cos(th + g), rf * sin(th + g)] ]
  )
  concat(skirt, left, right, skirt_end, gap);

function gear_outline(z, m, alpha, n, gap_n) =
  let (
    pr = m * z / 2,
    rb = pr * cos(alpha),
    ra = pr + m,
    rf = pr - 1.25 * m
  )
  [ for (i = [0 : z - 1])
      for (p = gear_tooth(i * 360 / z, z, rb, pr, ra, rf, n, gap_n)) p ];

// 外啮合直齿轮：z 齿数、m 模数；bore=0 表示不开轴孔
module spur_gear(z = 20, m = 2, thickness = 8, bore = 0, alpha = 20, n = 6) {
  pr = m * z / 2;
  rb = pr * cos(alpha);
  ra = pr + m;
  rf = pr - 1.25 * m;
  difference() {
    linear_extrude(height = thickness)
      polygon(gear_outline(z, m, alpha, n, 3));
    if (bore > 0)
      translate([0, 0, -1])
        cylinder(h = thickness + 2, d = bore, $fn = 48);
  }
}

// 中心距：外啮合 a = m(z1+z2)/2；内啮合（齿圈） a = m(z_ring - z_inner)/2
function gear_center(m, z1, z2) = m * (z1 + z2) / 2;
`;

export const GEARS_LIBRARY = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
十、齿轮模块库与特征级尺寸声明（part_spec）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【齿轮规则】
- 外啮合直齿轮一律调用 spur_gear(z, m, thickness, bore)，不要自己画梯形齿
- 硬约束：外啮合中心距 a = m × (z1 + z2) / 2，两轴摆位必须等于 a，写进 design_plan
- 齿数太少于 10 会根切；模数 m ≥ 1.5 才好打印，m ≥ 2 更稳
- 齿轮平放打印（齿面贴床会粘床，最好躺平 + 轴孔竖直）
- 内齿圈仍用范例 62 的梯形近似（内齿渐开线方向相反，先不追求）
- 一对齿轮要能咬合：中心距按公式算，不要目测；装配图里两齿对咬时留 0.2~0.4mm 侧隙

【part_spec：模型自己声明的关键尺寸】
replaceSource 时可带 part_spec 数组（3~8 条），引擎会用射线实测复核，
不对就把偏差回灌给你重抽。只能声明"能从几何算出来"的尺寸：

  { "kind": "size",   "expect": [x, y, z], "tol": 1 }                 // 整体包围盒
  { "kind": "hole",   "at": [x, y, z], "axis": "z", "diameter": 8 }  // at 对准孔心
  { "kind": "pitch",  "at": [x, y, z], "radius": 3.66, "pitch": 1.25 } // 螺纹牙距
  { "kind": "teeth",  "at": [x, y, z], "radius": 24, "count": 24 }    // 分度圆齿数
  { "kind": "center", "a": [x1, y1, z], "b": [x2, y2, z], "distance": 25.2 }

- 坐标一律是模型绝对坐标（translate 之后的位置），不要写相对坐标
- 螺纹孔按公称直径写（M8 写 8），公差默认 ±1mm（牙型本身会吃掉一点）
- teeth 的 radius 用分度圆半径 m/2 × z；pitch 的 at 写螺纹起点处的轴心
- 算不出来就不写这条，宁缺毋滥；写错的声明会被判失败并触发重抽

${GEARS_CODE}`;

/** 供单测使用：模块库 + 一段用法。 */
export function gearsScad(body: string): string {
  return `${GEARS_CODE}\n${body}`;
}
