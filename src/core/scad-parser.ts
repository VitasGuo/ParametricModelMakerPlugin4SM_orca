/**
 * OpenSCAD Customizer 注释解析器（权威源）。
 *
 * 纯函数模块：字符串进、结构出。不依赖 DOM、不依赖 chrome API。
 * 可在 Node 单测，未来也能复用到独立编辑器路线。
 *
 * ## 支持的语法（参考 Bambu MakerLab 官方 Customizer 协议 + 实测）
 *
 * 分组注释（创建标签页）：
 *   /* [Box Dimensions] *​/        → 后续参数归入 "Box Dimensions" 组
 *   /* [Hidden] *​/                → 后续参数标记为隐藏
 *
 * 参数描述（两种写法均支持）：
 *   // 行前注释：写在参数声明的上一行，显示为参数描述
 *   // 行尾注释：写在参数声明行尾，方括号外部分为描述
 *
 * 参数声明（必须在顶层，即大括号深度 0）：
 *   width  = 100;                 // [10:200]          slider (min:max)
 *   width  = 100;                 // [10:5:200]        slider (min:step:max)
 *   color  = "red";               // [red,green,blue]  enum (string)
 *   count  = 4;                   // [0,2,4,8]         enum (number)
 *   size   = 10;                  // [10:S,20:M,30:L]  带标签的 enum
 *   flag   = true;                                   // checkbox
 *   name   = "box";                                  // plain text
 *   vec    = [1, 2, 3];           // [0:1:255]         vector slider
 *   colorHex = "#FF0000";         // color             颜色选择器
 *   font   = "Arial";             // font              字体选择器
 *
 * 特殊变量（$fn / $fa / $fs）也按参数处理。
 *
 * 文件参数（value 为 "default.png" / "default.svg" / "default.stl"）。
 */

import type { ParamControl, ScadCustomization, ScadParam } from './types.js';

/** 匹配分组注释 `/* [Name] *​/`（允许中间任意空格）。 */
const GROUP_RE = /\/\*\s*\[([^\]]+)\]\s*\*\//;

/**
 * 匹配顶层变量声明行：`name = value; // optional comment`
 * 捕获组：1=name, 2=value(原始), 3=行尾注释(可选)
 */
const ASSIGN_RE = /^\s*(\$?\w+)\s*=\s*([^;]+);\s*(?:\/\/\s*(.*))?\s*$/;

/** 行尾特殊标记（color/font 等，出现在 // 注释末尾，独立于方括号控件）。 */
const SPECIAL_TAG_RE = /\b(color|font)\b\s*$/i;

/** 判断字符是否为大小括号的开/闭，用于跟踪作用域深度。 */
function braceDepthDelta(ch: string): number {
  switch (ch) {
    case '{':
    case '(':
    case '[':
      return 1;
    case '}':
    case ')':
    case ']':
      return -1;
    default:
      return 0;
  }
}

/** 解析变量值字面量，推断类型与字面量种类。 */
function parseValue(raw: string): {
  value: string | number | boolean;
  type: 'number' | 'string' | 'boolean';
  kind: 'number' | 'string' | 'boolean' | 'vector' | 'expression';
} | null {
  const trimmed = raw.trim();
  // 布尔
  if (trimmed === 'true' || trimmed === 'false') {
    return { value: trimmed === 'true', type: 'boolean', kind: 'boolean' };
  }
  // 字符串字面量 "..." 或 '...'
  const strMatch = /^"([^"]*)"$|^'([^']*)'$/.exec(trimmed);
  if (strMatch) {
    return { value: strMatch[1] ?? strMatch[2] ?? '', type: 'string', kind: 'string' };
  }
  // 数字（含负数、小数、科学计数）
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isNaN(n)) return { value: n, type: 'number', kind: 'number' };
  }
  // 向量 [1, 2, 3] / 表达式（如 2*PI）保留原始文本，类型仍记为 string
  return {
    value: trimmed,
    type: 'string',
    kind: trimmed.startsWith('[') ? 'vector' : 'expression',
  };
}

/** 从行尾注释里分离出控件定义 `[...]`、特殊标记（color/font）与描述文案。 */
function splitComment(comment: string): { bracket: string | null; description: string; special?: 'color' | 'font' } {
  const trimmed = comment.trim();
  // 检测 color/font 特殊标记
  const tagMatch = SPECIAL_TAG_RE.exec(trimmed);
  let special: 'color' | 'font' | undefined;
  let rest = trimmed;
  if (tagMatch) {
    special = tagMatch[1]!.toLowerCase() as 'color' | 'font';
    rest = trimmed.slice(0, tagMatch.index).trim();
  }
  // 方括号控件
  const match = /^\[([^\]]*)\]\s*(.*)$/.exec(rest);
  if (match) {
    return { bracket: match[1] ?? null, description: (match[2] ?? '').trim(), special };
  }
  return { bracket: null, description: rest, special };
}

/** 把方括号内容解析成控件描述。 */
function parseControl(bracket: string | null, type: 'number' | 'string' | 'boolean', special?: 'color' | 'font'): ParamControl {
  // color/font 特殊标记优先
  if (special === 'color') return { kind: 'color' };
  if (special === 'font') return { kind: 'font' };

  if (bracket === null) {
    return type === 'boolean' ? { kind: 'checkbox' } : { kind: 'plain' };
  }
  // 数值范围 [min:max] 或 [min:step:max]
  const numericParts = bracket.split(':').map((s) => s.trim());
  if (numericParts.length === 2 || numericParts.length === 3) {
    const nums = numericParts.map(Number);
    if (nums.every((n) => !Number.isNaN(n))) {
      if (nums.length === 2) {
        return { kind: 'slider', min: nums[0]!, max: nums[1]! };
      }
      return { kind: 'slider', min: nums[0]!, max: nums[2]!, step: nums[1]! };
    }
  }
  // 枚举 [a,b,c] 或带标签 [value:label, value:label]
  const opts = bracket.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  if (opts.length > 0) {
    // 检测带标签格式 value:label
    const labeled = opts.every((s) => /^[^:]+:.+$/.test(s));
    if (labeled) {
      // 提取值部分，判断是数字还是字符串
      const values = opts.map((s) => s.split(':')[0]!.trim());
      const allNum = values.every((s) => /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s));
      if (allNum && type === 'number') {
        return { kind: 'enumNum', options: values.map(Number) };
      }
      return { kind: 'enum', options: values };
    }
    // 无标签
    const allNum = opts.every((s) => /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s));
    if (allNum && type === 'number') {
      return { kind: 'enumNum', options: opts.map(Number) };
    }
    return { kind: 'enum', options: opts };
  }
  return type === 'boolean' ? { kind: 'checkbox' } : { kind: 'plain' };
}

/**
 * 解析 .scad 源码，提取 Customizer 参数。
 *
 * 算法：逐行扫描，跟踪括号深度，只在深度 0 时识别分组注释与变量声明。
 * 维护"当前分组"指针；遇到 `[Hidden]` 分组时记录到 hiddenGroups。
 * 支持 makerlab 的行前注释描述（参数声明上一行 // 注释 → description）。
 */
export function parseCustomizer(source: string): ScadCustomization {
  const lines = source.split(/\r?\n/);
  const params: ScadParam[] = [];
  const hiddenGroups: string[] = [];

  let depth = 0;
  let currentGroup = 'Parameters';
  let inBlockComment = false;
  /** 待挂载到下一个参数声明上的行前描述。 */
  let pendingDesc: string | null = null;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;

    // 块注释跨行处理
    if (inBlockComment) {
      const close = line.indexOf('*/');
      if (close === -1) continue;
      inBlockComment = false;
      // 闭后的剩余部分继续处理
      const after = line.slice(close + 2);
      if (after.trim()) {
        // 简化：闭后同行有内容时，按新行处理（递归一次即可）
        lines[li] = after;
      } else {
        continue;
      }
    }

    // 分组注释（单行内的 /* [Name] */）
    const groupMatch = GROUP_RE.exec(line);
    if (groupMatch) {
      currentGroup = groupMatch[1]!.trim();
      if (currentGroup.toLowerCase() === 'hidden') {
        hiddenGroups.push('Hidden');
      }
      pendingDesc = null; // 分组注释清除待挂载描述
      continue;
    }

    // 跟踪块注释开启（/* ... */ 跨行）
    const codeForDepth = stripLineComment(line);
    // 检测块注释开启
    const blockOpen = codeForDepth.indexOf('/*');
    if (blockOpen !== -1 && codeForDepth.indexOf('*/', blockOpen) === -1) {
      // 同行有 /* 但无 */，开启跨行块注释
      inBlockComment = true;
      // 仍需处理 /* 之前部分的深度
      const before = codeForDepth.slice(0, blockOpen);
      for (const ch of before) depth += braceDepthDelta(ch);
      continue;
    }

    // 去除块注释内容（单行内的 /* ... */）再算深度
    const codeNoBlock = codeForDepth.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const ch of codeNoBlock) {
      depth += braceDepthDelta(ch);
    }

    // 行前注释：纯注释行（// 开头，去掉空格），记录为 pendingDesc
    const commentOnly = /^\s*\/\/\s*(.*)$/.exec(line);
    if (commentOnly && depth <= 0) {
      const desc = commentOnly[1]!.trim();
      if (desc) {
        pendingDesc = pendingDesc ? `${pendingDesc} ${desc}` : desc;
      }
      continue;
    }

    // 只在深度 0（顶层）收集变量
    const assignMatch = ASSIGN_RE.exec(line);
    if (assignMatch && depth <= 0) {
      const [, name = '', valueRaw = '', comment = ''] = assignMatch;
      const parsed = parseValue(valueRaw);
      if (parsed) {
        const { bracket, description, special } = splitComment(comment);
        const control = parseControl(bracket, parsed.type, special);
        // 描述优先级：行尾描述 > 行前注释描述
        const desc = description || pendingDesc || undefined;
        params.push({
          name,
          default: parsed.value,
          type: parsed.type,
          valueKind: parsed.kind,
          control,
          group: currentGroup,
          description: desc,
        });
      }
      pendingDesc = null; // 消费掉
    } else if (assignMatch === null && line.trim() && !line.trim().startsWith('//')) {
      // 非空、非注释、非声明的行 → 清除待挂载描述（如模块定义等）
      pendingDesc = null;
    }

    if (depth < 0) depth = 0; // 容错
  }

  return { params, hiddenGroups: dedupe(hiddenGroups) };
}

/** 去除行内 `//` 注释（不处理块注释）。 */
function stripLineComment(line: string): string {
  // 简单处理：不处理字符串内的 //（OpenSCAD 字符串里 // 少见）
  const idx = line.indexOf('//');
  return idx === -1 ? line : line.slice(0, idx);
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

/**
 * 把一组参数值注入到 .scad 源码中。
 *
 * 策略：在源码末尾追加同名变量赋值。
 * OpenSCAD 语义里后定义的变量会覆盖先定义的（last-wins 警告但生效），
 * 所以把用户当前值放在源码最后面，原文件的默认值会被覆盖。
 *
 * 仅在需要"完整替换源码"时使用；调参场景优先用 injector 的 updateParams。
 */
export function injectParams(source: string, values: Record<string, string | number | boolean>): string {
  const footer = Object.entries(values)
    .map(([k, v]) => `${k} = ${formatValue(v)};`)
    .join('\n');
  return `${source}\n\n// === Model Lab injected params (last-wins overrides) ===\n${footer}\n`;
}

/** 格式化值为 OpenSCAD 字面量。 */
export function formatValue(v: string | number | boolean): string {
  if (typeof v === 'string') return `"${v.replace(/"/g, '\\"')}"`;
  return String(v);
}
