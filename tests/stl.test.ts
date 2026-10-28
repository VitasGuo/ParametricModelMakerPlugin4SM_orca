import { describe, expect, it } from 'vitest';
import { parseBinaryStl } from '../src/engine/stl.js';
import { compileScadInNode } from './helpers/compile-node.js';

describe('parseBinaryStl', () => {
  it('解析 10mm 立方体：12 个三角形、1000mm³、600mm²', async () => {
    const result = await compileScadInNode('cube(10);');
    expect(result.exit).toBe(0);
    expect(result.stl).not.toBeNull();
    const buffer = result.stl!.slice().buffer as ArrayBuffer;
    const parsed = parseBinaryStl(buffer);
    expect(parsed).not.toBeNull();
    const summary = parsed!.summary;
    expect(summary.triangles).toBe(12);
    expect(summary.size.map((n) => Math.round(n))).toEqual([10, 10, 10]);
    expect(summary.volumeMm3).toBeCloseTo(1000, 2);
    expect(summary.surfaceAreaMm2).toBeCloseTo(600, 2);
  });

  it('拒绝截断/非 STL 数据', () => {
    expect(parseBinaryStl(new ArrayBuffer(10))).toBeNull();
    const truncated = new ArrayBuffer(100);
    new DataView(truncated).setUint32(80, 10, true);
    expect(parseBinaryStl(truncated)).toBeNull();
  });

  it('合法的空 STL（0 三角形）返回空摘要', () => {
    const empty = new ArrayBuffer(84);
    const parsed = parseBinaryStl(empty);
    expect(parsed?.summary.triangles).toBe(0);
  });

  it('3MF 导出产生非空字节', async () => {
    const result = await compileScadInNode('cube(10);', ['3mf']);
    expect(result.exit).toBe(0);
    expect(result.stl?.length ?? 0).toBeGreaterThan(0);
  });
});
