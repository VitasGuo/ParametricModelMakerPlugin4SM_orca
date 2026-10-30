/**
 * 「从图片生成像素画」侧栏。
 *
 * 引擎读不到外部文件，所以图片在浏览器里降采样成像素网格，再编码成 SCAD 里
 * 的一个字符串常量（范例 60 的结构）。这里只负责选图、调格数/色阶、预览与生成。
 */

import { countParts, gridFromImage, gridToScad, type PixelGrid } from '../tools/image-grid.js';
import { button, drawer, el, field, input, select } from './dom.js';
import { toast } from './toast.js';

const STYLE_OPTIONS = [
  { value: '0', label: '分层浮雕（每级高一点）' },
  { value: '1', label: '拼豆空心珠' },
];

export function openImageImportPanel(onGenerate: (scad: string, note: string) => void): void {
  let grid: PixelGrid | null = null;
  let fileName = '';

  const pickInput = input('file');
  pickInput.accept = 'image/*';
  pickInput.style.display = 'none';

  const fileLabel = el('div', 'field-hint', ['还没有选择图片']);
  const preview = el('canvas', 'pixel-preview');
  preview.width = 280;
  preview.height = 160;

  const colsInput = input('number', '32');
  colsInput.min = '8';
  colsInput.max = '64';
  colsInput.step = '1';

  const levelsSelect = select([
    { value: '2', label: '2 级（纯黑白）' },
    { value: '3', label: '3 级' },
    { value: '4', label: '4 级' },
  ]);
  levelsSelect.value = '3';

  const cellInput = input('number', '6');
  cellInput.min = '3';
  cellInput.max = '12';
  cellInput.step = '0.5';

  const styleSelect = select(STYLE_OPTIONS);
  const invertBox = input('checkbox');
  const info = el('div', 'field-hint', ['选择图片后会显示格数与预计实体数']);

  const generateBtn = button('生成模型', 'btn btn-accent', () => {
    if (!grid) {
      toast('请先选择图片', 'error');
      return;
    }
    const cell = clamp(Number(cellInput.value) || 6, 3, 12);
    const scad = gridToScad(grid, {
      cell,
      baseThickness: 2.4,
      style: styleSelect.value === '1' ? 1 : 0,
      layerHeight: 1.2,
      beadHeight: 4,
      cornerRadius: 3,
      source: `由图片「${fileName}」生成 · ${grid.cols}×${grid.rows} 像素`,
    });
    onGenerate(scad, `像素画 ${grid.cols}×${grid.rows} · ${fileName}`);
    dialog.close();
  });
  generateBtn.disabled = true;

  const body = el('div', 'drawer-body', [
    el('div', 'field-hint', [
      '图片会在浏览器里降采样成网格，再生成 OpenSCAD 源码。深色部分变成实体，浅色留白；线稿、剪影、logo 效果最好。',
    ]),
    el('div', 'pixel-row', [
      button('选择图片…', 'btn btn-sm', () => pickInput.click()),
      pickInput,
      fileLabel,
    ]),
    el('div', 'pixel-preview-wrap', [preview]),
    field('网格宽度（格）', colsInput, '列数越多细节越多，实体数也越多；建议 16~40'),
    field('色阶', levelsSelect, '浮雕模式下每一级高度递增；拼豆模式只区分有/无'),
    field('样式', styleSelect),
    field('格子尺寸（mm）', cellInput, '拼豆建议 5~6mm，浮雕 4~8mm'),
    field('反相', invertBox, '勾选后浅色变成实体（适合深底浅线的图）'),
    info,
    el('div', 'drawer-actions', [
      el('span', 'spacer'),
      button('取消', 'btn btn-ghost', () => dialog.close()),
      generateBtn,
    ]),
  ]);

  const dialog = drawer('从图片生成像素画', body, () => {}, { side: 'right', width: 440 });

  pickInput.addEventListener('change', () => {
    const file = pickInput.files?.[0];
    if (file) void load(file);
  });
  for (const control of [colsInput, levelsSelect, invertBox]) {
    control.addEventListener('change', refresh);
    control.addEventListener('input', refresh);
  }

  async function load(file: File): Promise<void> {
    try {
      fileName = file.name;
      const bitmap = await createImageBitmap(file);
      // 先缩到 512 以内，避免大图逐像素平均太慢
      const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法创建画布');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      lastSourceData = { width: data.width, height: data.height, data: data.data };
      grid = gridFromImage(lastSourceData, Number(colsInput.value) || 32, Number(levelsSelect.value) || 3, invertBox.checked);
      fileLabel.textContent = `${file.name} · ${canvas.width}×${canvas.height}px`;
      generateBtn.disabled = false;
      refresh();
    } catch (e) {
      grid = null;
      generateBtn.disabled = true;
      toast(e instanceof Error ? e.message : '图片读取失败', 'error');
    }
  }

  function refresh(): void {
    if (!grid) return;
    // 参数变了就重新降采样
    const source = lastSourceData;
    if (!source) return;
    grid = gridFromImage(source, Number(colsInput.value) || 32, Number(levelsSelect.value) || 3, invertBox.checked);
    drawPreview(grid);
    info.textContent = `${grid.cols} × ${grid.rows} 格 · 预计 ${countParts(grid)} 个实体（含底板）`;
  }

  let lastSourceData: Parameters<typeof gridFromImage>[0] | null = null;

  function drawPreview(g: PixelGrid): void {
    const ctx = preview.getContext('2d');
    if (!ctx) return;
    const pad = 2;
    const maxW = 280;
    const maxH = 180;
    const w = Math.max(1, Math.floor(Math.min(maxW / g.cols, maxH / g.rows)));
    preview.width = g.cols * w + pad * 2;
    preview.height = g.rows * w + pad * 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, preview.width, preview.height);
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const v = g.cells[r * g.cols + c]!;
        if (v === 0) continue;
        const shade = 40 + Math.round((v / 3) * 170);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(pad + c * w, pad + r * w, w, w);
      }
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
