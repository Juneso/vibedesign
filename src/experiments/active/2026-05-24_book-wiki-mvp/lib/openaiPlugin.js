// Vite dev 서버 플러그인: OpenAI Chat Completions 프록시.
// 키는 .env.local 의 OPENAI_API_KEY 에서 주입 (브라우저 노출 X).
// POST /api/llm  body: { system, user, model?, temperature? }
// 응답: { text }  — 모델이 JSON 모드로 반환한 문자열을 그대로 전달

import { loadEnv } from 'vite';

const DEFAULT_MODEL = 'gpt-4o-mini';

export function openaiPlugin() {
  let apiKey = '';
  return {
    name: 'book-wiki-mvp:openai-proxy',
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), '');
      apiKey = env.OPENAI_API_KEY || env.OpenAPI || '';
    },
    configureServer(server) {
      server.middlewares.use('/api/llm', async (req, res) => {
        const send = (code, body) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(typeof body === 'string' ? body : JSON.stringify(body));
        };
        if (req.method !== 'POST') return send(405, { error: 'POST only' });
        if (!apiKey) return send(500, { error: 'OPENAI_API_KEY missing in .env.local' });

        try {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const { system, user, model, temperature } = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
          if (!user) return send(400, { error: 'user message required' });

          const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: model || DEFAULT_MODEL,
              temperature: temperature ?? 0.3,
              response_format: { type: 'json_object' },
              messages: [
                ...(system ? [{ role: 'system', content: system }] : []),
                { role: 'user', content: user },
              ],
            }),
          });
          const data = await upstream.json();
          if (!upstream.ok) return send(upstream.status, { error: data?.error?.message || 'openai error', raw: data });
          const text = data.choices?.[0]?.message?.content ?? '';
          send(200, { text, usage: data.usage });
        } catch (e) {
          send(500, { error: String(e?.message ?? e) });
        }
      });
    },
  };
}
