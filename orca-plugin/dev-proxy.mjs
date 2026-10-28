/**
 * 开发用反向代理：在不修改 Program Files 的前提下验证 Orca 插件。
 *
 * 访问 http://127.0.0.1:31001/web/flutter_web/home?... 即可得到
 * 「Orca 原页面 + 注入的 plugin.js + /web/model-lab 静态资源」。
 *
 * 用法：
 *   npm run build
 *   node orca-plugin/dev-proxy.mjs
 */

import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'dist');
const UPSTREAM = 'http://127.0.0.1:30996';
const PORT = Number(process.env.PORT || 31001);
const PLUGIN_TAG = '<script src="/web/flutter_web/model-lab/plugin.js"></script>';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error('dist/index.html 不存在，请先运行 npm run build');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const appPrefix = '/web/flutter_web/model-lab/';
  if (url.pathname.startsWith(appPrefix)) {
    serveStatic(url.pathname.slice(appPrefix.length), req, res);
    return;
  }
  // 兼容最初的测试路径
  if (url.pathname === '/web/model-lab' || url.pathname.startsWith('/web/model-lab/')) {
    serveStatic(url.pathname.replace(/^\/web\/model-lab\/?/, ''), req, res);
    return;
  }
  proxy(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Model Lab Orca dev proxy: http://127.0.0.1:${PORT}/web/flutter_web/home?locale=zh-CN&dark_model=1`);
  console.log(`Upstream: ${UPSTREAM}`);
});

function serveStatic(rel, req, res) {
  const isPlugin = rel === 'plugin.js' || rel === 'embed-test.html';
  let path = isPlugin
    ? normalize(join(process.cwd(), 'orca-plugin', rel))
    : normalize(join(ROOT, rel || 'index.html'));
  if (!isPlugin && !path.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
  if (!existsSync(path)) {
    res.writeHead(404).end('Not found');
    return;
  }
  const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Allow-Origin': '*',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(path).pipe(res);
}

function proxy(req, res) {
  const headers = { ...req.headers, host: '127.0.0.1:30996', 'accept-encoding': 'identity' };
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port: 30996,
      path: req.url,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      const contentType = String(upstreamRes.headers['content-type'] ?? '');
      const isHtml =
        contentType.includes('text/html') && String(req.url ?? '').startsWith('/web/flutter_web/');

      if (!isHtml) {
        const outHeaders = { ...upstreamRes.headers };
        delete outHeaders['content-length'];
        delete outHeaders['content-encoding'];
        res.writeHead(upstreamRes.statusCode ?? 502, outHeaders);
        upstreamRes.pipe(res);
        return;
      }

      const chunks = [];
      upstreamRes.on('data', (chunk) => chunks.push(chunk));
      upstreamRes.on('end', () => {
        let html = Buffer.concat(chunks).toString('utf8');
        if (!html.includes(PLUGIN_TAG)) {
          if (html.includes('<script src="flutter_bootstrap.js"')) {
            html = html.replace(
              '<script src="flutter_bootstrap.js"',
              `${PLUGIN_TAG}\n  <script src="flutter_bootstrap.js"`
            );
          } else {
            html = html.replace('</body>', `${PLUGIN_TAG}\n</body>`);
          }
        }
        const body = Buffer.from(html, 'utf8');
        const outHeaders = { ...upstreamRes.headers };
        delete outHeaders['content-length'];
        delete outHeaders['content-encoding'];
        outHeaders['content-length'] = String(body.byteLength);
        outHeaders['cache-control'] = 'no-store';
        res.writeHead(upstreamRes.statusCode ?? 200, outHeaders);
        res.end(body);
      });
    }
  );

  upstream.on('error', (error) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Proxy error: ${error.message}`);
  });

  req.pipe(upstream);
}
