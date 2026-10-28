/** 历史版本弹窗：自动命名快照的载入、导出与删除。 */

import type { ParamValues } from '../engine/types.js';
import {
  clearHistory,
  deleteHistory,
  listHistory,
  type HistoryAction,
  type HistoryEntry,
} from '../storage/history.js';
import { downloadBlob, safeName } from '../storage/projects.js';
import { button, clear, el, modal } from './dom.js';
import { toast } from './toast.js';

const ACTION_LABELS: Record<HistoryAction, string> = {
  ai: 'AI 生成',
  example: '范例',
  manual: '手动保存',
  project: '项目快照',
};

export function openHistoryModal(onRestore: (source: string, values: ParamValues) => void): void {
  const list = el('div', 'history-list');
  const body = el('div', 'modal-body history-body', [list]);
  body.appendChild(
    el('div', 'modal-actions', [
      button('清空历史', 'btn btn-ghost', () => {
        if (!window.confirm('清空全部历史版本？此操作不可撤销。')) return;
        clearHistory();
        render();
        toast('历史版本已清空');
      }),
      button('关闭', 'btn btn-accent', () => dialog.close()),
    ])
  );

  const dialog = modal('历史版本', body, () => {});
  render();

  function render(): void {
    clear(list);
    const entries = listHistory();
    if (entries.length === 0) {
      list.appendChild(
        el('div', 'param-empty', [
          '还没有历史版本。AI 生成、载入范例时会自动命名保存；也可以在「文件 → 保存当前版本到历史」手动快照。',
        ])
      );
      return;
    }
    for (const entry of entries) {
      list.appendChild(renderCard(entry));
    }
  }

  function renderCard(entry: HistoryEntry): HTMLElement {
    const time = new Date(entry.createdAt).toLocaleString('zh-CN', { hour12: false });
    const chars = `${entry.source.length} 字符`;
    return el('div', 'history-card', [
      el('div', 'history-head', [
        el('strong', '', [entry.name]),
        el('span', 'history-badge', [ACTION_LABELS[entry.action]]),
        el('span', 'history-time', [time]),
      ]),
      entry.note ? el('div', 'history-note', [entry.note]) : null,
      el('div', 'history-meta', [chars]),
      el('div', 'history-actions', [
        button('载入', 'btn btn-sm btn-accent', () => {
          onRestore(entry.source, entry.paramValues);
          dialog.close();
          toast(`已载入「${entry.name}」`);
        }),
        button('导出 .scad', 'btn btn-sm btn-ghost', () => {
          downloadBlob(new Blob([entry.source], { type: 'text/plain' }), `${safeName(entry.name)}.scad`);
          toast('SCAD 已开始下载');
        }),
        button('删除', 'btn btn-sm btn-ghost', () => {
          deleteHistory(entry.id);
          render();
        }),
      ]),
    ]);
  }
}
