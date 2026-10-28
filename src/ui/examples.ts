/** 范例库弹窗：搜索、分类过滤、载入/复制。 */

import { EXAMPLE_CATEGORIES, EXAMPLES, LEVEL_LABELS, type ModelingExample } from '../core/examples.js';
import { button, clear, el, input, modal } from './dom.js';
import { toast } from './toast.js';

export function openExamplesModal(onPick: (example: ModelingExample) => void): void {
  const search = input('search', '', '搜索名称、用途、思路…');
  const chips = el('div', 'chips');
  const list = el('div', 'example-list');
  let category = '全部';

  const body = el('div', 'modal-body', [
    el('div', 'example-toolbar', [search]),
    chips,
    list,
  ]);

  const dialog = modal('建模范例库', body, () => {});

  const categories = ['全部', ...EXAMPLE_CATEGORIES];
  for (const cat of categories) {
    const chip = button(cat, cat === '全部' ? 'chip active' : 'chip', () => {
      category = cat;
      for (const child of Array.from(chips.children)) {
        if (child instanceof HTMLElement) child.classList.toggle('active', child.textContent === cat);
      }
      render();
    });
    chips.appendChild(chip);
  }

  search.addEventListener('input', render);

  function render(): void {
    clear(list);
    const q = search.value.trim().toLowerCase();
    const items = EXAMPLES.filter((example) => {
      if (category !== '全部' && example.category !== category) return false;
      if (!q) return true;
      return [example.name, example.applies, example.idea, example.category, ...example.points]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    if (items.length === 0) {
      list.appendChild(el('div', 'param-empty', ['没有匹配的范例。']));
      return;
    }

    for (const example of items) {
      const card = el('div', 'example-card', [
        el('div', 'example-card-head', [
          el('strong', '', [example.name]),
          el('span', 'example-meta', [`#${example.id}`]),
        ]),
        el('div', 'example-meta', [`${example.category} · ${LEVEL_LABELS[example.level]}`]),
        el('p', '', [example.applies]),
        el('div', 'example-actions', [
          button('复制代码', 'btn btn-sm btn-ghost', () => {
            void navigator.clipboard
              .writeText(example.code)
              .then(() => toast('代码已复制'))
              .catch(() => toast('复制失败', 'error'));
          }),
          button('载入', 'btn btn-sm btn-accent', () => {
            dialog.close();
            onPick(example);
          }),
        ]),
      ]);
      list.appendChild(card);
    }
  }

  render();
}
