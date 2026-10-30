/**
 * prompts.ts 纯函数单测。
 *
 * 统一 prompt 模式（v0.2.6）：buildSystemPrompt() 无参，buildUserContext(userMessage, state) 无参 role。
 * 覆盖：
 *  - buildSystemPrompt：含 OUTPUT_SCHEMA、严格 JSON、action type 决策规则
 *  - buildUserContext：有源码时含截图占位、无源码时含"从零生成"、参数摘要
 *  - parseAiOutput：正常 JSON、markdown 包裹、缺 action 抛错、非 JSON 抛错
 */

import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, buildUserContext, extractBalancedJson, parseAiOutput, OUTPUT_SCHEMA } from '../src/core/prompts.js';
import { EXAMPLES, PROMPT_FULL_IDS, examplesToPromptText, getExample } from '../src/core/examples.js';
import type { EditorState } from '../src/core/types.js';

const SCAD = `/* [Box] */
length = 100; // [10:200]
width = 100; // [10:200]
height = 50; // [10:200]
cube([length, width, height]);
`;

function makeState(scad = SCAD): EditorState {
  return {
    scadSource: scad,
    paramValues: { length: 100, width: 100, height: 50 },
    previewScreenshot: '',
    capturedAt: Date.now(),
  };
}

describe('buildSystemPrompt', () => {
  it('包含 OUTPUT_SCHEMA 与严格 JSON 约束', () => {
    const p = buildSystemPrompt();
    expect(p).toContain(OUTPUT_SCHEMA);
    expect(p).toContain('严格 JSON');
  });

  it('包含 4 种 action type 的决策规则', () => {
    const p = buildSystemPrompt();
    expect(p).toContain('explain');
    expect(p).toContain('batchVariants');
    expect(p).toContain('updateParams');
    expect(p).toContain('replaceSource');
  });

  it('要求 replaceSource 时用 Customizer 注释', () => {
    expect(buildSystemPrompt()).toContain('/* [Group] */');
  });

  it('体积受控：范例分两级注入，整体不超过 80k 字符', () => {
    const p = buildSystemPrompt();
    expect(p.length).toBeLessThan(80_000);
    expect(p).toContain(`${EXAMPLES.length} 个：${PROMPT_FULL_IDS.length} 个附源码`);
  });
});

describe('范例 prompt 分级', () => {
  const text = examplesToPromptText();

  it('每个范例都有条目（附源码或目录），模型知道库里有它', () => {
    for (const e of EXAMPLES) {
      const label = e.id === 3.5 ? '3b' : String(e.id);
      expect(text, `ex${label}`).toContain(`范例 ${label}：`);
    }
    const briefCount = EXAMPLES.filter((e) => !PROMPT_FULL_IDS.includes(e.id)).length;
    expect(text.match(/｜目录/g)?.length ?? 0).toBe(briefCount);
  });

  it('附源码的编号都存在，数量在合理区间', () => {
    for (const id of PROMPT_FULL_IDS) expect(getExample(id), `id ${id}`).toBeDefined();
    expect(PROMPT_FULL_IDS.length).toBeGreaterThanOrEqual(20);
    expect(PROMPT_FULL_IDS.length).toBeLessThanOrEqual(32);
  });

  it('目录条目不带代码，只有附源码条目带 openscad 代码块', () => {
    const codeBlocks = text.match(/```openscad/g)?.length ?? 0;
    expect(codeBlocks).toBe(PROMPT_FULL_IDS.length);
  });
});

describe('buildUserContext', () => {
  it('有源码时含"截图已随消息附上"占位（client.ts injectVisionDescription 替换锚点）', () => {
    const ctx = buildUserContext('再大一点', makeState());
    expect(ctx).toContain('【模型预览截图已随消息附上，请结合视觉判断】');
  });

  it('无源码时含"从零生成"提示，不含截图占位', () => {
    const ctx = buildUserContext('做个盒子', makeState(''));
    expect(ctx).not.toContain('截图已随消息附上');
    expect(ctx).toContain('无源码');
  });

  it('参数摘要按声明顺序列出', () => {
    const ctx = buildUserContext('x', makeState());
    expect(ctx).toContain('- length = 100');
    expect(ctx).toContain('- width = 100');
    expect(ctx).toContain('- height = 50');
  });
});

describe('parseAiOutput', () => {
  it('解析正常 JSON', () => {
    const r = parseAiOutput('{"action":{"type":"explain","text":"ok"},"narration":"done"}');
    expect(r.action.type).toBe('explain');
    expect(r.narration).toBe('done');
    expect(r.raw).toBe('{"action":{"type":"explain","text":"ok"},"narration":"done"}');
  });

  it('去除 ```json 包裹', () => {
    const r = parseAiOutput('```json\n{"action":{"type":"explain","text":"x"},"narration":"y"}\n```');
    expect(r.action.type).toBe('explain');
  });

  it('去除无语言标签的 ``` 包裹', () => {
    const r = parseAiOutput('```\n{"action":{"type":"explain","text":"x"},"narration":"y"}\n```');
    expect(r.action.type).toBe('explain');
  });

  it('narration 缺省时回退为空串', () => {
    const r = parseAiOutput('{"action":{"type":"explain","text":"x"}}');
    expect(r.narration).toBe('');
  });

  it('缺 action 字段抛错', () => {
    expect(() => parseAiOutput('{"narration":"x"}')).toThrow(/action/);
  });

  it('非 JSON 抛错', () => {
    expect(() => parseAiOutput('这不是 JSON')).toThrow();
  });

  it('action 不是对象抛错', () => {
    expect(() => parseAiOutput('{"action":"not-object"}')).toThrow(/action/);
  });
});

describe('parseAiOutput：混入说明文字（beta.9）', () => {
  it('JSON 前后有说明文字时回退提取平衡对象', () => {
    const raw =
      '好的，这是结果：\n{"action":{"type":"explain","text":"你好"},"narration":"n"}\n以上就是结果。';
    const parsed = parseAiOutput(raw);
    expect(parsed.action).toEqual({ type: 'explain', text: '你好' });
    expect(parsed.narration).toBe('n');
  });

  it('extractBalancedJson 对字符串里的花括号免疫', () => {
    expect(extractBalancedJson('前缀 {"a":"}{","b":{"c":1}} 后缀')).toBe('{"a":"}{","b":{"c":1}}');
    expect(extractBalancedJson('没有对象')).toBeNull();
    expect(extractBalancedJson('{"未闭合"')).toBeNull();
  });
});
