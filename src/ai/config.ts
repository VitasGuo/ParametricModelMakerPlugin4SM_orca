/**
 * 模型配置持久化。
 *
 * 纯静态网页没有后端，API Key 以明文保存在本机 `localStorage`；
 * 只有你选择的 provider 会收到它。本机泄露风险由用户自行承担。
 */

import { PROVIDERS, type WebModelConfig } from './providers.js';
import type { ModelProvider } from '../core/types.js';

const STORAGE_KEY = 'model-lab-web:config';

export function defaultConfig(): WebModelConfig {
  return {
    // Orca 默认使用 SenseNova Token Plan（deepseek-flash）；
    // 本地代理由 orca-plugin/install.ps1 安装并开机启动。
    provider: 'sensenova',
    model: 'deepseek-flash',
    apiKey: '',
    proxyUrl: 'http://127.0.0.1:17329/proxy',
  };
}

export function loadConfig(): WebModelConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WebModelConfig> | null;
    const provider = parsed?.provider;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof provider !== 'string' ||
      !Object.hasOwn(PROVIDERS, provider)
    ) {
      return null;
    }
    // 逐字段类型校验：坏档（手改/旧版本/损坏）不能让后续 .trim() 直接抛 TypeError
    const str = (value: unknown, fallback: string): string =>
      typeof value === 'string' ? value : fallback;
    const effort = parsed.reasoningEffort;
    return {
      provider: provider as ModelProvider,
      model: str(parsed.model, ''),
      apiKey: str(parsed.apiKey, ''),
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : undefined,
      proxyUrl: str(parsed.proxyUrl, defaultConfig().proxyUrl ?? ''),
      reasoningEffort:
        effort === 'none' || effort === 'low' || effort === 'medium' || effort === 'high'
          ? effort
          : undefined,
    };
  } catch {
    return null;
  }
}

export function saveConfig(cfg: WebModelConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // localStorage 不可用（隐私模式）时配置只在内存中保留到刷新
  }
}

export function clearConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
