/** 轻量 toast 与底部确认条（替代 window.confirm 浮窗）。 */

let current: HTMLElement | null = null;
let timer: number | null = null;

let currentConfirm: HTMLElement | null = null;
let confirmTimer: number | null = null;

export function toast(message: string, kind: 'info' | 'error' = 'info', duration = 2600): void {
  if (current) current.remove();
  if (timer !== null) window.clearTimeout(timer);

  const node = document.createElement('div');
  node.className = kind === 'error' ? 'toast err' : 'toast';
  node.textContent = message;
  document.body.appendChild(node);
  current = node;

  timer = window.setTimeout(() => {
    node.remove();
    if (current === node) current = null;
  }, duration);
}

/**
 * 底部确认条：粘贴在状态栏上方的操作条，不遮挡主界面。
 * 6 秒内不点确认自动收起；同一时间只保留一条。
 */
export function confirmBar(message: string, onConfirm: () => void): void {
  dismissConfirm();

  const bar = document.createElement('div');
  bar.className = 'confirm-bar';
  const text = document.createElement('span');
  text.className = 'confirm-text';
  text.textContent = message;
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'btn btn-sm btn-accent';
  ok.textContent = '确认';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn-sm btn-ghost';
  cancel.textContent = '取消';
  bar.append(text, ok, cancel);
  document.body.appendChild(bar);
  currentConfirm = bar;

  ok.addEventListener('click', () => {
    dismissConfirm();
    onConfirm();
  });
  cancel.addEventListener('click', dismissConfirm);
  confirmTimer = window.setTimeout(dismissConfirm, 6000);
}

function dismissConfirm(): void {
  if (confirmTimer !== null) {
    window.clearTimeout(confirmTimer);
    confirmTimer = null;
  }
  if (currentConfirm) {
    currentConfirm.remove();
    currentConfirm = null;
  }
}
