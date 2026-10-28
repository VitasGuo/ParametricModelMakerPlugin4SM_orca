/**
 * lint.ts 单测：.scad 写回编辑器前的确定性静态检查。
 *
 * 覆盖（error 级会触发 AI 自动重试）：
 *  - 滑块参数：default 超范围 / min>=max / step<=0
 *  - $fn 必须放 [Hidden] 组（traps.md #8 参数索引错位）
 *  - while 循环（OpenSCAD 不支持）
 *  - 壁厚过薄（warn） / 顶层变量重复赋值（warn）
 *  - 干净代码零 issue
 */

import { describe, expect, it } from 'vitest';
import { lintScad } from '../src/core/lint.js';

describe('lintScad 滑块参数检查', () => {
  it('default 超出滑块范围 → error', () => {
    const issues = lintScad('/* [Box] */\nheight = 50; // [10:20]\ncube([10,10,height]);');
    expect(issues.some((i) => i.level === 'error' && i.message.includes('height'))).toBe(true);
  });

  it('min >= max → error', () => {
    const issues = lintScad('/* [Box] */\nwidth = 15; // [20:10]\ncube(width);');
    expect(issues.some((i) => i.level === 'error' && i.message.includes('min(20) >= max(10)'))).toBe(true);
  });

  it('default 在范围内 → 无 error', () => {
    const issues = lintScad('/* [Box] */\nheight = 15; // [10:20]\ncube([10,10,height]);');
    expect(issues.filter((i) => i.level === 'error')).toHaveLength(0);
  });
});

describe('lintScad $fn 隐藏检查', () => {
  it('$fn 未放 [Hidden] 组 → error（traps.md #8）', () => {
    const issues = lintScad('$fn = 64;\n/* [Box] */\ncube(10);');
    expect(issues.some((i) => i.level === 'error' && i.message.includes('$fn'))).toBe(true);
  });

  it('$fn 放 [Hidden] 组 → 无 error', () => {
    const issues = lintScad('/* [Hidden] */\n$fn = 64;\n/* [Box] */\ncube(10);');
    expect(issues.filter((i) => i.level === 'error')).toHaveLength(0);
  });
});

describe('lintScad 语法与可打印性', () => {
  it('while 循环 → error', () => {
    const issues = lintScad('while (true) { cube(1); }');
    expect(issues.some((i) => i.level === 'error' && i.message.includes('while'))).toBe(true);
  });

  it('壁厚默认值 < 0.8mm → warn', () => {
    const issues = lintScad('/* [Wall] */\nwall_thickness = 0.5; // [0.4:3]\ncube(wall_thickness);');
    expect(issues.some((i) => i.level === 'warn' && i.message.includes('wall_thickness'))).toBe(true);
  });

  it('顶层变量重复赋值 → warn（last-wins）', () => {
    const issues = lintScad('x = 10;\nx = 20;\ncube(x);');
    expect(issues.some((i) => i.level === 'warn' && i.message.includes('赋值了 2 次'))).toBe(true);
  });
});

describe('lintScad 干净代码', () => {
  it('常规参数化盒子 → 零 issue', () => {
    const issues = lintScad(`
/* [Box] */
length = 100; // [50:200]
width = 100; // [50:200]
height = 50; // [20:100]

/* [Hidden] */
$fn = 64;

cube([length, width, height]);
`);
    expect(issues).toHaveLength(0);
  });
});
