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

export interface DrawerOptions {
  /** 从哪一侧滑入：浏览类（范例/历史/项目）用 left，工具类用 right。 */
  side?: 'left' | 'right';
  /** 面板宽度（px），默认 460；窄屏自动收敛到 94vw。 */
  width?: number;
}

/** 活动抽屉栈：Esc 只关最上层，避免一次全关。 */
const drawerStack: Array<{ close: () => void }> = [];

/**
 * 侧边抽屉：贴边滑入的全高面板，替代居中浮窗。
 * 点击面板外或按 Esc 关闭；body 自行使用 `drawer-body` 类负责滚动。
 */
export function drawer(
  title: string,
  body: HTMLElement,
  onClose: () => void,
  options: DrawerOptions = {}
): { root: HTMLElement; close: () => void } {
  const side = options.side ?? 'right';
  const overlay = el('div', `drawer-overlay ${side}`);
  const sheet = el('div', `drawer ${side}`, [
    el('div', 'drawer-head', [
      el('h2', '', [title]),
      button('关闭', 'btn btn-ghost', () => close()),
    ]),
    body,
  ]);
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', title);
  if (options.width) sheet.style.width = `min(${options.width}px, 94vw)`;
  overlay.appendChild(sheet);

  let closed = false;

  function close(): void {
    if (closed) return; // 幂等：防止重复触发 onClose
    closed = true;
    const index = drawerStack.indexOf(self);
    if (index !== -1) drawerStack.splice(index, 1);
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    onClose();
  }

  const self = { root: overlay, close };

  function onKey(e: KeyboardEvent): void {
    // 多层抽屉叠开时只响应最上层
    if (e.key === 'Escape' && drawerStack[drawerStack.length - 1] === self) close();
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  drawerStack.push(self);
  return self;
}
