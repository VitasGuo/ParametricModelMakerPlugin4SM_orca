import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiRequest } from '../src/core/types.js';
import type { VerifyOutcome } from '../src/ai/verify.js';
import type { WebModelConfig } from '../src/ai/providers.js';
import type { PartCheck } from '../src/core/part-spec.js';

const mocks = vi.hoisted(() => ({
  callProvider: vi.fn(),
  isMultimodal: vi.fn(() => false),
}));

vi.mock('../src/ai/providers.js', () => ({
  callProvider: mocks.callProvider,
  isMultimodal: mocks.isMultimodal,
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

/** 机械性失败的 3 连输出：首轮 + 2 轮修复全部失败。 */
const BROKEN_ONCE = "cube([10,10,10);"; // 语法错误

beforeEach(() => {
  mocks.callProvider.mockReset();
  mocks.isMultimodal.mockReset();
  mocks.isMultimodal.mockReturnValue(false);
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

  it('编译失败 → 自动修复 2 轮仍失败 → failed + rerollContext 带问题清单', async () => {
    for (let i = 0; i < 3; i += 1) {
      mocks.callProvider.mockResolvedValueOnce({
        text: raw({ type: 'replaceSource', scad: BROKEN_ONCE, design_plan: '坏语法' }),
      });
    }
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
    expect(mocks.callProvider).toHaveBeenCalledTimes(3);
    // 修复轮把实测问题回灌进对话历史
    const repairCall = mocks.callProvider.mock.calls[1]!;
    expect(JSON.stringify(repairCall[5])).toContain('真实引擎验证');
    expect(JSON.stringify(repairCall[5])).toContain('syntax error');
  });

  it('编译失败 → 第 1 轮自动修复即通过 → passed', async () => {
    mocks.callProvider
      .mockResolvedValueOnce({
        text: raw({ type: 'replaceSource', scad: BROKEN_ONCE, design_plan: '坏语法' }),
      })
      .mockResolvedValueOnce({
        text: raw({ type: 'replaceSource', scad: GOOD_SCAD, design_plan: '立方体' }),
      })
      .mockResolvedValueOnce({ text: '{"verdict":"pass","reason":"形状符合"}' });

    const verify = vi.fn(async (_s: string) => {
      if (verify.mock.calls.length === 1) {
        return outcome({ ok: false, problems: ['[编译] syntax error'], summaryText: '' });
      }
      return outcome();
    });
    const response = await chat(request(), CFG, verify);
    expect(response.verification?.status).toBe('passed');
    expect(response.rerollContext).toBeUndefined();
    expect(verify).toHaveBeenCalledTimes(2);
    expect(mocks.callProvider).toHaveBeenCalledTimes(3);
  });

  it('非法 JSON → 自动修复 2 轮仍失败 → error + rerollContext', async () => {
    mocks.callProvider
      .mockResolvedValueOnce({ text: '这不是 JSON' })
      .mockResolvedValueOnce({ text: '还不是 JSON' })
      .mockResolvedValueOnce({ text: '依旧不是 JSON' });
    const response = await chat(request(), CFG, async () => outcome());
    expect(response.action).toBeUndefined();
    expect(response.error).toContain('无法解析');
    expect(response.rerollContext?.problems[0]).toContain('合法 JSON');
    expect(mocks.callProvider).toHaveBeenCalledTimes(3);
  });

  it('几何审核连续失败 → 自动修复 2 轮仍不过 → failed（问题含审核理由）', async () => {
    const good = raw({ type: 'replaceSource', scad: GOOD_SCAD, design_plan: '立方体' });
    mocks.callProvider
      .mockResolvedValueOnce({ text: good })
      .mockResolvedValueOnce({ text: '{"verdict":"fail","reason":"这是盒子不是收纳盒"}' })
      .mockResolvedValueOnce({ text: good }) // 修复轮答复（同源）
      .mockResolvedValueOnce({ text: '{"verdict":"fail","reason":"还是盒子"}' })
      .mockResolvedValueOnce({ text: good })
      .mockResolvedValueOnce({ text: '{"verdict":"fail","reason":"仍然不是碗"}' });
    const response = await chat(request('做一个多格收纳盒'), CFG, async () => outcome());
    expect(response.verification?.status).toBe('failed');
    expect(response.rerollContext?.problems.join(' ')).toContain('不是碗');
    expect(mocks.callProvider).toHaveBeenCalledTimes(6);
    // 修复轮把审核理由回灌给模型
    expect(JSON.stringify(mocks.callProvider.mock.calls[2]?.[5])).toContain('这是盒子不是收纳盒');
  });

  it('几何审核 fail → 修复轮改正形状 → passed', async () => {
    mocks.callProvider
      .mockResolvedValueOnce({
        text: raw({ type: 'replaceSource', scad: GOOD_SCAD, design_plan: '立方体' }),
      })
      .mockResolvedValueOnce({ text: '{"verdict":"fail","reason":"缺分格"}' })
      .mockResolvedValueOnce({
        text: raw({ type: 'replaceSource', scad: GOOD_SCAD, design_plan: '多格盒' }),
      })
      .mockResolvedValueOnce({ text: '{"verdict":"pass","reason":"分格已做"}' });
    const response = await chat(request('做一个多格收纳盒'), CFG, async () => outcome());
    expect(response.verification?.status).toBe('passed');
    expect(response.rerollContext).toBeUndefined();
    expect(mocks.callProvider).toHaveBeenCalledTimes(4);
  });

  it('part_spec 先清洗再交给验证器（非法条目被丢弃）', async () => {
    mocks.callProvider
      .mockResolvedValueOnce({
        text: raw({
          type: 'replaceSource',
          scad: GOOD_SCAD,
          design_plan: '立方体',
          part_spec: [
            { kind: 'size', expect: [10, 10, 10], tol: 1 },
            { kind: 'hole', at: [0, 0], diameter: 8 }, // 坐标不合法 → 丢弃
          ],
        }),
      })
      .mockResolvedValueOnce({ text: '{"verdict":"pass","reason":"形状符合"}' });

    const verify = vi.fn(
      async (_source: string, _values: Record<string, string | number | boolean>, _specs?: PartCheck[]) =>
        outcome()
    );
    const response = await chat(request(), CFG, verify);
    expect(response.verification?.status).toBe('passed');
    const specs = verify.mock.calls[0]?.[2];
    expect(specs).toHaveLength(1);
    expect(specs?.[0]?.kind).toBe('size');
  });
});

describe('用户附件图片', () => {
  const IMG = 'data:image/jpeg;base64,AAAA';

  it('纯文本模型：不发送图片，并在 user 文本里说明看不到', async () => {
    mocks.callProvider.mockResolvedValueOnce({ text: raw({ type: 'explain', text: '好的' }) });
    const req = request('按这张图做个模型');
    req.images = [IMG];
    await chat(req, CFG, async () => outcome());
    const call = mocks.callProvider.mock.calls[0]!;
    expect(call[3]).toEqual([]);
    expect(call[2]).toContain('不支持图片输入');
  });

  it('视觉模型：用户附件与预览截图按顺序发送', async () => {
    mocks.isMultimodal.mockReturnValue(true);
    mocks.callProvider.mockResolvedValueOnce({ text: raw({ type: 'explain', text: '好的' }) });
    const req = request('按这张图做个模型');
    req.images = [IMG];
    req.state.previewScreenshot = 'data:image/png;base64,BBBB';
    await chat(req, CFG, async () => outcome());
    const call = mocks.callProvider.mock.calls[0]!;
    expect(call[3]).toEqual([IMG, 'data:image/png;base64,BBBB']);
    expect(call[2]).toContain('1 张参考图');
  });

  it('修复轮沿用本轮的用户文本与附件', async () => {
    mocks.isMultimodal.mockReturnValue(true);
    mocks.callProvider
      .mockResolvedValueOnce({
        text: raw({ type: 'replaceSource', scad: BROKEN_ONCE, design_plan: '坏语法' }),
      })
      .mockResolvedValueOnce({ text: raw({ type: 'explain', text: '解释' }) });
    const req = request('按这张图做个支架');
    req.images = [IMG];
    await chat(
      req,
      CFG,
      async () => outcome({ ok: false, problems: ['[编译] syntax error'], summaryText: '' })
    );
    const first = mocks.callProvider.mock.calls[0]!;
    const repairCall = mocks.callProvider.mock.calls[1]!;
    expect(repairCall[3]).toEqual(first[3]);
    expect(repairCall[2]).toBe(first[2]);
  });
});