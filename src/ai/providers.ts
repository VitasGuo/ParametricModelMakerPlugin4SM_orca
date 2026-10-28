/**
 * 多 provider AI 调用层。
 *
 * 纯静态网页直接由浏览器 fetch；各家的 CORS 能力不同（traps #3）：
 * - direct：DeepSeek / Kimi / MiniMax / OpenRouter / Anthropic / 自定义端点
 * - proxy：OpenAI / GLM / SenseNova（需要用户自建代理，或改走 OpenRouter）
 *
 * 代理协议：POST <proxyUrl>
 *   { "url": "https://目标接口", "headers": {...}, "body": {...} }
 * 仓库附带 Cloudflare Worker 模板，只允许转发到白名单域名。
 */

import type { ChatMessage, ModelConfig, ModelProvider } from '../core/types.js';

export interface ProviderMeta {
  id: ModelProvider;
  label: string;
  baseUrl: string;
  /** 该 provider 的常用默认模型。 */
  defaultModel: string;
  /** 浏览器直连是否可用；proxy 表示建议走代理。 */
  cors: 'direct' | 'proxy';
  /** 主模型多模态识别规则。 */
  visionPattern: RegExp;
  /** 是否支持 response_format=json_object。 */
  jsonMode: boolean;
  /** 设置页提示。 */
  note?: string;
}

export const PROVIDERS: Record<ModelProvider, ProviderMeta> = {
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    cors: 'direct',
    visionPattern: /never/i,
    jsonMode: true,
    note: '国内直连，纯文本，价格低',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    cors: 'direct',
    visionPattern: /gpt-4o|gpt-4\.1|gpt-5|claude|gemini|qwen.*vl|glm-4.*v|vision|llava|pixtral|gemma-3/i,
    jsonMode: true,
    note: '一个 Key 聚合多家模型，含视觉模型；适合作为通用入口',
  },
  kimi: {
    id: 'kimi',
    label: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    cors: 'direct',
    visionPattern: /vision|kimi-latest|moonshot-v1-8k-vision/i,
    jsonMode: true,
    note: '国内直连',
  },
  minimax: {
    id: 'minimax',
    label: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'abab6.5-chat',
    cors: 'direct',
    visionPattern: /vision|abab.*v/i,
    jsonMode: true,
  },
  claude: {
    id: 'claude',
    label: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-3-5-sonnet-20241022',
    cors: 'direct',
    visionPattern: /claude-3|claude-4|claude-sonnet|claude-opus|claude-haiku/i,
    jsonMode: false,
    note: '浏览器直连需 anthropic-dangerous-direct-browser-access 头（已自动添加）',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    cors: 'proxy',
    visionPattern: /gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5|o4/i,
    jsonMode: true,
    note: '官方 API 不建议浏览器直连；请填写代理地址，或改用 OpenRouter',
  },
  glm: {
    id: 'glm',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-plus',
    cors: 'proxy',
    visionPattern: /glm-4v|glm-4\.6v|glm-4\.5v/i,
    jsonMode: true,
    note: '预检 CORS 不通过，浏览器直连会失败；请填写代理地址，或改用 OpenRouter',
  },
  sensenova: {
    id: 'sensenova',
    label: '商汤 SenseNova',
    baseUrl: 'https://token.sensenova.cn/v1',
    defaultModel: 'deepseek-flash',
    cors: 'proxy',
    visionPattern: /sensenova-6\.7|sensenova-6\.8/i,
    jsonMode: true,
    note: '预检 CORS 不通过，浏览器直连会失败；请填写代理地址',
  },
  custom: {
    id: 'custom',
    label: '自定义 OpenAI 兼容端点',
    baseUrl: '',
    defaultModel: '',
    cors: 'direct',
    visionPattern: /vision|vl|llava|pixtral|gemma-3/i,
    jsonMode: true,
    note: 'Ollama / LM Studio / vLLM 等；需自行确认端点允许 CORS',
  },
};

export interface WebModelConfig extends ModelConfig {
  /** 通用代理地址；填写后所有请求都走它。 */
  proxyUrl?: string;
}

export interface CallResult {
  text: string;
  reasoning?: string;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly detail?: string
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** 调用主模型。 */
export async function callProvider(
  cfg: WebModelConfig,
  system: string,
  userText: string,
  screenshot: string,
  temperature: number,
  history: ChatMessage[]
): Promise<CallResult> {
  if (!cfg.apiKey.trim()) throw new ProviderError('未填写 API Key，请先在设置里配置。');
  if (cfg.provider === 'custom' && !cfg.baseUrl?.trim()) {
    throw new ProviderError('自定义 provider 需要填写 Base URL。');
  }

  if (cfg.provider === 'claude') {
    return callClaude(cfg, system, userText, screenshot, temperature, history);
  }
  return callOpenAICompatible(cfg, system, userText, screenshot, temperature, history);
}

interface ContentBlock {
  type: string;
  text?: string;
  image_url?: { url: string };
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

async function callOpenAICompatible(
  cfg: WebModelConfig,
  system: string,
  userText: string,
  screenshot: string,
  temperature: number,
  history: ChatMessage[]
): Promise<CallResult> {
  const meta = PROVIDERS[cfg.provider];
  const baseUrl = trimSlash(cfg.baseUrl?.trim() || meta.baseUrl);
  const url = `${baseUrl}/chat/completions`;
  const multimodal = meta.visionPattern.test(cfg.model);

  let userContent: OpenAIMessage['content'] = userText;
  if (multimodal && screenshot) {
    userContent = [
      { type: 'text', text: userText },
      { type: 'image_url', image_url: { url: screenshot } },
    ];
  }

  const messages: OpenAIMessage[] = [
    { role: 'system', content: system },
    ...history.map((m): OpenAIMessage => ({ role: m.role, content: m.content })),
    { role: 'user', content: userContent },
  ];

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature,
    max_tokens: 4096,
  };
  if (meta.jsonMode) body.response_format = { type: 'json_object' };
  if (cfg.provider === 'sensenova') body.reasoning_effort = cfg.reasoningEffort ?? 'none';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  if (cfg.provider === 'openrouter') {
    headers['HTTP-Referer'] = location.origin;
    headers['X-Title'] = 'Model Lab Web';
  }

  const data = await postJson<{
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }>; reasoning_content?: string } }>;
  }>(cfg, url, headers, body);

  const message = data.choices?.[0]?.message;
  const text =
    typeof message?.content === 'string'
      ? message.content
      : Array.isArray(message?.content)
        ? message.content.map((block) => block.text ?? '').join('')
        : '';
  return { text, reasoning: message?.reasoning_content };
}

interface ClaudeContent {
  type: 'text' | 'image';
  text?: string;
  source?: { type: 'base64'; media_type: string; data: string };
}

async function callClaude(
  cfg: WebModelConfig,
  system: string,
  userText: string,
  screenshot: string,
  temperature: number,
  history: ChatMessage[]
): Promise<CallResult> {
  const baseUrl = trimSlash(cfg.baseUrl?.trim() || PROVIDERS.claude.baseUrl);
  const url = `${baseUrl}/v1/messages`;

  const userContent: ClaudeContent[] = [{ type: 'text', text: userText }];
  if (screenshot) {
    const base64 = screenshot.startsWith('data:') ? screenshot.split(',')[1] ?? '' : screenshot;
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: base64 },
    });
  }

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userContent },
  ];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': cfg.apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };

  const data = await postJson<{ content?: Array<{ type: string; text?: string }> }>(cfg, url, headers, {
    model: cfg.model,
    max_tokens: 8192,
    system,
    messages,
    temperature,
  });
  const text = data.content?.find((block) => block.type === 'text')?.text ?? '';
  return { text };
}

const MAX_ATTEMPTS = 3;

async function postJson<T>(
  cfg: WebModelConfig,
  targetUrl: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<T> {
  const requestBody = JSON.stringify(body);
  let lastError: ProviderError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      if (cfg.proxyUrl?.trim()) {
        response = await fetch(cfg.proxyUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl, headers, body: requestBody }),
        });
      } else {
        response = await fetch(targetUrl, { method: 'POST', headers, body: requestBody });
      }
    } catch (e) {
      throw new ProviderError(
        `无法连接 ${targetUrl}。可能是网络问题、CORS 限制或代理未配置。`,
        undefined,
        e instanceof Error ? e.message : String(e)
      );
    }

    const text = await response.text();
    if (!response.ok) {
      lastError = new ProviderError(
        `API 返回 ${response.status}：${friendlyStatus(response.status)}`,
        response.status,
        text.slice(0, 600)
      );
      // 429 / 5xx 多为瞬时限流，按 Retry-After 或指数退避重试
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === MAX_ATTEMPTS) throw lastError;
      await delay(retryDelayMs(response.headers.get('Retry-After'), attempt));
      continue;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ProviderError('API 返回了非 JSON 内容', response.status, text.slice(0, 300));
    }
  }
  throw lastError ?? new ProviderError('请求失败');
}

function retryDelayMs(retryAfter: string | null, attempt: number): number {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, 30) * 1000;
  return Math.min(1200 * 2 ** (attempt - 1), 8000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function friendlyStatus(status: number): string {
  if (status === 401 || status === 403) return 'Key 无效或无权限';
  if (status === 429) return '请求过于频繁 / 额度用尽';
  if (status >= 500) return '服务端错误';
  if (status === 404) return '接口地址不存在';
  return '请求失败';
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** 判断主模型是否原生支持图片输入。 */
export function isMultimodal(cfg: ModelConfig): boolean {
  return PROVIDERS[cfg.provider].visionPattern.test(cfg.model);
}
