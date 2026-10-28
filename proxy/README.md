# 可选 AI 代理（Cloudflare Worker）

纯静态网页默认直连 CORS 友好的 provider（DeepSeek / Kimi / MiniMax / OpenRouter / Anthropic / 自定义端点）。
如果你要用 **OpenAI / GLM / SenseNova**，浏览器预检会被拦截，需要这个代理。

## 部署

```bash
cd proxy
npx wrangler deploy
```

部署完成后，把 Worker URL（例如 `https://model-lab-web-proxy.your-name.workers.dev`）填到网页
**设置 → API 代理地址**。

## 安全说明

- Worker 只转发到 `worker.js` 顶部的 `ALLOWED_HOSTS` 白名单
- 只转发白名单请求头（Authorization / x-api-key 等），不能当任意 HTTP 代理
- API Key 由你的浏览器随请求发送，Worker 不保存、不记录
- 建议把 `wrangler.toml` 的 `ALLOW_ORIGIN` 改成你的网页域名，避免别人盗用你的 Worker
