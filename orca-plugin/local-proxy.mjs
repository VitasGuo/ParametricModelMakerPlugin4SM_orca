/**
 * Local AI relay for Snapmaker Orca.
 *
 * Browser CORS blocks SenseNova/GLM/OpenAI preflights. This tiny Node server
 * exposes POST /proxy on 127.0.0.1:17329 and forwards {url, headers, body}
 * to an allowlisted host, adding CORS headers for the Orca page.
 *
 * The API key is supplied by the browser on every request; this server does not
 * store it.
 */

import http from 'node:http';
import https from 'node:https';

const PORT = Number(process.env.MODEL_LAB_PROXY_PORT || 17329);
const HOST = '127.0.0.1';
const ALLOWED_HOSTS = new Set([
  'token.sensenova.cn',
  'api.deepseek.com',
  'openrouter.ai',
  'api.moonshot.cn',
  'api.minimax.chat',
  'open.bigmodel.cn',
  'api.openai.com',
  'api.anthropic.com',
]);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access, http-referer, x-title',
  'Access-Control-Max-Age': '86400',
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { ok: true, service: 'model-lab-proxy' });
    return;
  }
  if (req.method !== 'POST' || req.url !== '/proxy') {
    json(res, 404, { error: 'Not found' });
    return;
  }

  const chunks = [];
  let size = 0;
  let tooLarge = false;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (tooLarge) return;
    if (size > 2_000_000) {
      tooLarge = true;
      // 先回 413，等响应写完再断开 socket；先销毁 socket 客户端会收不到响应
      json(res, 413, { error: 'Request too large' });
      res.on('finish', () => req.destroy());
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (tooLarge) return;
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      json(res, 400, { error: 'Invalid JSON' });
      return;
    }
    const { url, headers, body } = payload ?? {};
    if (typeof url !== 'string' || typeof body !== 'string' || !headers || typeof headers !== 'object') {
      json(res, 400, { error: 'Expected {url, headers, body}' });
      return;
    }
    let target;
    try {
      target = new URL(url);
    } catch {
      json(res, 400, { error: 'Invalid url' });
      return;
    }
    if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
      json(res, 403, { error: `Host not allowed: ${target.hostname}` });
      return;
    }

    const outgoing = {};
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') outgoing[key] = value;
    }

    const upstream = https.request(
      {
        hostname: target.hostname,
        port: 443,
        path: target.pathname + target.search,
        method: 'POST',
        headers: outgoing,
      },
      (upstreamRes) => {
        // 上游流中途出错（连接被重置等）不能成为未捕获 'error' 事件，否则 Node 进程直接崩溃
        upstreamRes.on('error', (error) => {
          if (res.headersSent) {
            res.destroy();
            return;
          }
          json(res, 502, { error: `Upstream error: ${error.message}` });
        });
        // 上游（如 SenseNova）自己也会带 ACAO；与本地 CORS 头重复会让浏览器判定非法
        const responseHeaders = {};
        for (const [key, value] of Object.entries(upstreamRes.headers)) {
          const lower = key.toLowerCase();
          if (lower.startsWith('access-control-')) continue;
          if (lower === 'content-encoding' || lower === 'content-length' || lower === 'transfer-encoding') continue;
          responseHeaders[key] = value;
        }
        Object.assign(responseHeaders, CORS);
        res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
        upstreamRes.pipe(res);
      }
    );
    // 连接与响应空闲总超时：destroy 带 Error 会触发下方 error 处理，返回 502
    upstream.setTimeout(60_000, () => upstream.destroy(new Error('Upstream timeout')));
    upstream.on('error', (error) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      json(res, 502, { error: `Upstream error: ${error.message}` });
    });
    upstream.end(body);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Model Lab proxy listening on http://${HOST}:${PORT}/proxy`);
});

function json(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    ...CORS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(body.length),
  });
  res.end(body);
}
