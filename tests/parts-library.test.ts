/**
 * 标准件模块库回归：螺栓/螺母必须"能拧"，而不只是"能编译"。
 *
 * 判定思路：把螺母按整牙距对齐套在螺杆上做布尔交集，
 *  - 对齐相位时交集体积应接近 0（只有三角化级别的薄片）
 *  - 错开半牙距时交集明显变大 → 证明牙型真的在起作用，不是两根光柱
 */

import { describe, expect, it } from 'vitest';
import { partsScad } from '../src/knowledge/parts.js';
import { compileScadInNode } from './helpers/compile-node.js';
import { analyzeMesh, meshVolumeMm3 } from './helpers/mesh-structure.js';

const BOLT = 'std_bolt(8, 30, 1.25);';

function bufferOf(stl: Uint8Array | null): ArrayBuffer {
  if (!stl) throw new Error('没有输出 STL');
  return stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength) as ArrayBuffer;
}

describe('标准件模块库', () => {
  it('螺栓 + 螺母拆解件：编译通过、无破面、两件、贴床', async () => {
    const result = await compileScadInNode(
      partsScad(`
        translate([0, 0, 0]) std_bolt(8, 20, 1.25);
        translate([28, 0, 0]) std_nut(8, 1.25, 6.5, 14, 0.3);
      `)
    );
    expect(result.exit, result.logs.slice(-3).join(' | ')).toBe(0);
    const mesh = analyzeMesh(bufferOf(result.stl));
    expect(mesh.openEdges).toBe(0);
    expect(mesh.components).toBe(2);
    expect(mesh.minZ).toBeGreaterThan(-0.1);
    expect(mesh.minZ).toBeLessThan(0.2);
  }, 60_000);

  it('对齐整牙距装配：交集接近 0（留 0.3 间隙能套进去）', async () => {
    // 螺纹从 z=5.3（螺栓头高）起，螺母放 5.3 即相位对齐
    const result = await compileScadInNode(
      partsScad(`
        intersection() {
          ${BOLT}
          translate([0, 0, 5.3]) std_nut(8, 1.25, 6.5, 14, 0.3);
        }
      `)
    );
    expect(result.exit).toBe(0);
    const volume = meshVolumeMm3(bufferOf(result.stl));
    expect(volume).toBeLessThan(2.5);
  }, 60_000);

  it('错开半牙距：交集明显变大（牙型确实在啮合）', async () => {
    const result = await compileScadInNode(
      partsScad(`
        intersection() {
          ${BOLT}
          translate([0, 0, 5.925]) std_nut(8, 1.25, 6.5, 14, 0.3);
        }
      `)
    );
    expect(result.exit).toBe(0);
    const volume = meshVolumeMm3(bufferOf(result.stl));
    expect(volume).toBeGreaterThan(8);
  }, 60_000);
});
