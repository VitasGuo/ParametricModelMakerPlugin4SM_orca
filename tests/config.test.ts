/**
 * config 持久化单测（beta.9 首次覆盖）。
 *
 * 重点：坏档（字段类型错误 / JSON 损坏 / 非法 provider）不能让调用方崩掉。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig, loadConfig } from '../src/ai/config.js';

const KEY = 'model-lab-web:config';

function installStorage(raw: string | null): void {
  const store = new Map<string, string>();
  if (raw !== null) store.set(KEY, raw);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadConfig 容错', () => {
  it('无配置返回 null', () => {
    installStorage(null);
    expect(loadConfig()).toBeNull();
  });

  it('正常配置原样读取', () => {
    installStorage(
      JSON.stringify({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-x' })
    );
    const cfg = loadConfig();
    expect(cfg?.provider).toBe('deepseek');
    expect(cfg?.model).toBe('deepseek-chat');
    expect(cfg?.apiKey).toBe('sk-x');
  });

  it('非法 provider 返回 null（含 __proto__ 注入）', () => {
    installStorage(JSON.stringify({ provider: '__proto__', model: 'm', apiKey: 'k' }));
    expect(loadConfig()).toBeNull();
  });

  it('字段类型错误回退默认值，不抛 TypeError', () => {
    installStorage(
      JSON.stringify({ provider: 'deepseek', model: 42, apiKey: { evil: 1 }, proxyUrl: null })
    );
    const cfg = loadConfig();
    expect(cfg?.model).toBe('');
    expect(cfg?.apiKey).toBe('');
    expect(cfg?.proxyUrl).toBe(defaultConfig().proxyUrl);
  });

  it('reasoningEffort 非法值丢弃', () => {
    installStorage(JSON.stringify({ provider: 'sensenova', model: 'm', apiKey: 'k', reasoningEffort: 'ultra' }));
    expect(loadConfig()?.reasoningEffort).toBeUndefined();
    installStorage(JSON.stringify({ provider: 'sensenova', model: 'm', apiKey: 'k', reasoningEffort: 'low' }));
    expect(loadConfig()?.reasoningEffort).toBe('low');
  });

  it('JSON 损坏返回 null', () => {
    installStorage('{oops');
    expect(loadConfig()).toBeNull();
  });
});
