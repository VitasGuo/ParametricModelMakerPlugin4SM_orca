/**
 * .scad 源码 lint：写回编辑器前的确定性静态检查。
 *
 * 检查 Customizer 参数合法性（default 在范围内、$fn 隐藏、壁厚可打印）
 * 和明显语法问题（while）。返回 issue 列表，error 级别会触发 AI 重试。
 *
 * 独立网页和插件共用。
 */

import { parseCustomizer } from './scad-parser.js';

export interface LintIssue {
  level: 'error' | 'warn';
  message: string;
}

export function lintScad(source: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const { params, hiddenGroups } = parseCustomizer(source);

  // 1. 滑块参数：default 必须落在 [min, max] 内，min < max，step > 0
  for (const p of params) {
    if (p.control.kind !== 'slider') continue;
    const { min, max, step } = p.control;
    if (min >= max) {
      issues.push({ level: 'error', message: `参数 ${p.name} 的滑块范围无效：min(${min}) >= max(${max})，必须 min < max` });
      continue;
    }
    if (step !== undefined && step <= 0) {
      issues.push({ level: 'error', message: `参数 ${p.name} 的步长无效：step(${step}) <= 0` });
      continue;
    }
    if (p.type === 'number' && typeof p.default === 'number') {
      if (p.default < min || p.default > max) {
        issues.push({ level: 'error', message: `参数 ${p.name} 默认值 ${p.default} 超出滑块范围 [${min}, ${max}]，参数面板会显示异常` });
      }
    }
  }

  // 2. $fn 必须在 [Hidden] 组（否则参数索引错位，traps.md #8）
  if (/\$fn\s*=/.test(source)) {
    const fnHidden = params.some((p) => p.name === '$fn' && hiddenGroups.some((hg) => p.group.toLowerCase() === hg.toLowerCase()));
    if (!fnHidden) {
      issues.push({ level: 'error', message: '$fn 未放入 /* [Hidden] */ 组：会渲染成多余控件，参数面板会显示技术参数' });
    }
  }

  // 3. while 循环（OpenSCAD 不支持）
  if (/while\s*\(/.test(source)) {
    issues.push({ level: 'error', message: '检测到 while 循环：OpenSCAD 不支持 while，必须用 for 或递归函数重写' });
  }

  // 4. 壁厚类参数过薄（不可打印）；间隙/公差类参数不适用
  for (const p of params) {
    if (!/thickness|wall/i.test(p.name)) continue;
    if (/clearance|gap|tolerance|fit/i.test(p.name)) continue;
    if (p.type === 'number' && typeof p.default === 'number' && p.default > 0 && p.default < 0.8) {
      issues.push({ level: 'warn', message: `参数 ${p.name} 默认值 ${p.default}mm 过薄（<0.8mm），FDM 打印难以成型` });
    }
  }

  // 5. 顶层变量重复赋值（last-wins 警告）
  const topLevel = new Map<string, number>();
  let depth = 0;
  let inBlockComment = false;
  for (const line of source.split('\n')) {
    const code = line.replace(/\/\/.*$/, '');
    if (inBlockComment) {
      if (code.includes('*/')) inBlockComment = false;
      continue;
    }
    if (code.trim().startsWith('/*')) {
      if (!code.includes('*/')) inBlockComment = true;
      continue;
    }
    for (const ch of code) {
      if (ch === '{' || ch === '(') depth++;
      else if (ch === '}' || ch === ')') depth--;
    }
    if (depth === 0) {
      const m = /^\s*([A-Za-z_$][\w$]*)\s*=[^=]/.exec(code);
      if (m && !m[1]!.startsWith('$')) {
        topLevel.set(m[1]!, (topLevel.get(m[1]!) ?? 0) + 1);
      }
    }
  }
  for (const [name, count] of topLevel) {
    if (count > 1) issues.push({ level: 'warn', message: `顶层变量 ${name} 赋值了 ${count} 次：OpenSCAD 变量不可变，last-wins，建议改名` });
  }

  return issues;
}
