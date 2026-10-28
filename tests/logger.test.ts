import { beforeEach, describe, expect, it } from 'vitest';
import { clearLogs, formatLogs, getLogs, log } from '../src/core/logger.js';

beforeEach(() => {
  clearLogs();
});

describe('logger 环形缓冲', () => {
  it('记录级别、scope 与详情', () => {
    log('info', 'app', '启动', 'v1.0.0');
    const [entry] = getLogs();
    expect(entry?.level).toBe('info');
    expect(entry?.scope).toBe('app');
    expect(entry?.message).toBe('启动');
    expect(entry?.detail).toBe('v1.0.0');
  });

  it('最多保留 500 条，丢弃最旧记录', () => {
    for (let i = 0; i < 510; i += 1) log('debug', 'test', `entry-${i}`);
    const logs = getLogs();
    expect(logs).toHaveLength(500);
    expect(logs[0]?.message).toBe('entry-10');
    expect(logs.at(-1)?.message).toBe('entry-509');
  });

  it('formatLogs 输出可读文本', () => {
    log('error', 'ai', '调用失败', 'timeout');
    const text = formatLogs();
    expect(text).toContain('[ERROR]');
    expect(text).toContain('[ai]');
    expect(text).toContain('调用失败 | timeout');
  });
});
