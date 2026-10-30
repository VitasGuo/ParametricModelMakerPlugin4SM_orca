/**
 * Model Lab Web 可选 AI 代理（Cloudflare Worker）。
 *
 * 只解决浏览器 CORS：请求体里的 API Key 由用户浏览器提供，Worker 不保存 Key。
 * 部署后把 Worker URL 填到网页「设置 → API 代理地址」即可。
 *
 * 部署：
 *   cd proxy
 *   npx wrangler deploy
 *
 * 安全：
 * - 只允许转发到下面的 ALLOWED_HOSTS 白名单
 * - 只允许转发白名单请求头，避免被当成任意 HTTP 代理
 * - 建议在 wrangler.toml 里把 ALLOW_ORIGIN 设成你的网页域名
 */

const ALLOWED_HOSTS = new Set([
  'api.openai.com',
  'open.bigmodel.cn',
  'token.sensenova.cn',
  'api.deepseek.com',
  'api.moonshot.cn',
  'api.minimax.chat',
  'openrouter.ai',
  'api.anthropic.com',
]);

const ALLOWED_HEADERS = new Set([
  'content-type',
  'authorization',
  'x-api-key',
  'anthropic-version',
  'anthropic-dangerous-direct-browser-access',
  'http-referer',
  'x-title',
]);

export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Token',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ error: '只支持 POST' }, 405, cors);
    }

    // 可选共享密钥：设置了 PROXY_TOKEN 时必须携带相等的 x-proxy-token 请求头；为空则不校验（向后兼容）
    if (env.PROXY_TOKEN) {
      const token = request.headers.get('x-proxy-token');
      if (token !== env.PROXY_TOKEN) {
        return json({ error: '缺少或错误的 x-proxy-token' }, 401, cors);
      }
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: '请求体不是 JSON' }, 400, cors);
    }

    const { url, headers, body } = payload ?? {};
    if (typeof url !== 'string' || typeof body !== 'string' || !headers || typeof headers !== 'object') {
      return json({ error: '请求体必须包含 url / headers / body' }, 400, cors);
    }

    let target;
    try {
      target = new URL(url);
    } catch {
      return json({ error: 'url 无效' }, 400, cors);
    }
    if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
      return json({ error: `不允许转发到 ${target.hostname}` }, 403, cors);
    }
    if (body.length > 2_000_000) {
      return json({ error: '请求体过大' }, 413, cors);
    }

    const forwarded = {};
    for (const [key, value] of Object.entries(headers)) {
      if (!ALLOWED_HEADERS.has(key.toLowerCase())) continue;
      if (typeof value !== 'string') continue;
      forwarded[key] = value;
    }

    let upstream;
    try {
      upstream = await fetch(target.toString(), {
        method: 'POST',
        headers: forwarded,
        body,
      });
    } catch (e) {
      return json({ error: `上游请求失败：${e instanceof Error ? e.message : String(e)}` }, 502, cors);
    }

    const responseHeaders = new Headers(upstream.headers);
    for (const name of ['content-encoding', 'content-length', 'transfer-encoding']) {
      responseHeaders.delete(name);
    }
    for (const [key, value] of Object.entries(cors)) responseHeaders.set(key, value);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  },
};

function json(value, status, headers) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
