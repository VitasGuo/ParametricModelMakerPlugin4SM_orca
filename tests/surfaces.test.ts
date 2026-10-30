/**
 * 曲面与点阵模块真实引擎回归（第十二章）。
 *
 * 覆盖：loft 封闭性与体积、sweep 沿平面路径成体、rod 方向、
 * lattice_block 流形与尺寸。这些模块是 AI 直接复制的，绕向错一点就破面。
 */

import { describe, expect, it } from 'vitest';
import { surfacesScad } from '../src/knowledge/surfaces.js';
import { analyzeMeshParts } from '../src/core/mesh-parts.js';
import { compileScadInNode } from './helpers/compile-node.js';
import { analyzeMesh, meshVolumeMm3 } from './helpers/mesh-structure.js';

async function compile(body: string): Promise<ArrayBuffer> {
  const result = await compileScadInNode(surfacesScad(body));
  const detail = result.logs.filter((l) => l.includes('ERR')).slice(-3).join(' | ');
  expect(result.exit, `编译失败：${detail}`).toBe(0);
  expect(result.stl?.byteLength ?? 0).toBeGreaterThan(0);
  return result.stl!.buffer.slice(
    result.stl!.byteOffset,
    result.stl!.byteOffset + result.stl!.byteLength
  ) as ArrayBuffer;
}

describe('曲面与点阵模块', () => {
  it('loft：两圆截面放样成圆台，封闭且体积正确', async () => {
    const buffer = await compile(`
      p = circle_pts(10, 32);
      loft([sect(p, 0, 1), sect(p, 10, 0.8), sect(p, 20, 0.5)]);
    `);
    const mesh = analyzeMesh(buffer);
    expect(mesh.openEdges).toBe(0);
    expect(mesh.components).toBe(1);
    // 两段圆台：π×10×(100+100×0.8+0.64×100)/3 + π×10×(0.64×100+0.5×0.8×100+0.25×100)/3
    expect(meshVolumeMm3(buffer)).toBeGreaterThan(3_000);
    expect(meshVolumeMm3(buffer)).toBeLessThan(4_000);
    const parts = analyzeMeshParts(buffer)!;
    expect(parts[0]!.size[2]).toBeCloseTo(20, 1);
  });

  it('rod：从 [0,0,0] 到 [20,0,10] 的杆朝上不朝下', async () => {
    const buffer = await compile('rod([0, 0, 0], [20, 0, 10], 1);');
    const mesh = analyzeMesh(buffer);
    expect(mesh.components).toBe(1);
    expect(mesh.maxZ).toBeGreaterThan(9.5);
    expect(mesh.maxZ).toBeLessThan(12);
    expect(mesh.minZ).toBeGreaterThan(-2);
  });

  it('sweep：L 形路径扫掠成弯梁，封闭且贴床', async () => {
    const buffer = await compile(`
      path = [[0, 0], [30, 0], [30, 20], [30, 40]];
      profile = [[-3, 0], [3, 0], [3, 6], [-3, 6]];
      sweep(path, profile);
    `);
    const mesh = analyzeMesh(buffer);
    expect(mesh.openEdges).toBe(0);
    expect(mesh.components).toBe(1);
    expect(mesh.minZ).toBeGreaterThan(-0.1);
    expect(mesh.minZ).toBeLessThan(0.2);
    expect(mesh.maxZ).toBeCloseTo(6, 1);
  });

  it('lattice_block：立方晶格为单一实体且流形，尺寸不越界', async () => {
    const buffer = await compile('lattice_block([24, 24, 24], 8, 1.4);');
    const mesh = analyzeMesh(buffer);
    expect(mesh.openEdges).toBe(0);
    expect(mesh.components).toBe(1);
    expect(mesh.minZ).toBeGreaterThan(-0.1);
    expect(mesh.maxZ).toBeCloseTo(24, 1);
    const parts = analyzeMeshParts(buffer)!;
    const size = parts[0]!.size;
    expect(size[0]).toBeCloseTo(24, 1);
    expect(size[1]).toBeCloseTo(24, 1);
    // 远小于实心方块：杆与节点只占很小一部分体积
    expect(parts[0]!.volumeMm3).toBeLessThan(24 ** 3 * 0.35);
  });

  it('lattice_block：开体对角线后仍是单一流形实体', async () => {
    const buffer = await compile('lattice_block([24, 24, 24], 12, 1.4, true);');
    const mesh = analyzeMesh(buffer);
    expect(mesh.openEdges).toBe(0);
    expect(mesh.components).toBe(1);
    expect(mesh.maxZ).toBeCloseTo(24, 1);
  });
});
