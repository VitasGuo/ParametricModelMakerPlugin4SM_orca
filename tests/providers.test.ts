/**
 * providers 层单测（beta.9 首次覆盖）。
 *
 * 重点回归：
 *  - normalizeClaudeHistory：Claude /v1/messages 要求 user 开头 + 严格交替
 *  - callProvider：空文本 history 过滤（失败轮次的空 assistant 消息会被 Claude 拒绝）
 *  - postJson：429/5xx/网络错误按退避重试（traps #17 / beta.1 的修复不再裸奔）
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { callProvider, normalizeClaudeHistory } from '../src/ai/providers.js';

const CLAUDE_CFG = {
  provider: 'claude' as const,
  model: 'claude-3-5-sonnet-20241022',
  apiKey: 'test-key',
};

const OPENAI_CFG = {
  provider: 'deepseek' as const,
  model: 'deepseek-chat',
  apiKey: 'test-key',
};

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
    handler(String(url), (init ?? {}) as RequestInit)
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeClaudeHistory', () => {
  it('合并相邻同角色消息', () => {
    const merged = normalizeClaudeHistory([
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'assistant', content: 'a2' },
    ]);
    expect(merged).toEqual([
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1\n\na2' },
    ]);
  });

  it('丢弃开头的 assistant，保证 user 起始', () => {
    const merged = normalizeClaudeHistory([
      { role: 'assistant', content: 'a0' },
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
    ]);
    expect(merged.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('全部是 assistant 时返回空数组（只剩当前 user 消息）', () => {
    expect(normalizeClaudeHistory([{ role: 'assistant', content: 'a' }])).toEqual([]);
  });
});

describe('callProvider：Claude 协议集成', () => {
  it('history 首条为 user、相邻同角色已合并', async () => {
    const mock = mockFetch(() =>
      new Response(JSON.stringify({ content: [{ type: 'text', text: '{"action":null}' }] }), { status: 200 })
    );
    await callProvider(CLAUDE_CFG, 'sys', '需求', [], 0.5, [
      { role: 'assistant', content: '' },
      { role: 'assistant', content: '上一轮失败输出' },
      { role: 'user', content: '上一条需求' },
      { role: 'assistant', content: '上一轮回复' },
    ]);
    expect(mock).toHaveBeenCalledTimes(1);
    const init = mock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe('sys');
    // 空 assistant 文本被过滤；开头 assistant 丢弃；+ 当前 user 消息
    expect(body.messages).toHaveLength(3);
    expect(body.messages[0]!.role).toBe('user');
    expect(body.messages[0]!.content[0]!.text).toBe('上一条需求');
    expect(body.messages[2]!.role).toBe('user');
  });

  it('reroll 场景（history 尾条 assistant + 追加轮次）不产生 400 结构', async () => {
    const mock = mockFetch(() =>
      new Response(JSON.stringify({ content: [{ type: 'text', text: '{}' }] }), { status: 200 })
    );
    await callProvider(CLAUDE_CFG, 'sys', '重抽需求', [], 0.5, [
      { role: 'user', content: '原始需求' },
      { role: 'assistant', content: '上次输出' },
      { role: 'assistant', content: '上次输出2' },
      { role: 'user', content: '修复反馈' },
    ]);
    const body = JSON.parse((mock.mock.calls[0]![1] as RequestInit).body as string);
    const roles = body.messages.map((m: { role: string }) => m.role);
    // user 起始 + 严格交替（相邻 assistant 已合并）
    expect(roles).toEqual(['user', 'assistant', 'user']);
  });
});

describe('postJson 重试策略', () => {
  it('5xx 后重试成功', async () => {
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      if (calls === 1) return new Response('boom', { status: 500 });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200 }
      );
    });
    const result = await callProvider(OPENAI_CFG, 'sys', 'u', [], 0.5, []);
    expect(result.text).toBe('ok');
    expect(calls).toBe(2);
  }, 10_000);

  it('fetch 网络异常也按退避重试（beta.1 行为回归）', async () => {
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      if (calls === 1) throw new TypeError('Failed to fetch');
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200 }
      );
    });
    const result = await callProvider(OPENAI_CFG, 'sys', 'u', [], 0.5, []);
    expect(result.text).toBe('ok');
    expect(calls).toBe(2);
  }, 10_000);

  it('重试次数耗尽后抛 ProviderError 并保留状态码', async () => {
    mockFetch(() => new Response('{"error":"quota"}', { status: 429 }));
    await expect(callProvider(OPENAI_CFG, 'sys', 'u', [], 0.5, [])).rejects.toThrow(/429/);
  }, 15_000);

  it('4xx（不可重试）直接抛错不重试', async () => {
    const mock = mockFetch(() => new Response('unauthorized', { status: 401 }));
    await expect(callProvider(OPENAI_CFG, 'sys', 'u', [], 0.5, [])).rejects.toThrow(/401/);
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
