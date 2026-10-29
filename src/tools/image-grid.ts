/**
 * 图片 → 像素网格 → SCAD 源码。
 *
 * 引擎读不到外部文件（`import()` 为空），所以图片必须在浏览器里先降采样成
 * 离散网格，再把网格编码成 SCAD 里的一个字符串常量；SCAD 端用
 * `[for (c = pixels) ord(c) - 48]` 还原成数字数组。
 *
 * 生成结果默认走「像素浮雕板 / 拼豆板」范例 60 的结构，用户拿到源码后仍可调参。
 */

export interface PixelGrid {
  cols: number;
  rows: number;
  /** 每格等级：0 = 空白，1..levels-1 = 逐级变高（拼豆模式下 >0 即一颗珠子）。 */
  cells: number[];
}

export interface ImageLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * 把一张已解码的图片降采样成像素网格。
 *
 * @param invert 反相：适合"白线在深色底"的图（默认深色为实心）。
 */
export function gridFromImage(
  img: ImageLike,
  cols: number,
  levels: number,
  invert = false
): PixelGrid {
  const safeCols = Math.max(4, Math.min(96, Math.round(cols)));
  const safeLevels = Math.max(2, Math.min(9, Math.round(levels)));
  const rows = Math.max(1, Math.round((safeCols * img.height) / Math.max(1, img.width)));
  const cells: number[] = [];

  for (let r = 0; r < rows; r++) {
    const y0 = Math.floor((r * img.height) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((r + 1) * img.height) / rows));
    for (let c = 0; c < safeCols; c++) {
      const x0 = Math.floor((c * img.width) / safeCols);
      const x1 = Math.max(x0 + 1, Math.floor(((c + 1) * img.width) / safeCols));

      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const p = (y * img.width + x) * 4;
          const alpha = img.data[p + 3]! / 255;
          // 透明像素按白底合成，否则 PNG 透明背景会变成全黑
          const lum =
            (0.299 * img.data[p]! + 0.587 * img.data[p + 1]! + 0.114 * img.data[p + 2]!) * alpha +
            255 * (1 - alpha);
          sum += invert ? 255 - lum : lum;
          n++;
        }
      }
      const dark = 255 - sum / Math.max(1, n);
      cells.push(Math.min(safeLevels - 1, Math.max(0, Math.floor((dark / 255) * safeLevels))));
    }
  }

  return { cols: safeCols, rows, cells };
}

export interface PixelScadOptions {
  cell: number;
  baseThickness: number;
  /** 0 = 分层浮雕，1 = 拼豆空心珠。 */
  style: 0 | 1;
  layerHeight: number;
  beadHeight: number;
  cornerRadius: number;
  /** 写入 SCAD 顶部注释的来源说明。 */
  source?: string;
}

/** 生成完整可运行的 .scad 源码（含 Customizer 分组）。 */
export function gridToScad(grid: PixelGrid, opts: PixelScadOptions): string {
  const rows: string[] = [];
  for (let r = 0; r < grid.rows; r++) {
    const row = grid.cells.slice(r * grid.cols, (r + 1) * grid.cols).join('');
    rows.push(`  "${row}"${r === grid.rows - 1 ? '' : ','}  // 第 ${r + 1} 行`);
  }
  const header = opts.source ? `// ${opts.source}\n` : '';

  return `${header}/* [画板] */
cell = ${opts.cell}; // [3:0.5:12]
base_thickness = ${opts.baseThickness}; // [1.2:0.2:8]
corner_radius = ${opts.cornerRadius}; // [0:0.5:12]

/* [样式] */
style = ${opts.style}; // [0: 分层浮雕, 1: 拼豆空心珠]
layer_height = ${opts.layerHeight}; // [0.4:0.2:4]
bead_height = ${opts.beadHeight}; // [2:0.5:8]

/* [Hidden] */
$fn = 32;

// 像素数据：每格一个字符，0=空白，1~(levels-1)=逐级变高（拼豆模式下 >0 就是一颗）
cols = ${grid.cols};
rows = ${grid.rows};
pixels = str(
${rows.join('\n')}
);

data = [for (c = pixels) ord(c) - 48];
function px(i, j) = let (k = j * cols + i) (k >= 0 && k < len(data)) ? data[k] : 0;

board_w = cols * cell;
board_d = rows * cell;

difference() {
  union() {
    // 底板（圆角矩形）
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
}
`;
}

/** 估算生成模型的实体数（底板 1 个 + 非空白格）。 */
export function countParts(grid: PixelGrid): number {
  return 1 + grid.cells.filter((v) => v > 0).length;
}
