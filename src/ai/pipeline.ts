/**
 * AI 对话 + 真实引擎验证闭环。
 *
 * 与插件的区别：
 *  - 验证用 OpenSCAD WASM 真实编译（lint → 编译 → 空模型/尺寸 → 网格结构审计 → 特征核验）
 *  - 机械性失败（JSON 不可解析 / 静态检查 / 编译 / 几何 / 结构 / 尺寸核验）自动带着实测值
 *    重抽，最多 2 轮修复；只有形状审核（视觉判断）失败才交回用户手动重抽
 *  - 几何审核把三视图直接发给支持图片输入的主模型；纯文本模型退化为网格摘要 + 设计计划
 */

import type { AiAction, AiRequest, AiResponse, ChatMessage } from '../core/types.js';
import { buildSystemPrompt, buildUserContext, parseAiOutput } from '../core/prompts.js';
import { normalizePartSpecs, type PartCheck } from '../core/part-spec.js';
import { lintScad } from '../core/lint.js';
import { parseCustomizer } from '../core/scad-parser.js';
import { mergeParamValues } from '../engine/defines.js';
import type { ParamValues } from '../engine/types.js';
import { logger } from '../core/logger.js';
import { callProvider, isMultimodal, type WebModelConfig } from './providers.js';
import type { VerifyOutcome } from './verify.js';

const SYSTEM_PROMPT = buildSystemPrompt();

/** 机械性失败自动修复的最多轮数（不含首轮生成）。 */
const MAX_AUTO_REPAIR_ROUNDS = 2;

/** 重抽/修复时回灌给模型的上一版源码上限（截断过短会丢掉真正要修的那段）。 */
const REPAIR_SOURCE_CAP = 12_000;

export type VerifyFn = (
  source: string,
  values: ParamValues,
  partSpec?: PartCheck[]
) => Promise<VerifyOutcome>;

export async function chat(request: AiRequest, cfg: WebModelConfig, verify: VerifyFn): Promise<AiResponse> {
  const system = SYSTEM_PROMPT;
  let userText = buildUserContext(request.userMessage, request.state);
  const screenshot = request.state.previewScreenshot;
  const userImages = request.images ?? [];
  const canSeeImages = isMultimodal(cfg);
  const passImageToMain = !!screenshot && canSeeImages;

  if (!passImageToMain) {
    userText = userText.replace(
      '【模型预览截图已随消息附上，请结合视觉判断】',
      screenshot
        ? '【当前模型不支持图片输入，请根据源码、参数与设计计划判断】'
        : '【当前没有可用的预览截图，请根据源码、参数与设计计划判断】'
    );
  }

  if (userImages.length > 0) {
    userText += canSeeImages
      ? `\n\n【附件】用户本轮上传了 ${userImages.length} 张参考图（照片 / 草图 / 截图）。` +
        '把其中的轮廓、比例、结构特征当作形状参考，不必逐像素复刻；' +
        '图片只是视觉输入，不能当作可 import 的外部文件。'
      : `\n\n【附件】用户本轮上传了 ${userImages.length} 张参考图，但当前模型不支持图片输入。` +
        '不要假装看到了图片：按文字描述生成，并在 narration 里提醒用户换用支持视觉的模型' +
        '（Claude / GPT-4o / GLM-4V / SenseNova 6.8 等），或改用「文件 → 从图片生成像素画」。';
  }

  const isGenerative = request.state.scadSource.trim().length === 0;
  const temperature = isGenerative ? 0.7 : 0.3;

  let history = request.history.slice(-10);
  if (request.rerollContext) {
    history = [
      ...history,
      { role: 'assistant', content: request.rerollContext.previousRaw.slice(0, REPAIR_SOURCE_CAP) },
      { role: 'user', content: buildRerollFeedback(request.rerollContext) },
    ];
  }

  // 用户附件在前、当前模型预览在后，模型能区分"参考图"和"我生成的预览"
  const imagesToSend = canSeeImages
    ? [...userImages, ...(passImageToMain ? [screenshot] : [])]
    : [];

  const raw = (await callProvider(cfg, system, userText, imagesToSend, temperature, history)).text;

  return generateOnce(
    cfg,
    { system, userText, images: imagesToSend, temperature, history },
    request.userMessage,
    raw,
    verify,
    request.state.paramValues
  );
}

interface RepairContext {
  system: string;
  userText: string;
  images: string[];
  temperature: number;
  history: ChatMessage[];
}

async function generateOnce(
  cfg: WebModelConfig,
  ctx: RepairContext,
  userMessage: string,
  firstRaw: string,
  verify: VerifyFn,
  currentValues: ParamValues
): Promise<AiResponse> {
  let raw = firstRaw;
  let repaired = 0;

  for (;;) {
    let parsed: { action: AiAction; narration: string } | null = null;
    try {
      parsed = parseAiOutput(raw);
    } catch {
      parsed = null;
    }

    if (!parsed) {
      const problems = [
        '输出不是合法 JSON（可能混入了多余文本或被截断）。请只输出一个 JSON 对象，scad 代码保持精简，不要任何 JSON 以外的文字',
      ];
      const retried = await repair(cfg, ctx, userMessage, raw, problems, '', repaired);
      if (retried) {
        raw = retried;
        repaired += 1;
        continue;
      }
      return {
        narration: '',
        raw,
        error: `AI 输出无法解析为合法 JSON（可能混入了多余文本或被截断）。输出开头：${raw.slice(0, 120)}`,
        rerollContext: { userMessage, problems, slices: '', previousRaw: raw },
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
    const specs = normalizePartSpecs(action.part_spec);

    let outcome: VerifyOutcome;
    try {
      outcome = await verify(action.scad, values, specs);
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

    let problems = [...lintErrors, ...outcome.problems];

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
      // 形状审核有明确理由（缺特征/轮廓不符），与机械失败一样带理由重抽修复
      problems = [`[审核] ${review.reason}`];
    }

    const retried = await repair(cfg, ctx, userMessage, raw, problems, outcome.summaryText, repaired);
    if (retried) {
      raw = retried;
      repaired += 1;
      continue;
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
}

/** 机械性失败时带着实测问题自动重抽一轮；超轮数或调用失败时返回 null。 */
async function repair(
  cfg: WebModelConfig,
  ctx: RepairContext,
  userMessage: string,
  previousRaw: string,
  problems: string[],
  slices: string,
  repairedRounds: number
): Promise<string | null> {
  if (repairedRounds >= MAX_AUTO_REPAIR_ROUNDS) return null;
  logger.info(
    'ai',
    `第 ${repairedRounds + 1}/${MAX_AUTO_REPAIR_ROUNDS} 轮自动修复`,
    problems.slice(0, 3).join('；')
  );
  const feedback = buildRerollFeedback({ userMessage, problems, slices, previousRaw });
  const history: ChatMessage[] = [
    ...ctx.history,
    { role: 'assistant', content: previousRaw.slice(0, REPAIR_SOURCE_CAP) },
    { role: 'user', content: feedback },
  ];
  try {
    const out = await callProvider(cfg, ctx.system, ctx.userText, ctx.images, ctx.temperature, history);
    return out.text;
  } catch {
    return null; // 修复调用失败就交回用户，不掩盖原始问题
  }
}

async function reviewDesign(
  cfg: WebModelConfig,
  userMessage: string,
  action: Extract<AiAction, { type: 'replaceSource' }>,
  outcome: VerifyOutcome
): Promise<{ pass: boolean; reason: string }> {
  const sys =
    '你是 3D 打印模型的几何审核员。任务：①从用户需求里列出点名的全部特征；②对照设计计划与模型三视图逐项核对，每个特征是否真的做出来了（格子数、分腔数、镂空、层次数、退台这类可数特征要数出来）；③整体轮廓与比例是否与需求相符。有一项特征缺失或轮廓明显不符就判 fail。只输出严格 JSON：{"verdict":"pass"|"fail","reason":"一句话中文结论（fail 时引用缺失的特征名或比例数字）"}';

  const passImage = !!outcome.screenshot && isMultimodal(cfg);

  const user = [
    `用户需求：${userMessage}`,
    '',
    `AI 的设计计划（含特征清单）：${action.design_plan ?? '（未提供）'}`,
    '',
    `真实引擎验证结果：${outcome.summaryText || '（无网格摘要）'}`,
    '',
    '本地自动疑点：',
    outcome.notes.length ? outcome.notes.map((n) => `- ${n}`).join('\n') : '- 无',
    '',
    passImage ? '模型三视图已随消息附上。' : '（没有视觉信息，只能根据设计计划与几何摘要核验自洽性；无法确认的特征判 fail）',
    '',
    '典型 fail："多格收纳盒"只有单腔、"体素哈利法塔"做成中式楼阁塔、点名要的把手/镂空/磁铁槽没有做。',
    '表面光滑度、美观度不算 fail；碗/盒/杯类容器口部必须开口。',
  ].join('\n');

  try {
    const raw = (
      await callProvider(cfg, sys, user, passImage ? [outcome.screenshot] : [], 0.1, [])
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
    '【真实引擎验证 / 形状审核：你上一轮生成的代码有问题，必须修复后重新生成】',
    '',
    ...ctx.problems.map((p) => `- ${p}`),
  ];
  if (ctx.slices) {
    lines.push('', '你代码的真实网格摘要：', ctx.slices);
  }
  lines.push('', `用户原始需求不变："${ctx.userMessage}"。请修复后重新输出完整 JSON（design_plan / self_check 与修复后的代码保持一致）。`);
  return lines.join('\n');
}