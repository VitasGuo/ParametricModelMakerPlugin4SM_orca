/**
 * 项目持久化（localStorage，最多保留 30 个）。
 *
 * 纯静态应用不引入 IndexedDB 复杂度；项目只有源码/参数/对话，体积很小。
 */

import type { ProjectState } from '../state/store.js';

const KEY = 'model-lab-web:projects';
const CORRUPT_BACKUP_KEY = `${KEY}:corrupt-backup`;
const MAX_PROJECTS = 30;

export function listProjects(): ProjectState[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProjectState[];
    if (!Array.isArray(parsed)) {
      backupCorrupt(raw);
      return [];
    }
    return parsed
      .filter((p) => p && typeof p.source === 'string')
      .map((p) => ({ ...p, id: p.id || legacyId(p), chat: Array.isArray(p.chat) ? p.chat : [] }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    // JSON 损坏：把原文备份后按空列表处理，避免下次保存直接抹掉仅存的证据
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

export function saveProject(project: ProjectState): void {
  const all = listProjects().filter((p) => p.id !== project.id);
  all.unshift({ ...project, updatedAt: Date.now() });
  try {
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX_PROJECTS)));
  } catch {
    // 存储满时忽略，避免阻断编辑
  }
}

export function deleteProject(id: string): void {
  const all = listProjects().filter((p) => p.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

function legacyId(project: ProjectState): string {
  return `legacy-${project.name}-${project.updatedAt}`;
}

/** JSON 项目文件下载。 */
export function downloadProjectJson(project: ProjectState): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${safeName(project.name)}.modellab.json`);
}

/** 读取用户选择的 JSON 项目文件。 */
export async function readProjectFile(file: File): Promise<ProjectState> {
  const text = await file.text();
  const parsed = JSON.parse(text) as ProjectState;
  if (!parsed || typeof parsed.source !== 'string') {
    throw new Error('不是有效的 Model Lab 项目文件');
  }
  return {
    id: parsed.id || `import-${Date.now()}`,
    name: parsed.name || '导入项目',
    source: parsed.source,
    paramValues: parsed.paramValues ?? {},
    chat: Array.isArray(parsed.chat) ? parsed.chat : [],
    updatedAt: Date.now(),
  };
}

export function downloadArrayBuffer(buffer: ArrayBuffer, filename: string, mime: string): void {
  downloadBlob(new Blob([buffer], { type: mime }), filename);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeName(name: string): string {
  return (name || 'model').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
}
