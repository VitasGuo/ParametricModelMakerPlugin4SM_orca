import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiRequest } from '../src/core/types.js';
import type { VerifyOutcome } from '../src/ai/verify.js';
import type { WebModelConfig } from '../src/ai/providers.js';

const mocks = vi.hoisted(() => ({ callProvider: vi.fn() }));

vi.mock('../src/ai/providers.js', () => ({
  callProvider: mocks.callProvider,
  isMultimodal: () => false,
}));

import { chat } from '../src/ai/pipeline.js';

const CFG: WebModelConfig = {
  provider: 'deepseek',
  model: 'deepseek-chat',
  apiKey: 'test',
};

const GOOD_SCAD = `/* [Box] */
size = 10;
/* [Hidden] */
$fn = 64;
cube(size);
`;

function request(userMessage = '做一个立方体'): AiRequest {
  return {
    userMessage,
    state: {
      scadSource: '',
      paramValues: {},
      previewScreenshot: '',
      capturedAt: Date.now(),
    },
    history: [],
  };
}

function outcome(overrides: Partial<VerifyOutcome> = {}): VerifyOutcome {
  return {
    ok: true,
    empty: false,
    summary: {
      triangles: 12,
      bbox: { min: [0, 0, 0], max: [10, 10, 10] },
      size: [10, 10, 10],
      volumeMm3: 1000,
      surfaceAreaMm2: 600,
    },
    problems: [],
    notes: ['[网格] 三角形 12 个'],
    screenshot: '',
    summaryText: '三角形 12 个；尺寸 10 × 10 × 10 mm',
    ...overrides,
  };
}

function raw(action: unknown, narration = 'ok'): string {
  return JSON.stringify({ action, narration });
}

beforeEach(() => {
  mocks.callProvider.mockReset();
});

describe('chat 动作分派', () => {
  it('explain 直接返回，不做编译验证', async () => {
    mocks.callProvider.mockResolvedValueOnce({
      text: raw({ type: 'explain', text: '这是一个立方体' }, '解释完成'),
    });
    const verify = vi.fn();
    const response = await chat(request('解释一下'), CFG, verify);
    expect(response.action?.type).toBe('explain');
    expect(response.narration).toBe('解释完成');
    expect(response.verification).toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
  });

  it('replaceSource 通过真实编译 + 几何审核 → passed', async () => {
    mocks.callProvider
      .mockResolvedValueOnce({
        text: raw({ type: 'replaceSource', scad: GOOD_SCAD, design_plan: '立方体' }),
      })
      .mockResolvedValueOnce({ text: '{"verdict":"pass","reason":"形状符合"}' });

    const response = await chat(request(), CFG, async () => outcome());
    expect(response.action?.type).toBe('replaceSource');
    expect(response.verification?.status).toBe('passed');
    expect(response.rerollContext).toBeUndefined();
  });

  it('编译失败 → failed + rerollContext 带问题清单', async () => {
    mocks.callProvider.mockResolvedValueOnce({
      text: raw({ type: 'replaceSource', scad: 'cube([10,10,10);', design_plan: '坏语法' }),
    });
    const response = await chat(
      request(),
      CFG,
      async () =>
        outcome({
          ok: false,
          problems: ['[编译] 第 1 行：syntax error'],
          summary: undefined,
          summaryText: '',
        })
    );
    expect(response.verification?.status).toBe('failed');
    expect(response.rerollContext?.problems.join(' ')).toContain('syntax error');
    expect(response.action?.type).toBe('replaceSource');
  });

  it('非法 JSON → error + rerollContext', async () => {
    mocks.callProvider.mockResolvedValueOnce({ text: '这不是 JSON' });
    const response = await chat(request(), CFG, async () => outcome());
    expect(response.action).toBeUndefined();
    expect(response.error).toContain('无法解析');
    expect(response.rerollContext?.problems[0]).toContain('合法 JSON');
  });

  it('几何审核 fail → verification failed', async () => {
    mocks.callProvider
      .mockResolvedValueOnce({
        text: raw({ type: 'replaceSource', scad: GOOD_SCAD, design_plan: '立方体' }),
      })
      .mockResolvedValueOnce({ text: '{"verdict":"fail","reason":"这是盒子不是碗"}' });
    const response = await chat(request(), CFG, async () => outcome());
    expect(response.verification?.status).toBe('failed');
    expect(response.rerollContext?.problems.join(' ')).toContain('这是盒子不是碗');
  });
});
