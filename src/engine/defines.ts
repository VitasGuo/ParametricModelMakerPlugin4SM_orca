/**
 * Customizer 参数 → OpenSCAD `-D` 覆盖参数。
 *
 * 独立网页不再把参数值写回源码，而是每次编译时用 -D 覆盖：
 * 源码保持原样，参数面板的值独立保存，批量变体也只需换一组 -D。
 *
 * 注意（traps #5）：`-D name=green` 会把 green 当变量名，字符串必须带引号；
 * 向量/表达式则必须原样传入。
 */

import type { ScadParam } from '../core/types.js';
import { parseCustomizer } from '../core/scad-parser.js';
import type { ParamValue, ParamValues } from './types.js';

/** 从源码解析出所有参数的默认值（含 [Hidden] 组）。 */
export function defaultParamValues(source: string): ParamValues {
  return valuesFromParams(parseCustomizer(source).params);
}

/** 参数列表 → 默认值字典。 */
export function valuesFromParams(params: ScadParam[]): ParamValues {
  const out: ParamValues = {};
  for (const p of params) out[p.name] = p.default;
  return out;
}

/**
 * 源码变化后合并参数值：
 * - 同名参数保留用户当前值（按新参数类型强制转换）
 * - 新参数用默认值
 * - 已删除的参数丢弃
 */
export function mergeParamValues(params: ScadParam[], previous: ParamValues): ParamValues {
  const out: ParamValues = {};
  for (const p of params) {
    const had = Object.prototype.hasOwnProperty.call(previous, p.name);
    out[p.name] = had ? coerceParamValue(p, previous[p.name]!) : p.default;
  }
  return out;
}

/** 按参数类型强制转换值（AI 返回的 JSON 可能是字符串）。 */
export function coerceParamValue(param: ScadParam, raw: ParamValue): ParamValue {
  if (param.type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : param.default;
  }
  if (param.type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }
  return String(raw);
}

/** 生成 `-D` 参数对（已扁平化，可直接展开进 callMain args）。 */
export function buildDefineArgs(params: ScadParam[], values: ParamValues): string[] {
  const args: string[] = [];
  for (const p of params) {
    if (!Object.prototype.hasOwnProperty.call(values, p.name)) continue;
    const value = values[p.name];
    if (value === undefined) continue;
    args.push('-D', `${p.name}=${serializeDefineValue(value, p)}`);
  }
  return args;
}

/** 把单个参数值序列化成 OpenSCAD 表达式。 */
export function serializeDefineValue(value: ParamValue, param?: ScadParam): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  const text = String(value);
  if (isQuoted(text)) return text;
  if (/^'/.test(text.trim())) return quote(stripSingleQuotes(text.trim()));

  const control = param?.control.kind;
  if (control === 'enum' || control === 'color' || control === 'font') {
    return quote(text);
  }
  if (param?.valueKind === 'vector' || param?.valueKind === 'expression') {
    return text;
  }
  if (param?.valueKind === 'string') {
    return quote(text);
  }
  // 老数据没有 valueKind：向量原样，其余按字符串处理
  if (/^\s*\[[\s\S]*\]\s*$/.test(text)) return text;
  return quote(text);
}

/** 只有双引号是 OpenSCAD 合法字符串；单引号不是引号，剥掉后重新加双引号。 */
function isQuoted(text: string): boolean {
  return /^"([^"\\]|\\.)*"$/.test(text);
}

/** 剥掉成对的单引号（OpenSCAD 不支持单引号字符串）。 */
function stripSingleQuotes(text: string): string {
  if (/^'([^'\\]|\\.)*'$/.test(text)) {
    return text.slice(1, -1).replace(/\\(['\\])/g, '$1');
  }
  return text;
}

function quote(text: string): string {
  return JSON.stringify(text);
}
