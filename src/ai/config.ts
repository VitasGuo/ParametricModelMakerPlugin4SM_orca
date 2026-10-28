/**
 * 模型配置持久化。
 *
 * 纯静态网页没有后端，API Key 只能存在浏览器：
 * - 默认 localStorage（明文，仅本机；页面无第三方脚本，仍建议个人设备使用）
 * - 用户可关闭"保存 Key"，此时 Key 只留在本次会话内存中
 */

import { PROVIDERS, type WebModelConfig } from './providers.js';

const STORAGE_KEY = 'model-lab-web:config';
let sessionConfig: WebModelConfig | null = null;

export function defaultConfig(): WebModelConfig {
  return {
    // Orca 默认使用 SenseNova Token Plan（deepseek-flash）；
    // 本地代理由 orca-plugin/install.ps1 安装并开机启动。
    provider: 'sensenova',
    model: 'deepseek-flash',
    apiKey: '',
    proxyUrl: 'http://127.0.0.1:17329/proxy',
    saveApiKey: true,
  };
}

export function loadConfig(): WebModelConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return sessionConfig;
    const parsed = JSON.parse(raw) as WebModelConfig;
    if (!parsed || typeof parsed !== 'object' || !(parsed.provider in PROVIDERS)) {
      return sessionConfig;
    }
    const cfg: WebModelConfig = {
      ...defaultConfig(),
      ...parsed,
      saveApiKey: parsed.saveApiKey !== false,
    };
    if (!cfg.apiKey && sessionConfig?.apiKey && sessionConfig.provider === cfg.provider) {
      cfg.apiKey = sessionConfig.apiKey;
    }
    return cfg;
  } catch {
    return sessionConfig;
  }
}

export function saveConfig(cfg: WebModelConfig): void {
  sessionConfig = cfg;
  try {
    if (cfg.saveApiKey === false) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cfg, apiKey: '' }));
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    }
  } catch {
    // localStorage 不可用（隐私模式）时退回会话内存
  }
}

export function clearConfig(): void {
  sessionConfig = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** UI 展示用：只露前 4 位和后 4 位。 */
export function maskKey(key: string): string {
  if (!key) return '未填写';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
