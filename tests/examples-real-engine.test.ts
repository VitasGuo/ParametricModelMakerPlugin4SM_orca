import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/core/examples.js';
import { compileScadInNode } from './helpers/compile-node.js';

describe('范例库真实引擎冒烟（traps #1）', () => {
  it('34 个范例全部编译成功且非空', async () => {
    for (const example of EXAMPLES) {
      const result = await compileScadInNode(example.code);
      const detail = result.logs.filter((l) => l.includes('ERR')).slice(-3).join(' | ');
      expect(result.exit, `ex${example.id} ${example.name} 编译失败：${detail}`).toBe(0);
      expect(result.stl?.length ?? 0, `ex${example.id} ${example.name} 输出为空`).toBeGreaterThan(0);
    }
  }, 180_000);

  it('ex27 玫瑰线默认 5 瓣不再为空模型', async () => {
    const ex = EXAMPLES.find((e) => e.id === 27)!;
    const result = await compileScadInNode(ex.code);
    expect(result.exit).toBe(0);
    expect(result.stl?.length ?? 0).toBeGreaterThan(10_000);
  });
});
