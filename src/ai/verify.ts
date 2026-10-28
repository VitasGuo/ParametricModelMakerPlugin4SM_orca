/**
 * 用真实 OpenSCAD WASM 引擎验证 AI 生成的源码。
 *
 * 和插件的 scad-eval 近似求值不同：这里以编译 exit code、空模型检测、
 * 网格 bbox/体积为准，并用离屏三视图截图供视觉模型审核。
 */

import { compile } from '../engine/compiler.js';
import type { CompileResult, MeshSummary, ParamValues } from '../engine/types.js';
import { getCjkFont } from '../storage/fonts.js';
import { renderContactSheet } from '../viewer/headless.js';

export interface VerifyOutcome {
  /** 编译成功且非空。 */
  ok: boolean;
  empty: boolean;
  summary?: MeshSummary;
  /** 硬性问题（会触发重抽）。 */
  problems: string[];
  /** 供 UI/AI 参考的警告与摘要。 */
  notes: string[];
  /** ISO/FRONT/TOP 三视图拼图（dataURL，失败为空串）。 */
  screenshot: string;
  /** 网格摘要文本，用于重抽上下文。 */
  summaryText: string;
}

export async function verifyScad(
  source: string,
  values: ParamValues,
  options: { timeoutMs?: number; screenshot?: boolean } = {}
): Promise<VerifyOutcome> {
  const font = getCjkFont();
  const result = await compile({
    source,
    defines: values,
    format: 'stl',
    timeoutMs: options.timeoutMs ?? 20_000,
    fonts: font ? [{ name: font.name, data: font.data }] : undefined,
  });

  return outcomeFromCompile(result, options.screenshot !== false);
}

export function outcomeFromCompile(result: CompileResult, withScreenshot: boolean): VerifyOutcome {
  const problems: string[] = [];
  const notes: string[] = [];
  const summaryText = result.summary ? formatSummary(result.summary) : '';

  for (const message of result.messages) {
    if (message.level === 'error') {
      problems.push(`[编译] ${message.line ? `第 ${message.line} 行：` : ''}${cleanMessage(message.text)}`);
    } else if (message.level === 'warn') {
      notes.push(`[警告] ${cleanMessage(message.text)}`);
    }
  }

  if (!result.ok) {
    if (result.empty && problems.length === 0) problems.push('[几何] 模型为空：编译没有产生任何几何体');
    if (!result.empty && problems.length === 0) problems.push('[编译] 编译失败（exit != 0）');
  }

  if (result.summary) {
    const [x = 0, y = 0, z = 0] = result.summary.size;
    const maxDim = Math.max(x, y, z);
    const minDim = Math.min(x, y, z);
    if (maxDim > 2000) problems.push(`[几何] 尺寸异常：最大边 ${maxDim.toFixed(1)}mm > 2000mm`);
    if (minDim > 0 && minDim < 0.5) problems.push(`[几何] 尺寸异常：最小边 ${minDim.toFixed(2)}mm < 0.5mm`);
    if (result.summary.volumeMm3 <= 0.001) problems.push('[几何] 体积为 0：模型可能是退化面片');
  }

  if (summaryText) notes.push(`[网格] ${summaryText}`);

  const screenshot =
    withScreenshot && result.ok && result.output ? renderContactSheet(result.output) : '';

  return {
    ok: result.ok && problems.length === 0,
    empty: result.empty,
    summary: result.summary,
    problems,
    notes,
    screenshot,
    summaryText,
  };
}

export function formatSummary(summary: MeshSummary): string {
  const [x = 0, y = 0, z = 0] = summary.size;
  return [
    `三角形 ${summary.triangles} 个`,
    `尺寸 ${x.toFixed(1)} × ${y.toFixed(1)} × ${z.toFixed(1)} mm`,
    `体积 ${(summary.volumeMm3 / 1000).toFixed(2)} cm³`,
    `包围盒 X[${summary.bbox.min[0].toFixed(1)}, ${summary.bbox.max[0].toFixed(1)}] ` +
      `Y[${summary.bbox.min[1].toFixed(1)}, ${summary.bbox.max[1].toFixed(1)}] ` +
      `Z[${summary.bbox.min[2].toFixed(1)}, ${summary.bbox.max[2].toFixed(1)}]`,
  ].join('；');
}

/** 去掉 OpenSCAD stderr 前缀，保留可读内容。 */
export function cleanMessage(text: string): string {
  return text
    .replace(/^ERROR:\s*/i, '')
    .replace(/^WARNING:\s*/i, '')
    .replace(/^ERR\s*/i, '')
    .trim();
}
