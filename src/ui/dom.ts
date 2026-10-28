/** 轻量 DOM 工具，避免引入 UI 框架。 */

type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  children: Child[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  append(node, children);
  return node;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function button(label: string, className = 'btn', onClick?: () => void): HTMLButtonElement {
  const b = el('button', className, [label]);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

export function textArea(placeholder: string, rows = 2): HTMLTextAreaElement {
  const t = el('textarea', '');
  t.placeholder = placeholder;
  t.rows = rows;
  return t;
}

export function input(type: string, value = '', placeholder = ''): HTMLInputElement {
  const i = el('input', '');
  i.type = type;
  i.value = value;
  i.placeholder = placeholder;
  return i;
}

export function select(options: Array<{ value: string; label: string }>): HTMLSelectElement {
  const s = el('select', '');
  for (const opt of options) {
    const o = el('option', '', [opt.label]);
    o.value = opt.value;
    s.appendChild(o);
  }
  return s;
}

export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  return el('label', 'field', [
    el('span', 'field-label', [label]),
    control,
    hint ? el('span', 'field-hint', [hint]) : null,
  ]);
}

export function modal(title: string, body: HTMLElement, onClose: () => void): { root: HTMLElement; close: () => void } {
  const overlay = el('div', 'modal-overlay');
  const card = el('div', 'modal-card', [
    el('div', 'modal-head', [
      el('h2', '', [title]),
      button('关闭', 'btn btn-ghost', () => close()),
    ]),
    body,
  ]);
  overlay.appendChild(card);

  function close(): void {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    onClose();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  return { root: overlay, close };
}
