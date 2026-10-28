/** 批量变体画廊：并排编译、缩略图、单组应用、全部导出。 */

import JSZip from 'jszip';
import type { ScadParam } from '../core/types.js';
import { mergeParamValues } from '../engine/defines.js';
import { compileBatch } from '../engine/compiler.js';
import type { ParamValue, ParamValues } from '../engine/types.js';
import { renderContactSheet } from '../viewer/headless.js';
import { getCjkFont } from '../storage/fonts.js';
import { safeName, downloadBlob } from '../storage/projects.js';
import { button, el, modal } from './dom.js';
import { toast } from './toast.js';

export interface BatchItem {
  index: number;
  values: ParamValues;
  result?: Awaited<ReturnType<typeof compileBatch>>[number];
  screenshot?: string;
}

export function openBatchModal(options: {
  source: string;
  params: ScadParam[];
  currentValues: ParamValues;
  variants: Array<Record<string, ParamValue>>;
  onApply: (values: ParamValues) => void;
}): void {
  const items: BatchItem[] = options.variants.map((variant, index) => ({
    index,
    values: mergeParamValues(options.params, { ...options.currentValues, ...variant }),
  }));

  const grid = el('div', 'batch-grid');
  const body = el('div', 'modal-body', [
    el('div', 'settings-note full', ['正在用真实引擎并行编译各组变体…']),
    grid,
  ]);
  const dialog = modal(`批量变体（${items.length} 组）`, body, () => {});

  const cards = items.map((item) => {
    const img = el('img', '');
    img.alt = `变体 ${item.index + 1}`;
    const status = el('div', 'example-meta', ['编译中…']);
    const card = el('div', 'batch-card', [
      img,
      el('div', 'batch-body', [
        el('strong', '', [`变体 ${item.index + 1}`]),
        status,
        el('code', '', [formatValues(item.values)]),
        el('div', 'example-actions', [
          button('应用此组', 'btn btn-sm', () => {
            dialog.close();
            options.onApply(item.values);
          }),
        ]),
      ]),
    ]);
    grid.appendChild(card);
    return { item, img, status };
  });

  const footer = el('div', 'modal-actions', [
    button('导出全部 STL', 'btn btn-accent', () => void exportAll(items)),
  ]);
  body.appendChild(footer);

  void (async () => {
    const font = getCjkFont();
    const results = await compileBatch(
      items.map((item) => ({
        source: options.source,
        defines: item.values,
        format: 'stl' as const,
        timeoutMs: 25_000,
        fonts: font ? [{ name: font.name, data: font.data }] : undefined,
      })),
      2
    );

    results.forEach((result, index) => {
      const ui = cards[index]!;
      ui.item.result = result;
      if (result instanceof Error) {
        ui.status.textContent = result.message;
        return;
      }
      if (!result.ok || !result.output) {
        const error = result.messages.find((m) => m.level === 'error');
        ui.status.textContent = error?.text ?? '编译失败';
        return;
      }
      ui.item.screenshot = renderContactSheet(result.output, { panelWidth: 320, panelHeight: 240 });
      if (ui.item.screenshot) ui.img.src = ui.item.screenshot;
      const [x = 0, y = 0, z = 0] = result.summary?.size ?? [0, 0, 0];
      ui.status.textContent = `${x.toFixed(1)} × ${y.toFixed(1)} × ${z.toFixed(1)} mm · ${result.durationMs} ms`;
    });
  })();
}

async function exportAll(items: BatchItem[]): Promise<void> {
  const zip = new JSZip();
  let count = 0;
  items.forEach((item, index) => {
    if (item.result && !(item.result instanceof Error) && item.result.output) {
      zip.file(`${safeName(`variant-${index + 1}`)}.stl`, item.result.output);
      count++;
    }
  });
  if (count === 0) {
    toast('没有可导出的变体', 'error');
    return;
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${safeName('model-lab-variants')}.zip`);
  toast(`已导出 ${count} 个 STL`);
}

function formatValues(values: ParamValues): string {
  return Object.entries(values)
    .map(([key, value]) => `${key} = ${value}`)
    .join('\n');
}
