/**
 * verify.ts 网格结构审计（traps #21 运行时化）：
 * 编译成功 ≠ 结构正确——破面 / 埋床 / 悬空 / 未声明的多实体会进入 problems。
 */

import { describe, expect, it } from 'vitest';
import { outcomeFromCompile } from '../src/ai/verify.js';
import type { CompileResult } from '../src/engine/types.js';
import { toArrayBuffer } from '../src/engine/mesh-structure.js';
import { compileScadInNode } from './helpers/compile-node.js';

async function outcomeOf(code: string, partSpec: Parameters<typeof outcomeFromCompile>[2] = []) {
  const r = await compileScadInNode(code);
  const result: CompileResult = {
    ok: r.exit === 0,
    empty: !r.stl || r.stl.length < 84,
    format: 'stl',
    output: r.stl ? toArrayBuffer(r.stl) : undefined,
    messages: [],
    durationMs: 0,
  };
  return outcomeFromCompile(result, false, partSpec);
}

describe('运行时网格结构审计', () => {
  it('两个方块只共一条棱：报开放边', async () => {
    const out = await outcomeOf('cube(10); translate([10, 10, 0]) cube(10);');
    expect(out.ok).toBe(false);
    expect(out.problems.join(' ')).toContain('开放边');
  }, 60_000);

  it('埋入床面以下：报低于热床', async () => {
    const out = await outcomeOf('translate([0, 0, -2]) cube(10);');
    expect(out.ok).toBe(false);
    expect(out.problems.join(' ')).toContain('低于热床');
  }, 60_000);

  it('整体悬空：报悬空', async () => {
    const out = await outcomeOf('translate([0, 0, 2]) cube(10);');
    expect(out.ok).toBe(false);
    expect(out.problems.join(' ')).toContain('悬空');
  }, 60_000);

  it('两个分离实体且未声明 parts：报互不相连', async () => {
    const out = await outcomeOf('cube(10); translate([20, 0, 0]) cube(10);');
    expect(out.ok).toBe(false);
    expect(out.problems.join(' ')).toContain('互不相连');
  }, 60_000);

  it('两个分离实体 + parts 声明（数对得上）：放行', async () => {
    const out = await outcomeOf('cube(10); translate([20, 0, 0]) cube(10);', [
      { kind: 'parts', count: 2 },
    ]);
    expect(out.ok).toBe(true);
    expect(out.problems.join(' ')).not.toContain('互不相连');
    expect(out.notes.join(' ')).toContain('尺寸核验');
  }, 60_000);

  it('结构干净的立方体：无结构问题', async () => {
    const out = await outcomeOf('cube(10);');
    expect(out.ok).toBe(true);
    expect(out.problems.some((p) => p.startsWith('[结构]'))).toBe(false);
  }, 60_000);
});