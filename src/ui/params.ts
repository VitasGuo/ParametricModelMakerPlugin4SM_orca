/** Customizer 参数面板。 */

import type { ScadParam } from '../core/types.js';
import type { ParamValue } from '../engine/types.js';
import type { AppState, Store } from '../state/store.js';
import { button, clear, el } from './dom.js';

interface ControlBinding {
  param: ScadParam;
  sync: (value: ParamValue) => void;
  /** 正在被用户编辑的文本控件；同步时跳过它，避免光标跳动。 */
  focusEl?: HTMLElement;
}

export class ParamPanel {
  private readonly container: HTMLElement;
  private readonly store: Store;
  private readonly list: HTMLElement;
  private signature = '';
  private bindings: ControlBinding[] = [];

  constructor(container: HTMLElement, store: Store) {
    this.container = container;
    this.store = store;

    const reset = button('重置为源码默认值', 'btn btn-sm btn-ghost', () => store.resetParams());
    const head = el('div', 'panel-head', [
      el('span', 'panel-title', ['参数']),
      el('span', 'spacer'),
      reset,
    ]);
    this.list = el('div', 'params');
    this.container.append(head, this.list);
  }

  render(state: AppState): void {
    const visible = state.params.filter(
      (p) => !state.hiddenGroups.some((hg) => p.group.toLowerCase() === hg.toLowerCase())
    );
    const signature = visible
      .map((p) => `${p.name}:${p.group}:${p.control.kind}:${JSON.stringify(p.control)}`)
      .join('|');

    if (signature !== this.signature) {
      this.signature = signature;
      this.build(visible);
    }

    for (const binding of this.bindings) {
      // 只跳过正在输入的那一个控件，其它参数照常同步（避免光标跳动的同时不冻结整个面板）
      if (binding.focusEl && document.activeElement === binding.focusEl) continue;
      binding.sync(state.project.paramValues[binding.param.name] ?? binding.param.default);
    }

    if (visible.length === 0) {
      clear(this.list);
      this.bindings = [];
      this.list.appendChild(
        el('div', 'param-empty', [
          '当前源码没有 Customizer 参数。',
          '在源码里写 `/* [分组] */` 和 `name = 10; // [1:100]` 注释，参数面板会自动生成滑杆。',
        ])
      );
    }
  }

  private build(params: ScadParam[]): void {
    clear(this.list);
    this.bindings = [];
    if (params.length === 0) return;

    const groups = new Map<string, ScadParam[]>();
    for (const param of params) {
      const list = groups.get(param.group) ?? [];
      list.push(param);
      groups.set(param.group, list);
    }

    for (const [group, groupParams] of groups) {
      const section = el('div', 'param-group', [el('div', 'param-group-title', [group])]);
      for (const param of groupParams) {
        section.appendChild(this.createRow(param));
      }
      this.list.appendChild(section);
    }
  }

  private createRow(param: ScadParam): HTMLElement {
    const row = el('div', 'param-row', []);
    const controlBox = el('div', 'param-controls', []);
    const label = el('div', 'param-label', [
      el('span', 'param-name', [param.name]),
      param.description ? el('span', 'param-desc', [param.description]) : null,
    ]);
    row.append(label, controlBox);

    const set = (value: ParamValue) => this.store.setParam(param.name, value);
    const markFocus = (binding: ControlBinding, el: HTMLElement) => {
      el.addEventListener('focus', () => {
        binding.focusEl = el;
      });
      el.addEventListener('blur', () => {
        if (binding.focusEl === el) binding.focusEl = undefined;
      });
    };

    switch (param.control.kind) {
      case 'slider': {
        const { min, max, step } = param.control;
        const range = el('input', 'param-slider');
        range.type = 'range';
        range.min = String(min);
        range.max = String(max);
        if (step !== undefined) range.step = String(step);
        const number = el('input', 'param-number');
        number.type = 'number';
        number.min = String(min);
        number.max = String(max);
        if (step !== undefined) number.step = String(step);

        range.addEventListener('input', () => {
          number.value = range.value;
          set(Number(range.value));
        });
        number.addEventListener('change', () => {
          const value = clamp(Number(number.value), min, max);
          number.value = String(value);
          range.value = String(value);
          set(value);
        });
        const binding: ControlBinding = {
          param,
          sync: (value) => {
            const valueNum = typeof value === 'number' ? value : Number(value);
            const safe = Number.isFinite(valueNum) ? clamp(valueNum, min, max) : min;
            range.value = String(safe);
            if (document.activeElement !== number) number.value = String(safe);
          },
        };
        markFocus(binding, number);
        controlBox.append(range, number);
        this.bindings.push(binding);
        break;
      }

      case 'enum': {
        const select = el('select', 'param-select');
        for (const option of param.control.options) {
          const opt = el('option', '', [option]);
          opt.value = option;
          select.appendChild(opt);
        }
        select.addEventListener('change', () => set(select.value));
        controlBox.appendChild(select);
        this.bindings.push({ param, sync: (value) => (select.value = String(value)) });
        break;
      }

      case 'enumNum': {
        const select = el('select', 'param-select');
        for (const option of param.control.options) {
          const opt = el('option', '', [String(option)]);
          opt.value = String(option);
          select.appendChild(opt);
        }
        select.addEventListener('change', () => set(Number(select.value)));
        controlBox.appendChild(select);
        this.bindings.push({ param, sync: (value) => (select.value = String(value)) });
        break;
      }

      case 'checkbox': {
        const checkbox = el('input', 'param-checkbox');
        checkbox.type = 'checkbox';
        checkbox.addEventListener('change', () => set(checkbox.checked));
        controlBox.appendChild(checkbox);
        this.bindings.push({ param, sync: (value) => (checkbox.checked = Boolean(value)) });
        break;
      }

      case 'color': {
        const text = el('input', 'param-text');
        text.type = 'text';
        text.placeholder = '#RRGGBB 或 red';
        const color = el('input', 'param-color');
        color.type = 'color';
        text.addEventListener('change', () => set(text.value.trim()));
        color.addEventListener('input', () => {
          text.value = color.value;
          set(color.value);
        });
        controlBox.append(color, text);
        const binding: ControlBinding = {
          param,
          sync: (value) => {
            const stringValue = String(value);
            text.value = stringValue;
            if (/^#[0-9a-f]{6}$/i.test(stringValue)) color.value = stringValue;
          },
        };
        markFocus(binding, text);
        this.bindings.push(binding);
        break;
      }

      case 'font': {
        const text = el('input', 'param-text');
        text.type = 'text';
        text.placeholder = '字体名，如 Liberation Sans';
        text.addEventListener('change', () => set(text.value.trim()));
        controlBox.appendChild(text);
        const binding: ControlBinding = {
          param,
          sync: (value) => {
            if (document.activeElement !== text) text.value = String(value);
          },
        };
        markFocus(binding, text);
        this.bindings.push(binding);
        break;
      }

      case 'plain':
      default: {
        const text = el('input', 'param-text');
        text.type = 'text';
        text.addEventListener('change', () => set(text.value));
        controlBox.appendChild(text);
        const binding: ControlBinding = {
          param,
          sync: (value) => {
            if (document.activeElement !== text) text.value = String(value);
          },
        };
        markFocus(binding, text);
        this.bindings.push(binding);
        break;
      }
    }

    return row;
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
