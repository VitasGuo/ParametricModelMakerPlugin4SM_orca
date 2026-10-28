/** 运行日志弹窗：按级别过滤、复制、导出、清空。 */

import { clearLogs, formatLogs, subscribeLogs, type LogEntry, type LogLevel } from '../core/logger.js';
import { downloadBlob } from '../storage/projects.js';
import { button, clear, el, modal } from './dom.js';
import { toast } from './toast.js';

const FILTERS: Array<{ value: LogLevel | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'info', label: '信息' },
  { value: 'warn', label: '警告' },
  { value: 'error', label: '错误' },
];

export function openLogsModal(): void {
  let filter: LogLevel | 'all' = 'all';
  let latest: readonly LogEntry[] = [];

  const chips = el('div', 'chips');
  const list = el('div', 'log-list');

  const body = el('div', 'modal-body log-body', [chips, list]);

  for (const item of FILTERS) {
    const chip = button(item.label, item.value === 'all' ? 'chip active' : 'chip', () => {
      filter = item.value;
      for (const child of Array.from(chips.children)) {
        if (child instanceof HTMLElement) child.classList.toggle('active', child === chip);
      }
      render();
    });
    chips.appendChild(chip);
  }

  const footer = el('div', 'modal-actions', [
    button('复制', 'btn btn-ghost', () => {
      void navigator.clipboard
        .writeText(formatLogs())
        .then(() => toast('日志已复制'))
        .catch(() => toast('复制失败', 'error'));
    }),
    button('导出 .log', 'btn btn-ghost', () => {
      downloadBlob(new Blob([formatLogs()], { type: 'text/plain' }), `model-lab-${Date.now()}.log`);
      toast('日志已开始下载');
    }),
    button('清空', 'btn btn-ghost', () => {
      clearLogs();
      toast('日志已清空');
    }),
    button('关闭', 'btn btn-accent', () => dialog.close()),
  ]);
  body.appendChild(footer);

  const dialog = modal('运行日志', body, () => unsubscribe());
  const unsubscribe = subscribeLogs((logs) => {
    latest = logs;
    render();
  });

  function render(): void {
    clear(list);
    const items = latest.filter((entry) => filter === 'all' || entry.level === filter);
    if (items.length === 0) {
      list.appendChild(el('div', 'param-empty', ['暂无日志。']));
      return;
    }
    for (const entry of [...items].reverse()) {
      const time = new Date(entry.ts).toLocaleTimeString('zh-CN', { hour12: false });
      const row = el('div', `log-row ${entry.level}`, [
        el('span', 'log-time', [time]),
        el('span', 'log-scope', [entry.scope]),
        el('span', 'log-message', [entry.message]),
      ]);
      if (entry.detail) row.title = entry.detail;
      list.appendChild(row);
    }
  }
}
