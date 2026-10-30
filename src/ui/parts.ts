/**
 * 分件导出侧栏（装配体）。
 *
 * 装配体在源码里是"多件并列"，导出前需要按连通实体拆开分别切片。
 * 这里只做展示与下载；拆分算法见 src/core/mesh-parts.ts。
 */

import type { MeshPart } from '../core/mesh-parts.js';
import { downloadArrayBuffer } from '../storage/projects.js';
import { button, drawer, el } from './dom.js';
import { toast } from './toast.js';

export interface PartsPanelOptions {
  parts: MeshPart[];
  /** 与 parts 下标对齐的分件 STL。 */
  stls: ArrayBuffer[];
  /** 文件名前缀（项目名，已做安全化）。 */
  baseName: string;
}

export function openPartsPanel(options: PartsPanelOptions): void {
  const { parts, stls, baseName } = options;
  const body = el('div', 'drawer-body');
  const dialog = drawer('分件导出', body, () => undefined, { side: 'right', width: 460 });

  body.appendChild(
    el('div', 'parts-note', [
      `共 ${parts.length} 个独立实体。分件按"共享顶点连通"判定：相互穿插的零件会被布尔并集烘成一件，` +
        '所以装配示意要留 ≥0.5mm 间隙；点/边接触也会被算成同一件。',
    ])
  );

  const list = el('div', 'parts-list');
  parts.forEach((part, i) => {
    const row = el('div', 'parts-row', [
      el('span', 'parts-name', [`零件 ${i + 1}`]),
      el('span', 'parts-dim', [
        `${part.size.map((n) => n.toFixed(1)).join(' × ')} mm · ` +
          `${(part.volumeMm3 / 1000).toFixed(2)} cm³ · ${part.triangles} 面`,
      ]),
    ]);
    const stl = stls[i];
    if (stl) row.appendChild(button('导出', 'btn btn-sm', () => downloadPart(stl, i)));
    list.appendChild(row);
  });
  body.appendChild(list);

  const actions = el('div', 'drawer-actions', [
    parts.length > 1 ? button('全部导出', 'btn btn-accent', () => downloadAll()) : null,
    button('关闭', 'btn btn-ghost', () => dialog.close()),
  ]);
  body.appendChild(actions);

  function partName(i: number): string {
    return `${baseName}_part${String(i + 1).padStart(2, '0')}.stl`;
  }

  function downloadPart(stl: ArrayBuffer, i: number): void {
    downloadArrayBuffer(stl, partName(i), 'model/stl');
    toast(`已导出零件 ${i + 1}`);
  }

  function downloadAll(): void {
    // 连续触发会让浏览器合并/拦截下载，间隔 300ms 逐个下发
    parts.forEach((_part, i) => {
      const stl = stls[i];
      if (!stl) return;
      window.setTimeout(() => downloadPart(stl, i), i * 300);
    });
    toast(`已开始导出 ${parts.length} 个零件`);
  }
}
