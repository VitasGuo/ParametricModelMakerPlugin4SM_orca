/**
 * 运行时日志：内存环形缓冲 + 本机 localStorage 持久化。
 *
 * 纯静态应用没有后端，日志只用于本地排障；最多保留 500 条。
 * Node 单测环境没有 localStorage，自动退化为纯内存。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  ts: number;
  level: LogLevel;
  scope: string;
  message: string;
  detail?: string;
}

const STORAGE_KEY = 'model-lab-web:logs';
const MAX_ENTRIES = 500;

let entries: LogEntry[] = load();
let sequence = 0;

const listeners = new Set<(logs: readonly LogEntry[]) => void>();

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function load(): LogEntry[] {
  if (!storageAvailable()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LogEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry.message === 'string').slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

function persist(): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 存储满时忽略，日志不能阻断主流程
  }
}

export function log(level: LogLevel, scope: string, message: string, detail?: string): void {
  sequence += 1;
  const entry: LogEntry = {
    id: `${Date.now().toString(36)}-${sequence.toString(36)}`,
    ts: Date.now(),
    level,
    scope,
    message,
    detail,
  };
  entries = [...entries, entry].slice(-MAX_ENTRIES);
  persist();

  const consoleFn =
    level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : console.info;
  consoleFn(`[${scope}] ${message}${detail ? ` — ${detail}` : ''}`);

  for (const listener of listeners) listener(entries);
}

export const logger = {
  debug: (scope: string, message: string, detail?: string) => log('debug', scope, message, detail),
  info: (scope: string, message: string, detail?: string) => log('info', scope, message, detail),
  warn: (scope: string, message: string, detail?: string) => log('warn', scope, message, detail),
  error: (scope: string, message: string, detail?: string) => log('error', scope, message, detail),
};

export function getLogs(): readonly LogEntry[] {
  return entries;
}

export function subscribeLogs(listener: (logs: readonly LogEntry[]) => void): () => void {
  listeners.add(listener);
  listener(entries);
  return () => listeners.delete(listener);
}

export function clearLogs(): void {
  entries = [];
  persist();
  for (const listener of listeners) listener(entries);
}

export function formatLogs(): string {
  return entries
    .map((entry) => {
      const time = new Date(entry.ts).toISOString();
      const detail = entry.detail ? ` | ${entry.detail}` : '';
      return `${time} [${entry.level.toUpperCase()}] [${entry.scope}] ${entry.message}${detail}`;
    })
    .join('\n');
}
