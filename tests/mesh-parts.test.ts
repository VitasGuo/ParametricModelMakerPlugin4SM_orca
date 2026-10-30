/**
 * 网格分件回归：装配体按连通实体拆分、分件 STL 可被重新解析、parts 检查判对判错。
 *
 * 真实引擎编译，不 mock：分件正确性完全取决于网格顶点是否真的共享。
 */

import { describe, expect, it } from 'vitest';
import { analyzeMeshParts, splitMeshParts } from '../src/core/mesh-parts.js';
import { measurePartSpecs } from '../src/core/part-spec.js';
import { parseBinaryStl } from '../src/engine/stl.js';
import { compileScadInNode } from './helpers/compile-node.js';

function bufferOf(stl: Uint8Array | null): ArrayBuffer {
  if (!stl) throw new Error('没有输出 STL');
  return stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength) as ArrayBuffer;
}

describe('网格分件', () => {
  it('两件并列：拆成 2 个实体，尺寸与体积分别正确', async () => {
    const result = await compileScadInNode(`
      cube(10);
      translate([25, 0, 0]) cube([10, 20, 5]);
    `);
    expect(result.exit, result.logs.slice(-3).join(' | ')).toBe(0);
    const buffer = bufferOf(result.stl);

    const split = splitMeshParts(buffer);
    expect(split).not.toBeNull();
    expect(split!.parts).toHaveLength(2);

    const [first = 0, second = 0] = split!.parts.map((p) => p.size[0]);
    expect(first).toBeCloseTo(10, 3);
    expect(second).toBeCloseTo(10, 3);
    expect(split!.parts[1]!.size[1]).toBeCloseTo(20, 3);
    expect(split!.parts[1]!.size[2]).toBeCloseTo(5, 3);
    expect(split!.parts[0]!.volumeMm3).toBeCloseTo(1000, 0);
    expect(split!.parts[1]!.volumeMm3).toBeCloseTo(1000, 0);
  }, 60_000);

  it('分件 STL 能重新解析，包围盒与原件一致', async () => {
    const result = await compileScadInNode(`
      cube(10);
      translate([25, 0, 0]) cube([10, 20, 5]);
    `);
    expect(result.exit).toBe(0);
    const split = splitMeshParts(bufferOf(result.stl))!;

    const second = parseBinaryStl(split.stls[1]!);
    expect(second).not.toBeNull();
    expect(second!.summary.triangles).toBe(12);
    expect(second!.summary.size[1]).toBeCloseTo(20, 3);
    expect(second!.summary.bbox.min[0]).toBeCloseTo(25, 3);

    // 只统计分件信息时不生成 STL，结果与 splitMeshParts 一致
    const analyzed = analyzeMeshParts(bufferOf(result.stl))!;
    expect(analyzed.map((p) => p.triangles)).toEqual(split.parts.map((p) => p.triangles));
  }, 60_000);

  it('相互穿插的零件被布尔并集成一件（parts 检查会判失败）', async () => {
    const result = await compileScadInNode(`
      cube(10);
      translate([5, 5, 5]) cube(10);
    `);
    expect(result.exit).toBe(0);
    const buffer = bufferOf(result.stl);

    const parts = analyzeMeshParts(buffer)!;
    expect(parts).toHaveLength(1);

    const report = measurePartSpecs(buffer, [{ kind: 'parts', count: 2 }]);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toContain('独立实体数');
  }, 60_000);

  it('齿轮对：拆成 2 件，pieces 检查通过', async () => {
    const result = await compileScadInNode(`
      linear_extrude(height = 8) circle(r = 10, $fn = 64);
      translate([40, 0, 0]) linear_extrude(height = 8) circle(r = 10, $fn = 64);
    `);
    expect(result.exit).toBe(0);
    const buffer = bufferOf(result.stl);

    expect(analyzeMeshParts(buffer)).toHaveLength(2);
    const report = measurePartSpecs(buffer, [{ kind: 'parts', count: 2 }]);
    expect(report.failures).toEqual([]);
    expect(report.results[0]!.measured).toBe(2);
  }, 60_000);
});
