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
import { buildSystemPrompt, buildUserContext, parseAiOutput, OUTPUT_SCHEMA } from '../src/core/prompts.js';
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
