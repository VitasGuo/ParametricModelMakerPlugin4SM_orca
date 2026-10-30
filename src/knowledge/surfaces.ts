/**
 * 知识库 · 曲面与点阵（第十二章）。
 *
 * OpenSCAD 原生没有 loft / sweep / lattice，但都能用 polyhedron 与
 * 圆柱/球链拼出来。这里给一套"同一截面点数、同一绕向"的封闭网格生成器：
 * 放样与扫掠共用 rows_mesh，点阵靠节点球让杆件实重叠（union 后仍流形）。
 */

export const SURFACES_CODE = `
// ---------- 放样 / 扫掠 / 点阵（原生 polyhedron 实现） ----------
// 圆周点列（逆时针）
function circle_pts(r = 10, n = 24) =
  [for (i = [0 : n - 1]) let (a = 360 * i / n) [r * cos(a), r * sin(a)]];

// 圆角矩形点列（逆时针，总点数 4n）；w/d 为外廓尺寸
function round_pts(w = 20, d = 20, r = 4, n = 6) =
  let (rr = min(r, min(w, d) / 2 - 0.01),
       cs = [[w / 2 - rr, d / 2 - rr, 0], [-w / 2 + rr, d / 2 - rr, 90],
             [-w / 2 + rr, -d / 2 + rr, 180], [w / 2 - rr, -d / 2 + rr, 270]])
  [for (c = cs) for (k = [0 : n - 1])
     let (a = c[2] + 90 * k / (n - 1))
       [c[0] + rr * cos(a), c[1] + rr * sin(a)]];

// 一层截面：[z, 点列]；s = 缩放，dx/dy = 平移
function sect(profile, z, s = 1, dx = 0, dy = 0) =
  [z, [for (p = profile) [p[0] * s + dx, p[1] * s + dy]]];

// 多层点列 → 封闭实体；首尾自动封盖，绕向必须一致
module rows_mesh(rows) {
  n = len(rows[0]);
  m = len(rows);
  polyhedron(
    points = [for (r = rows) for (p = r) p],
    faces = concat(
      [for (i = [0 : m - 2]) for (j = [0 : n - 1])
         let (a = i * n + j, b = i * n + (j + 1) % n,
              c = (i + 1) * n + (j + 1) % n, d = (i + 1) * n + j)
           [a, b, c, d]],
      [[for (j = [n - 1 : -1 : 0]) j],
       [for (j = [0 : n - 1]) (m - 1) * n + j]]),
    convexity = 10);
}

// 多截面放样：sections = [sect(...), ...]，从下到上
module loft(sections) {
  rows_mesh([for (s = sections) [for (p = s[1]) [p[0], p[1], s[0]]]]);
}

// 沿平面路径扫掠：path = [[x, y], ...]；profile = [[u, v], ...]（u 水平法向，v 竖直）
function sweep_angle(path, i) =
  let (a = max(0, i - 1), b = min(len(path) - 1, i + 1))
    atan2(path[b][1] - path[a][1], path[b][0] - path[a][0]);

module sweep(path, profile) {
  rows_mesh([for (i = [0 : len(path) - 1])
    let (t = sweep_angle(path, i))
      [for (q = profile)
         [path[i][0] - q[0] * sin(t), path[i][1] + q[0] * cos(t), q[1]]]]);
}

// 两点圆杆（p1 → p2），r 为半径
module rod(p1, p2, r = 1.5) {
  d = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
  L = norm(d);
  yaw = atan2(d[1], d[0]);
  tilt = atan2(sqrt(d[0] * d[0] + d[1] * d[1]), d[2]);
  translate(p1) rotate([0, 0, yaw]) rotate([0, tilt, 0])
    translate([0, 0, L / 2])
      cylinder(h = L, r = r, center = true, $fn = 10);
}

// 点阵块：立方晶格 + 可选体对角线；节点球让杆件实重叠，union 后仍流形
module lattice_block(size = [40, 40, 40], cell = 10, strut = 1.6, diag = false) {
  nx = max(1, ceil(size[0] / cell));
  ny = max(1, ceil(size[1] / cell));
  nz = max(1, ceil(size[2] / cell));
  intersection() {
    union() {
      for (i = [0 : nx]) for (j = [0 : ny]) for (k = [0 : nz]) {
        p = [i * cell, j * cell, k * cell];
        translate(p) sphere(r = strut, $fn = 10);
        if (i < nx) rod(p, [p[0] + cell, p[1], p[2]], strut);
        if (j < ny) rod(p, [p[0], p[1] + cell, p[2]], strut);
        if (k < nz) rod(p, [p[0], p[1], p[2] + cell], strut);
        if (diag && i < nx && j < ny && k < nz) {
          q = [(i + 1) * cell, (j + 1) * cell, (k + 1) * cell];
          rod(p, q, strut);
          rod([p[0], q[1], p[2]], [q[0], p[1], q[2]], strut);
          rod([p[0], p[1], q[2]], [q[0], q[1], p[2]], strut);
          rod([q[0], p[1], p[2]], [p[0], q[1], q[2]], strut);
        }
      }
    }
    cube(size);
  }
}
`;

export const SURFACES_LIBRARY = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
十二、曲面与点阵（放样 / 扫掠 / 晶格）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【选择工具】
- 截面随高度变化（花瓶、变截面笔筒、收腰灯罩、渐变底座）→ loft
- 截面沿平面曲线走（弯把手、蛇形梁、U 型槽、弯管）→ sweep
- 需要轻量化/透气/装饰的三维网格（点阵块、晶格灯罩、减重夹芯）→ lattice_block
- 绕轴回转仍用 rotate_extrude；直线挤出仍用 linear_extrude，别用 loft 硬凑

【规则】
- 所有截面点数必须相同、绕向一致：用 circle_pts / round_pts 生成，改尺寸只改参数
- 放样层从下到上，4~12 层足够；相邻层缩放别一步到 0（最小 0.05），否则顶面退化
- loft / sweep 生成的是封闭实体；要空腔就用外层 loft 减内层 loft（内层比外层小 2×壁厚）
- sweep 路径点不要重复，相邻转角 ≤30°；急转时截面会自交，先在路径上加密采样点
- lattice_block 的 cell 取 8~20、strut 取 cell 的 12%~20%；点阵必须与外壳/底板重叠 ≥0.5mm
- 点阵块直接贴床（z=0）；做灯罩时外壳留 1.5~2mm 壁厚，别做成实心

${SURFACES_CODE}`;

/** 供单测使用：模块库 + 一段用法。 */
export function surfacesScad(body: string): string {
  return `${SURFACES_CODE}\n${body}`;
}
