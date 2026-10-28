/** OpenSCAD 日志分类：区分真正的错误和正常统计噪声。 */

import type { CompileMessage } from './types.js';

/**
 * 正常结束时的统计噪声（含 `Status: NoError`）。
 * 注意 `NoError` 里包含 "error" 子串，不能只做 includes('error')（traps #19）。
 */
const NOISE =
  /^(Geometries in cache|Geometry cache size|CGAL|Rendering|Total rendering time|Simple:|Vertices:|Halfedges:|Edges:|Halffacets:|Facets:|Volumes:|Two volumes will be joined|Volumes supported|PolySets? in cache|Status:\s*NoError)/i;

export function classifyLogs(lines: string[]): CompileMessage[] {
  const out: CompileMessage[] = [];
  for (const raw of lines) {
    const text = raw.trim();
    if (!text) continue;
    if (NOISE.test(text)) continue;

    let level: CompileMessage['level'] = 'info';
    if (/\berror\b|can't parse|\babort(ed)?\b/i.test(text)) level = 'error';
    else if (/\bwarning\b/i.test(text)) level = 'warn';
    else if (/^echo:/i.test(text)) level = 'info';

    const lineMatch = /(?:line|line:)\s*(\d+)/i.exec(text);
    out.push({
      level,
      text,
      line: lineMatch ? Number(lineMatch[1]) : undefined,
    });
  }
  return out;
}
