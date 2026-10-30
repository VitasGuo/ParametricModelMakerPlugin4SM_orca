/**
 * 代码历史：AI 生成、载入范例或手动保存时自动命名并快照源码。
 *
 * 只存源码/参数/时间，不存对话；最多 60 条，相同源码不重复保存。
 */

import type { ParamValues } from '../engine/types.js';

export type HistoryAction = 'ai' | 'example' | 'manual' | 'project' | 'image';

export interface HistoryEntry {
  id: string;
  /** 自动生成的名称（可用 AI 设计计划 / 范例名 / 注释推导）。 */
  name: string;
  source: string;
  paramValues: ParamValues;
  createdAt: number;
  action: HistoryAction;
  /** 备注，例如用户当时的自然语言需求。 */
  note?: string;
}

const KEY = 'model-lab-web:history';
const CORRUPT_BACKUP_KEY = `${KEY}:corrupt-backup`;
const MAX_ENTRIES = 60;

export function listHistory(): HistoryEntry[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    if (!Array.isArray(parsed)) {
      backupCorrupt(raw);
      return [];
    }
    return parsed
      .filter((entry) => entry && typeof entry.source === 'string' && entry.source.trim())
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    // JSON 损坏：备份原文再按空列表处理，避免下次写入抹掉仅存的证据
    if (raw) backupCorrupt(raw);
    return [];
  }
}

function backupCorrupt(raw: string): void {
  try {
    localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
  } catch {
    // ignore
  }
}

export function pushHistory(
  input: Omit<HistoryEntry, 'id' | 'createdAt' | 'name'> & {
    name?: string;
    createdAt?: number;
  }
): HistoryEntry | null {
  if (!input.source.trim()) return null;
  const all = listHistory();
  if (all.some((entry) => entry.source === input.source)) return null;

  const createdAt = input.createdAt ?? Date.now();
  const entry: HistoryEntry = {
    ...input,
    id: `${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt,
    name: input.name?.trim() || autoNameSource(input.source, input.note, createdAt),
  };
  save([entry, ...all].slice(0, MAX_ENTRIES));
  return entry;
}

export function deleteHistory(id: string): void {
  save(listHistory().filter((entry) => entry.id !== id));
}

export function clearHistory(): void {
  save([]);
}

/**
 * 自动命名优先级：AI 设计计划/说明 → 源码里的首个中文注释 → 首个 Customizer 分组 → 时间戳。
 */
export function autoNameSource(source: string, hint?: string, createdAt = Date.now()): string {
  const hintText = normalize(hint);
  if (hintText) return truncate(hintText, 28);

  for (const line of source.split('\n')) {
    const text = line.trim();
    if (!text.startsWith('//')) continue;
    const content = normalize(text.replace(/^\/\/+\s*/, ''));
    if (!content || /^(参数|范围|hidden|尺寸|单位)$/i.test(content)) continue;
    return truncate(content, 28);
  }

  const group = /\/\*\s*\[([^\]]+)\]\s*\*\//.exec(source);
  const groupName = normalize(group?.[1]);
  if (groupName && !/hidden/i.test(groupName)) return `${truncate(groupName, 20)} 参数模型`;

  const date = new Date(createdAt);
  const stamp = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(
    date.getHours()
  ).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `代码 ${stamp}`;
}

function normalize(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function save(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // 存储满时忽略
  }
}
