/** 轻量 toast。 */

let current: HTMLElement | null = null;
let timer: number | null = null;

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
