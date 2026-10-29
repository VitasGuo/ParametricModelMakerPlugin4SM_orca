/**
 * 图片 → 像素网格 → SCAD 的纯函数测试。
 *
 * 最后一条用例会把生成的源码丢进真实 OpenSCAD 引擎，验证 `ord()` 解码可用、
 * 结构干净（单实体、贴床、无开放边）。图片导入功能的地基就是这个。
 */

import { describe, expect, it } from 'vitest';
import { countParts, gridFromImage, gridToScad, type ImageLike } from '../src/tools/image-grid.js';
import { compileScadInNode } from './helpers/compile-node.js';
import { analyzeMesh } from './helpers/mesh-structure.js';

/** 造一张左侧黑、右侧白的图。 */
function halfBlack(width = 8, height = 4): ImageLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const v = x < width / 2 ? 0 : 255;
      data[p] = v;
      data[p + 1] = v;
      data[p + 2] = v;
      data[p + 3] = 255;
    }
  }
  return { width, height, data };
}

describe('gridFromImage', () => {
  it('黑半边降采样后为最高等级，白半边为 0', () => {
    const grid = gridFromImage(halfBlack(), 4, 3);
    expect(grid.cols).toBe(4);
    expect(grid.rows).toBe(2);
    expect(grid.cells.slice(0, 2)).toEqual([2, 2]);
    expect(grid.cells.slice(2, 4)).toEqual([0, 0]);
  });

  it('反相后左右颠倒', () => {
    const grid = gridFromImage(halfBlack(), 4, 3, true);
    expect(grid.cells.slice(0, 2)).toEqual([0, 0]);
    expect(grid.cells.slice(2, 4)).toEqual([2, 2]);
  });

  it('透明背景按白底处理，不会被当成黑', () => {
    const img = halfBlack(4, 2);
    for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = 0;
    const grid = gridFromImage(img, 4, 2);
    expect(grid.cells.every((v) => v === 0)).toBe(true);
  });
});

describe('gridToScad', () => {
  const grid = gridFromImage(halfBlack(), 4, 3);
  const scad = gridToScad(grid, {
    cell: 6,
    baseThickness: 2.4,
    style: 0,
    layerHeight: 1.2,
    beadHeight: 4,
    cornerRadius: 3,
    source: '测试图',
  });

  it('包含行列数、像素串与 Customizer 分组', () => {
    expect(scad).toContain('cols = 4;');
    expect(scad).toContain('rows = 2;');
    expect(scad).toContain('"2200"');
    expect(scad).toContain('/* [画板] */');
    expect(scad).toContain('/* [Hidden] */');
    expect(scad).toContain('ord(c) - 48');
  });

  it('实体数 = 1 个底板 + 非空白格', () => {
    expect(countParts(grid)).toBe(1 + 4);
  });

  it('真实引擎能编译、单实体、贴床、无开放边（验证 ord 解码）', async () => {
    const result = await compileScadInNode(scad);
    expect(result.exit, result.logs.filter((l) => l.startsWith('ERR')).slice(-2).join(' | ')).toBe(0);
    const buf = result.stl!.buffer.slice(
      result.stl!.byteOffset,
      result.stl!.byteOffset + result.stl!.byteLength
    ) as ArrayBuffer;
    const mesh = analyzeMesh(buf);
    expect(mesh.openEdges).toBe(0);
    expect(mesh.components).toBe(1);
    expect(mesh.minZ).toBeGreaterThan(-0.1);
    expect(mesh.minZ).toBeLessThan(0.2);
  }, 60_000);
});
