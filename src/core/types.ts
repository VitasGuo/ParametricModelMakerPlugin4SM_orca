/**
 * 全局类型定义。
 *
 * 设计原则：消息载荷用纯数据结构，不携带函数、不依赖 chrome API，
 * 便于在 Node 环境单测、在 Side Panel / Background / Content Script 三端共享。
 */

import type { PartCheck } from './part-spec.js';

/** Customizer 参数的 UI 控件类型，对应 OpenSCAD 行尾注释语法。 */
export type ParamControl =
  | { kind: 'slider'; min: number; max: number; step?: number }
  | { kind: 'enum'; options: string[] }
  | { kind: 'enumNum'; options: number[] }
  | { kind: 'checkbox' }
  | { kind: 'plain' }
  | { kind: 'color' }
  | { kind: 'font' };

/** 从 .scad 注释解析出来的单个可调参数。 */
export interface ScadParam {
  /** 变量名，如 `length`。 */
  name: string;
  /** 默认值（从变量声明解析）。 */
  default: string | number | boolean;
  /** 推断出的值类型。 */
  type: 'number' | 'string' | 'boolean';
  /**
   * 字面量种类：用于 -D 覆盖时区分"字符串"与"向量/表达式"。
   * 例如 `color = "red"` 是 string（需加引号），`vec = [1,2,3]` 是 vector（原样）。
   */
  valueKind?: 'number' | 'string' | 'boolean' | 'vector' | 'expression';
  /** UI 控件描述。 */
  control: ParamControl;
  /** 所属分组（来自最近的 `/* [Group] *​/` 注释）。 */
  group: string;
  /** 行尾描述文案（注释 `// ...` 中括号外的部分）。 */
  description?: string;
}

/** Customizer 解析结果。 */
export interface ScadCustomization {
  params: ScadParam[];
  /** 隐藏分组里的参数名集合。 */
  hiddenGroups: string[];
}

/** 编辑器当前状态快照，由 Content Script 采集。 */
export interface EditorState {
  /** 当前 .scad 源码（可能从 DOM/React state/网络拦截获取）。 */
  scadSource: string;
  /** 当前参数值（变量名 → 值）。 */
  paramValues: Record<string, string | number | boolean>;
  /** 3D 预览截图，dataURL（image/png）。空字符串表示截图失败。 */
  previewScreenshot: string;
  /** 采集时间戳。 */
  capturedAt: number;
}

/** AI 返回的动作意图。AI 根据 userMessage + state 自行决定 type。 */
export type AiAction =
  | { type: 'updateParams'; values: Record<string, string | number | boolean> }
  | {
      type: 'replaceSource';
      scad: string;
      design_plan?: string;
      self_check?: Record<string, string>;
      /**
       * 关键尺寸声明（v0.7.0-beta.4）：引擎编译后按射线实测复核，
       * 偏差超过 tol 会进重抽问题清单。模型输出未校验，使用前须 normalizePartSpecs。
       */
      part_spec?: PartCheck[];
    }
  | { type: 'explain'; text: string }
  | { type: 'batchVariants'; variants: Record<string, string | number | boolean>[] }
  /** 需求模糊时反问用户（v0.4.0）。 */
  | { type: 'clarify'; question: string };

/** 对话历史中的一条消息（精简版，只保留 role + 文本，不含状态快照）。 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 一次 AI 请求的完整上下文。 */
export interface AiRequest {
  /** 用户本轮输入。 */
  userMessage: string;
  /** 当前编辑器状态（含截图、源码、参数）。 */
  state: EditorState;
  /** 之前的对话历史（不含本轮）。user 用原始消息文本，assistant 用 narration。 */
  history: ChatMessage[];
  /**
   * 用户本轮上传的参考图（dataURL，已在前端压缩）。
   * 支持视觉输入的模型会直接看到；纯文本模型会收到"看不到图片"的说明。
   */
  images?: string[];
  /** 调用方传入的模型配置覆盖项。 */
  modelOverride?: ModelConfig;
  /**
   * 手动重抽上下文（v0.4.1）：上次生成验证失败/解析失败时随响应返回，
   * 用户点"重抽"后原样带回，client 会把失败反馈拼进 history 再生成一次。
   */
  rerollContext?: RerollContext;
}

/** 手动重抽上下文：上次失败的具体信息，驱动带反馈的重新生成。 */
export interface RerollContext {
  /** 上次生成的原始用户需求。 */
  userMessage: string;
  /** 验证问题清单（lint / 几何 / 审核结论）。 */
  problems: string[];
  /** 上次代码的实际切片 ASCII 预览（解析失败时为空串）。 */
  slices: string;
  /** 上次模型的原始输出（会截断后拼进 history）。 */
  previousRaw: string;
}

/** replaceSource 的本地验证结果（v0.4.0 引入，v0.4.1 改为单次验证 + 手动重抽）。 */
export interface AiVerification {
  /** passed=通过；failed=未通过（结果照常返回，用户可手动重抽）；skipped=含不支持特性未验证。 */
  status: 'passed' | 'failed' | 'skipped';
  /** 自动检测到的疑点 / 跳过原因。 */
  notes: string[];
}

/** AI 响应。 */
export interface AiResponse {
  /** undefined 表示输出解析失败（见 error 字段），此时无动作可应用。 */
  action?: AiAction;
  /** 给用户看的自然语言说明。 */
  narration: string;
  /** 原始模型输出，调试用。 */
  raw: string;
  /** 仅当输出无法解析为合法 JSON 时存在。 */
  error?: string;
  /** replaceSource 时的本地几何验证结果。 */
  verification?: AiVerification;
  /** 验证失败/解析失败时存在：用户点"重抽"后原样带回 AiRequest。 */
  rerollContext?: RerollContext;
}

/**
 * 支持的模型服务商。
 * - openai/deepseek/glm/kimi/minimax/sensenova/openrouter/custom：均走 OpenAI 兼容 /chat/completions
 * - claude：走 Anthropic 原生 /v1/messages
 *
 * `custom` 用于用户自填的 OpenAI 兼容端点（Ollama / LM Studio / vLLM 等）。
 * 各 provider 的浏览器 CORS 能力见 traps.md #3。
 */
export type ModelProvider =
  | 'openai'
  | 'deepseek'
  | 'glm'
  | 'kimi'
  | 'minimax'
  | 'sensenova'
  | 'openrouter'
  | 'custom'
  | 'claude';

/** 云端模型配置。 */
export interface ModelConfig {
  provider: ModelProvider;
  /** 主模型名，负责文本推理与决策。如 `deepseek-chat`、`glm-4`、`claude-3-5-sonnet-20241022`、`gpt-4o`。 */
  model: string;
  apiKey: string;
  /** 可选 API base，默认走官方。 */
  baseUrl?: string;
  /**
   * 思考力度（可选，仅部分服务商支持，如 SenseNova）。
   * 默认 'none'（关思考）：结构化 JSON 输出场景下思考会挤占 max_tokens
   * 导致 content 为空（traps.md #4）。想启用思考选 low/medium/high。
   */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
}
