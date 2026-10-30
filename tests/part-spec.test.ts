/**
 * 特征级尺寸核验回归：用真实编译的网格验证 AI 声明的 part_spec。
 *
 * 覆盖：孔径（螺纹孔按公称直径）、牙距、齿数、中心距 + 非法声明清洗。
 */

import { describe, expect, it } from 'vitest';
import {
  measurePartSpecs,
  normalizePartSpecs,
  type PartCheck,
} from '../src/core/part-spec.js';
import { partsScad } from '../src/knowledge/parts.js';
import { gearsScad } from '../src/knowledge/gears.js';
import { compileScadInNode } from './helpers/compile-node.js';

function bufferOf(stl: Uint8Array | null): ArrayBuffer {
  if (!stl) throw new Error('没有输出 STL');
  return stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength) as ArrayBuffer;
}

async function measure(scad: string, checks: PartCheck[]) {
  const result = await compileScadInNode(scad);
  expect(result.exit, result.logs.slice(-3).join(' | ')).toBe(0);
  return measurePartSpecs(bufferOf(result.stl), checks);
}

describe('normalizePartSpecs', () => {
  it('过滤结构不合法的条目，保留合法条目', () => {
    const cleaned = normalizePartSpecs([
      { kind: 'hole', at: [0, 0, 3], diameter: 8 },
      { kind: 'hole', at: [0, 0], diameter: 8 }, // 坐标不合法
      { kind: 'teeth', at: [0, 0, 4], radius: 20, count: 20 },
      { kind: 'bogus' },
      'not-an-object',
      { kind: 'size', expect: [10, 20, 5] },
      { kind: 'parts', count: 2 },
      { kind: 'parts', count: 0 }, // 件数必须为正
    ]);
    expect(cleaned).toHaveLength(4);
    expect(cleaned.map((c) => c.kind)).toEqual(['hole', 'teeth', 'size', 'parts']);
  });

  it('非数组输入返回空列表', () => {
    expect(normalizePartSpecs(undefined)).toEqual([]);
    expect(normalizePartSpecs('oops')).toEqual([]);
  });
});

describe('部件实测', () => {
  it('M8 螺母：螺纹孔按公称直径 ±1mm 通过', async () => {
    const report = await measure(partsScad('std_nut(8, 1.25, 6.5, 14, 0.3);'), [
      { kind: 'hole', at: [0, 0, 3.25], diameter: 8 },
      { kind: 'size', expect: [14, 12.1, 6.5], tol: 0.5 },
    ]);
    expect(report.failures).toEqual([]);
    const hole = report.results.find((r) => r.label.includes('孔径'))!;
    // 螺孔小径 = 8/2 - 0.55×1.25 + 0.3 的两倍
    expect(hole.measured!).toBeGreaterThan(7);
    expect(hole.measured!).toBeLessThanOrEqual(8);
  }, 60_000);

  it('M8 螺栓：牙距实测 ≈ 1.25', async () => {
    const report = await measure(partsScad('std_bolt(8, 30, 1.25);'), [
      { kind: 'pitch', at: [0, 0, 5.3], radius: 3.66, pitch: 1.25 },
    ]);
    expect(report.failures).toEqual([]);
    expect(report.results[0]!.measured!).toBeCloseTo(1.25, 1);
  }, 60_000);

  it('声明的牙距不对时判失败（1.5 vs 实测 1.25）', async () => {
    const report = await measure(partsScad('std_bolt(8, 30, 1.25);'), [
      { kind: 'pitch', at: [0, 0, 5.3], radius: 3.66, pitch: 1.5 },
    ]);
    expect(report.failures.length).toBe(1);
    expect(report.failures[0]).toContain('牙距');
  }, 60_000);

  it('渐开线齿轮：分度圆上扫出正确齿数', async () => {
    const report = await measure(gearsScad('spur_gear(20, 2, 8, 8);'), [
      { kind: 'teeth', at: [0, 0, 4], radius: 20, count: 20 },
      { kind: 'hole', at: [0, 0, 4], diameter: 8 },
    ]);
    expect(report.failures).toEqual([]);
  }, 60_000);

  it('齿轮对：中心距 = m(z1+z2)/2，两处轴孔通透', async () => {
    const report = await measure(
      gearsScad(`
        spur_gear(20, 2, 8, 8);
        translate([60, 0, 0]) spur_gear(40, 2, 8, 8);
      `),
      [{ kind: 'center', a: [0, 0, 4], b: [60, 0, 4], distance: 60, tol: 0.2 }]
    );
    expect(report.failures).toEqual([]);
  }, 60_000);

  it('中心距写错（55 vs 实际 60）判失败', async () => {
    const report = await measure(
      gearsScad(`
        spur_gear(20, 2, 8, 8);
        translate([60, 0, 0]) spur_gear(40, 2, 8, 8);
      `),
      [{ kind: 'center', a: [0, 0, 4], b: [60, 0, 4], distance: 55 }]
    );
    expect(report.failures.length).toBe(1);
  }, 60_000);
});
