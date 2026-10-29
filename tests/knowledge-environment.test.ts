/**
 * 知识库 · 运行环境硬限制（第零章）单测。
 *
 * 这些事实来自对 12 份外部 SCAD 案例的真实引擎实测（见 traps #23~#25）：
 *  - 没有任何第三方库（BOSL2 / MCAD 都不在 WASM 内），include 失败只是 warning
 *  - text() 无 CJK 字形，汉字渲染成 □
 *  - minkowski + 高 $fn 实测编译 338 秒
 *  - 体素方块对角只共棱会产生开放边
 */

import { describe, expect, it } from 'vitest';
import { ENVIRONMENT } from '../src/knowledge/environment.js';
import { buildSystemPrompt } from '../src/core/prompts.js';
import { rulesToPromptText } from '../src/knowledge/rules.js';

describe('运行环境硬限制', () => {
  it('第零章覆盖四类硬限制', () => {
    expect(ENVIRONMENT).toContain('零、运行环境与硬限制');
    expect(ENVIRONMENT).toContain('BOSL2');
    expect(ENVIRONMENT).toContain('MCAD');
    expect(ENVIRONMENT).toContain('豆腐块');
    expect(ENVIRONMENT).toContain('338 秒');
    expect(ENVIRONMENT).toContain('import(');
  });

  it('附带 M 规格紧固件速查表', () => {
    expect(ENVIRONMENT).toContain('对边宽 S');
    expect(ENVIRONMENT).toContain('M3');
    expect(ENVIRONMENT).toContain('1.732');
  });

  it('system prompt 里第零章排在工作流程之前', () => {
    const prompt = buildSystemPrompt();
    const env = prompt.indexOf('零、运行环境与硬限制');
    const flow = prompt.indexOf('一、工作流程');
    expect(env).toBeGreaterThan(-1);
    expect(flow).toBeGreaterThan(-1);
    expect(env).toBeLessThan(flow);
  });

  it('常见错误清单收录运行环境类错误', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('34. 写了 include');
    expect(prompt).toContain('35. 把中文');
    expect(prompt).toContain('36. 用 minkowski');
    expect(prompt).toContain('37. 体素');
  });

  it('S02 反例包含体素对角共棱', () => {
    expect(rulesToPromptText()).toContain('角对角');
  });
});
