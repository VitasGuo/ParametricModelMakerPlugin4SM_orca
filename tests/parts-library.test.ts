/**
 * 标准件模块库回归：螺栓/螺母必须"能拧"，而不只是"能编译"。
 *
 * 判定思路：把螺母按整牙距对齐套在螺杆上做布尔交集，
 *  - 对齐相位时交集体积应接近 0（只有三角化级别的薄片）
 *  - 错开半牙距时交集明显变大 → 证明牙型真的在起作用，不是两根光柱
 *
 * M3~M12 全尺寸扫掠（traps #42）：M8 只有一组数字是特例，所有尺寸都必须
 * 0 开放边、2 个连通实体、贴床，且装配校验在全尺寸成立。
 */

import { describe, expect, it } from 'vitest';
import { partsScad } from '../src/knowledge/parts.js';
import { compileScadInNode } from './helpers/compile-node.js';
import { analyzeMesh, meshVolumeMm3, toArrayBuffer } from './helpers/mesh-structure.js';

const BOLT = 'std_bolt(8, 30, 1.25);';

function bufferOf(stl: Uint8Array | null): ArrayBuffer {
  if (!stl) throw new Error('没有输出 STL');
  return toArrayBuffer(stl);
}

/** M 规格 → 标准头高（自动查表值，测试里显式写死防止表漂移）。 */
const HEAD_H: Record<number, number> = { 3: 2.1, 4: 2.8, 5: 3.5, 6: 4, 8: 5.3, 10: 6.4, 12: 7.5 };
const PITCH: Record<number, number> = { 3: 0.5, 4: 0.7, 5: 0.8, 6: 1.0, 8: 1.25, 10: 1.5, 12: 1.75 };
/** M 规格 → 标准六角对边（自动查表值）。 */
const WAF: Record<number, number> = { 3: 5.5, 4: 7, 5: 8, 6: 10, 8: 13, 10: 17, 12: 19 };

async function compile(code: string) {
  return compileScadInNode(partsScad(code));
}

describe('标准件模块库', () => {
  it('螺栓 + 螺母拆解件：编译通过、无破面、两件、贴床', async () => {
    const result = await compile(`
        translate([0, 0, 0]) std_bolt(8, 20, 1.25);
        translate([28, 0, 0]) std_nut(8, 1.25, 6.5, 14, 0.3);
      `);
    expect(result.exit, result.logs.slice(-3).join(' | ')).toBe(0);
    const mesh = analyzeMesh(bufferOf(result.stl));
    expect(mesh.openEdges).toBe(0);
    expect(mesh.components).toBe(2);
    expect(mesh.minZ).toBeGreaterThan(-0.1);
    expect(mesh.minZ).toBeLessThan(0.2);
  }, 60_000);

  it('对齐整牙距装配：交集接近 0（留 0.3 间隙能套进去）', async () => {
    // 螺纹从 z=5.3（螺栓头高）起，螺母放 5.3 即相位对齐
    const result = await compile(`
        intersection() {
          ${BOLT}
          translate([0, 0, 5.3]) std_nut(8, 1.25, 6.5, 14, 0.3);
        }
      `);
    expect(result.exit).toBe(0);
    const volume = meshVolumeMm3(bufferOf(result.stl));
    expect(volume).toBeLessThan(2.5);
  }, 60_000);

  it('错开半牙距：交集明显变大（牙型确实在啮合）', async () => {
    const result = await compile(`
        intersection() {
          ${BOLT}
          translate([0, 0, 5.925]) std_nut(8, 1.25, 6.5, 14, 0.3);
        }
      `);
    expect(result.exit).toBe(0);
    const volume = meshVolumeMm3(bufferOf(result.stl));
    expect(volume).toBeGreaterThan(8);
  }, 60_000);

  describe('M3~M12 全尺寸扫掠（traps #42）', () => {
    for (const d of [3, 4, 5, 6, 8, 10, 12]) {
      it(`M${d}：自动查表、无破面、两件、贴床、能拧`, async () => {
        const apart = await compile(`
            std_bolt(${d}, 20);
            translate([${d * 2 + 8}, 0, 0]) std_nut(${d});
          `);
        expect(apart.exit, apart.logs.slice(-3).join(' | ')).toBe(0);
        const mesh = analyzeMesh(bufferOf(apart.stl));
        expect(mesh.openEdges, `M${d} 有 ${mesh.openEdges} 条开放边`).toBe(0);
        expect(mesh.components).toBe(2);
        expect(mesh.minZ).toBeGreaterThan(-0.1);
        expect(mesh.minZ).toBeLessThan(0.2);

        const hh = HEAD_H[d]!;
        const pitch = PITCH[d]!;
        const aligned = await compile(`
            intersection() {
              std_bolt(${d}, 20);
              translate([0, 0, ${hh}]) std_nut(${d});
            }
          `);
        expect(aligned.exit, aligned.logs.slice(-3).join(' | ')).toBe(0);
        const alignedVolume = meshVolumeMm3(bufferOf(aligned.stl));

        const misaligned = await compile(`
            intersection() {
              std_bolt(${d}, 20);
              translate([0, 0, ${hh} + ${pitch} / 2]) std_nut(${d});
            }
          `);
        expect(misaligned.exit).toBe(0);
        const misalignedVolume = meshVolumeMm3(bufferOf(misaligned.stl));

        expect(
          alignedVolume,
          `M${d} 对齐相位交集体积 ${alignedVolume.toFixed(2)}mm³ 过大（间隙不足）`
        ).toBeLessThan(2.5);
        expect(
          misalignedVolume,
          `M${d} 错半牙距交集体积 ${misalignedVolume.toFixed(2)}mm³ 过小（牙型没有啮合）`
        ).toBeGreaterThan(Math.max(alignedVolume * 10, 0.5));
      }, 120_000);
    }
  });

  it('自动查表：螺头/螺母外径按 d 取标准六角对边', async () => {
    for (const d of [4, 8, 12]) {
      const bolt = await compile(`std_bolt(${d}, 20);`);
      expect(bolt.exit).toBe(0);
      const waf = WAF[d]!;
      // 六角对边 = 包围盒 X 跨度
      const hexSpan = await hexWidth(bolt.stl!);
      expect(Math.abs(hexSpan - waf), `M${d} 螺头对边 ${hexSpan.toFixed(2)} ≠ ${waf}`).toBeLessThan(0.1);
    }
  }, 60_000);

  it('显式超大间隙不击穿几何：牙宽钳制在牙距内，仍是干净网格', async () => {
    const result = await compile(`
        std_bolt(4, 20);
        translate([14, 0, 0]) std_nut(4, 0.7, 3.2, 7, 0.5);
      `);
    expect(result.exit).toBe(0);
    const mesh = analyzeMesh(bufferOf(result.stl));
    expect(mesh.openEdges).toBe(0);
    expect(mesh.components).toBe(2);
  }, 60_000);
});

/** 解析 STL bbox 拿到 X 向最大跨度（六角对边）。 */
async function hexWidth(stl: Uint8Array): Promise<number> {
  const view = new DataView(toArrayBuffer(stl));
  const count = view.getUint32(80, true);
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const o = 84 + i * 50 + 12;
    const x = view.getFloat32(o, true);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  return maxX - minX;
}