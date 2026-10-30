/**
 * 齿轮模块库回归：渐开线齿廓必须水密、尺寸对得上、齿数数得清。
 *
 * 只看"能编译"不够：梯形近似那种做法也能编译，但齿廓不是渐开线，
 * 真啮合会卡。这里用网格结构 + 射线齿数验证几何是真实的。
 */

import { describe, expect, it } from 'vitest';
import { gearsScad } from '../src/knowledge/gears.js';
import { measurePartSpecs } from '../src/core/part-spec.js';
import { compileScadInNode } from './helpers/compile-node.js';
import { analyzeMesh } from './helpers/mesh-structure.js';

function bufferOf(stl: Uint8Array | null): ArrayBuffer {
  if (!stl) throw new Error('没有输出 STL');
  return stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength) as ArrayBuffer;
}

describe('渐开线齿轮模块', () => {
  it('20 齿 m=2：水密单实体，外径 = m(z+2) = 44mm', async () => {
    const result = await compileScadInNode(gearsScad('spur_gear(20, 2, 8, 8);'));
    expect(result.exit, result.logs.slice(-3).join(' | ')).toBe(0);
    const buffer = bufferOf(result.stl);
    const mesh = analyzeMesh(buffer);
    expect(mesh.openEdges).toBe(0);
    expect(mesh.components).toBe(1);
    expect(mesh.minZ).toBeCloseTo(0, 1);
    expect(mesh.maxZ).toBeCloseTo(8, 1);

    const report = measurePartSpecs(buffer, [
      { kind: 'size', expect: [44, 44, 8], tol: 0.3 },
      { kind: 'teeth', at: [0, 0, 4], radius: 20, count: 20 },
    ]);
    expect(report.failures).toEqual([]);
  }, 60_000);

  it('12 齿 m=2.4 也能数出齿数（低压角小齿数仍可打印）', async () => {
    const result = await compileScadInNode(gearsScad('spur_gear(12, 2.4, 8, 8);'));
    expect(result.exit, result.logs.slice(-3).join(' | ')).toBe(0);
    const report = measurePartSpecs(bufferOf(result.stl), [
      { kind: 'teeth', at: [0, 0, 4], radius: 2.4 * 12 / 2, count: 12 },
      { kind: 'hole', at: [0, 0, 4], diameter: 8 },
    ]);
    expect(report.failures).toEqual([]);
  }, 60_000);
});
