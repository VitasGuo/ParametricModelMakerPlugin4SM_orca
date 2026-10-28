import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/core/examples.js';
import { compileScadInNode } from './helpers/compile-node.js';
import { analyzeMesh } from './helpers/mesh-structure.js';

/** 有意拆成多件打印的范例：盒身+盖子、花盆+托盘、4 个杯垫。 */
const MULTI_PART_OK = new Set([6, 19, 40]);

describe('范例库真实引擎冒烟（traps #1）', () => {
  it(`全部 ${EXAMPLES.length} 个范例编译成功且结构完整`, async () => {
    for (const example of EXAMPLES) {
      const result = await compileScadInNode(example.code);
      const detail = result.logs.filter((l) => l.includes('ERR')).slice(-3).join(' | ');
      const label = `ex${example.id} ${example.name}`;
      expect(result.exit, `${label} 编译失败：${detail}`).toBe(0);
      expect(result.stl?.length ?? 0, `${label} 输出为空`).toBeGreaterThan(0);

      const buffer = result.stl!.buffer.slice(
        result.stl!.byteOffset,
        result.stl!.byteOffset + result.stl!.byteLength
      ) as ArrayBuffer;
      const mesh = analyzeMesh(buffer);
      expect(mesh.openEdges, `${label} 有 ${mesh.openEdges} 条开放边（破面/非流形）`).toBe(0);
      expect(mesh.minZ, `${label} 最低点 ${mesh.minZ.toFixed(2)}mm 低于热床`).toBeGreaterThan(-0.1);
      expect(mesh.minZ, `${label} 最低点 ${mesh.minZ.toFixed(2)}mm 悬空`).toBeLessThan(0.2);
      if (!MULTI_PART_OK.has(example.id)) {
        expect(mesh.components, `${label} 由 ${mesh.components} 个互不相连的实体组成`).toBe(1);
      }
    }
  }, 180_000);

  it('ex27 玫瑰线默认 5 瓣不再为空模型', async () => {
    const ex = EXAMPLES.find((e) => e.id === 27)!;
    const result = await compileScadInNode(ex.code);
    expect(result.exit).toBe(0);
    expect(result.stl?.length ?? 0).toBeGreaterThan(10_000);
  });
});
