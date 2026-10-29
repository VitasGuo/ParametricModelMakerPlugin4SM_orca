/**
 * 知识库规则表的结构校验：编号唯一、字段完整、渲染不漏条。
 *
 * 规则表会直接进 system prompt，一条写错就会误导所有生成；
 * 这里用测试守住"格式"这一层底线。
 */

import { describe, expect, it } from 'vitest';
import { RULES, rulesToPromptText } from '../src/knowledge/rules.js';

describe('知识库规则', () => {
  it('编号唯一且符合 S/P + 两位数', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[SP]\d{2}$/);
  });

  it('每条的标题、判据、反例、修复都不为空', () => {
    for (const rule of RULES) {
      expect(rule.title.trim(), `${rule.id} title`).not.toBe('');
      expect(rule.check.trim(), `${rule.id} check`).not.toBe('');
      expect(rule.bad.trim(), `${rule.id} bad`).not.toBe('');
      expect(rule.fix.trim(), `${rule.id} fix`).not.toBe('');
    }
  });

  it('工艺类必须标为不可自动判定，结构类至少有一条可判定', () => {
    for (const rule of RULES) {
      if (rule.layer === 'print') expect(rule.autoDetect, rule.id).toBe(false);
    }
    expect(RULES.filter((r) => r.layer === 'structure' && r.autoDetect).length).toBeGreaterThan(0);
  });

  it('渲染结果包含全部编号与两个分节', () => {
    const text = rulesToPromptText();
    for (const rule of RULES) expect(text, rule.id).toContain(rule.id);
    expect(text).toContain('【结构类】');
    expect(text).toContain('【工艺类】');
  });
});
