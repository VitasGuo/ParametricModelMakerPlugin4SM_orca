/**
 * AI 对话 + 真实引擎验证闭环。
 *
 * 与插件的区别：
 *  - 不做自动重试，失败结果照常返回并附 rerollContext（用户点"重抽"）
 *  - 验证用 OpenSCAD WASM 真实编译（lint → 编译 → 空模型/尺寸检查 → 几何审核）
 *  - 几何审核把三视图直接发给支持图片输入的主模型；纯文本模型退化为网格摘要 + 设计计划
 */

import type { AiAction, AiRequest, AiResponse } from '../core/types.js';
import { buildSystemPrompt, buildUserContext, parseAiOutput } from '../core/prompts.js';
import { lintScad } from '../core/lint.js';
import { parseCustomizer } from '../core/scad-parser.js';
import { mergeParamValues } from '../engine/defines.js';
import type { ParamValues } from '../engine/types.js';
import { callProvider, isMultimodal, type WebModelConfig } from './providers.js';
import type { VerifyOutcome } from './verify.js';

const SYSTEM_PROMPT = buildSystemPrompt();

export type VerifyFn = (source: string, values: ParamValues) => Promise<VerifyOutcome>;

export async function chat(request: AiRequest, cfg: WebModelConfig, verify: VerifyFn): Promise<AiResponse> {
  const system = SYSTEM_PROMPT;
  let userText = buildUserContext(request.userMessage, request.state);
  const screenshot = request.state.previewScreenshot;
  const passImageToMain = !!screenshot && isMultimodal(cfg);
  if (!passImageToMain) {
    userText = userText.replace(
      '【模型预览截图已随消息附上，请结合视觉判断】',
      screenshot
        ? '【当前模型不支持图片输入，请根据源码、参数与设计计划判断】'
        : '【当前没有可用的预览截图，请根据源码、参数与设计计划判断】'
    );
  }
  const isGenerative = request.state.scadSource.trim().length === 0;
  const temperature = isGenerative ? 0.7 : 0.3;

  let history = request.history.slice(-10);
  if (request.rerollContext) {
    history = [
      ...history,
      { role: 'assistant', content: request.rerollContext.previousRaw.slice(0, 4000) },
      { role: 'user', content: buildRerollFeedback(request.rerollContext) },
    ];
  }

  const raw = (
    await callProvider(cfg, system, userText, passImageToMain ? screenshot : '', temperature, history)
  ).text;

  return generateOnce(cfg, request.userMessage, raw, verify, request.state.paramValues);
}

async function generateOnce(
  cfg: WebModelConfig,
  userMessage: string,
  raw: string,
  verify: VerifyFn,
  currentValues: ParamValues
): Promise<AiResponse> {
  let parsed: { action: AiAction; narration: string } | null = null;
  try {
    parsed = parseAiOutput(raw);
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return {
      narration: '',
      raw,
      error: `AI 输出无法解析为合法 JSON（可能混入了多余文本或被截断）。输出开头：${raw.slice(0, 120)}`,
      rerollContext: {
        userMessage,
        problems: [
          '输出不是合法 JSON（可能混入了多余文本或被截断）。请只输出一个 JSON 对象，scad 代码保持精简，不要任何 JSON 以外的文字',
        ],
        slices: '',
        previousRaw: raw,
      },
    };
  }

  if (parsed.action.type !== 'replaceSource') {
    return { action: parsed.action, narration: parsed.narration, raw };
  }

  const action = parsed.action;
  const lintErrors = lintScad(action.scad)
    .filter((i) => i.level === 'error')
    .map((i) => `[静态检查] ${i.message}`);

  const values = mergeParamValues(parseCustomizer(action.scad).params, currentValues);

  let outcome: VerifyOutcome;
  try {
    outcome = await verify(action.scad, values);
  } catch (e) {
    outcome = {
      ok: false,
      empty: false,
      problems: [`[验证] ${e instanceof Error ? e.message : String(e)}`],
      notes: [],
      screenshot: '',
      summaryText: '',
    };
  }

  const problems = [...lintErrors, ...outcome.problems];

  if (problems.length === 0) {
    const review = await reviewDesign(cfg, userMessage, action, outcome);
    if (review.pass) {
      return {
        action,
        narration: parsed.narration,
        raw,
        verification: { status: 'passed', notes: [...outcome.notes, review.reason] },
      };
    }
    problems.push(`[审核] ${review.reason}`);
  }

  return {
    action,
    narration: parsed.narration,
    raw,
    verification: { status: 'failed', notes: problems },
    rerollContext: {
      userMessage,
      problems,
      slices: outcome.summaryText,
      previousRaw: raw,
    },
  };
}

async function reviewDesign(
  cfg: WebModelConfig,
  userMessage: string,
  action: Extract<AiAction, { type: 'replaceSource' }>,
  outcome: VerifyOutcome
): Promise<{ pass: boolean; reason: string }> {
  const sys =
    '你是 3D 打印模型的几何审核员。根据用户需求、设计计划、真实编译结果与模型三视图，判断几何形状是否与需求相符。只输出严格 JSON：{"verdict":"pass"|"fail","reason":"一句话中文结论"}';

  const passImage = !!outcome.screenshot && isMultimodal(cfg);

  const user = [
    `用户需求：${userMessage}`,
    '',
    `AI 的设计计划：${action.design_plan ?? '（未提供）'}`,
    '',
    `真实引擎验证结果：${outcome.summaryText || '（无网格摘要）'}`,
    '',
    '本地自动疑点：',
    outcome.notes.length ? outcome.notes.map((n) => `- ${n}`).join('\n') : '- 无',
    '',
    passImage ? '模型三视图已随消息附上。' : '（没有视觉信息，只能根据几何摘要与设计计划判断）',
    '',
    '请判断几何轮廓（形状类型 / 开口性 / 比例）是否与需求相符。表面光滑度、美观度不算 fail。碗/盒/杯类容器口部必须开口。',
  ].join('\n');

  try {
    const raw = (
      await callProvider(cfg, sys, user, passImage ? outcome.screenshot : '', 0.1, [])
    ).text;
    const match = /\{[\s\S]*\}/.exec(raw);
    const obj = match ? (JSON.parse(match[0]) as { verdict?: string; reason?: string }) : null;
    if (!obj || (obj.verdict !== 'pass' && obj.verdict !== 'fail')) {
      return { pass: true, reason: '（审核输出无法解析，视为通过）' };
    }
    return { pass: obj.verdict === 'pass', reason: obj.reason ?? '' };
  } catch {
    return { pass: true, reason: '（审核调用失败，视为通过）' };
  }
}

function buildRerollFeedback(ctx: NonNullable<AiResponse['rerollContext']>): string {
  const lines = [
    '【真实引擎验证：你上一轮生成的代码有问题，用户已要求重抽，必须修复后重新生成】',
    '',
    ...ctx.problems.map((p) => `- ${p}`),
  ];
  if (ctx.slices) {
    lines.push('', '你代码的真实网格摘要：', ctx.slices);
  }
  lines.push('', `用户原始需求不变："${ctx.userMessage}"。请修复后重新输出完整 JSON（design_plan / self_check 与修复后的代码保持一致）。`);
  return lines.join('\n');
}
