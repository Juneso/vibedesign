// Node 환경용 LLM transport. OpenAI Chat Completions 직접 호출.
// 사용: setLLMTransport(openaiNodeTransport({ apiKey, model }))

const DEFAULT_MODEL = 'gpt-4o-mini';

export function openaiNodeTransport({ apiKey, model } = {}) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing (env or apiKey)');
  return async ({ system, user, model: m, temperature }) => {
    const useModel = m || model || DEFAULT_MODEL;
    // gpt-5 계열·o-시리즈(reasoning)는 temperature 기본값(1)만 지원 — 파라미터 생략
    const noTemp = /^(gpt-5|o\d)/.test(useModel);
    const body = JSON.stringify({
      model: useModel,
      ...(noTemp ? {} : { temperature: temperature ?? 0.3 }),
      response_format: { type: 'json_object' },
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: user },
      ],
    });
    // rate limit 자동 재시도 (최대 3회, 지수 백오프)
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body,
      });
      const data = await r.json();
      if (r.status === 429) {
        const wait = (attempt + 1) * 15000; // 15s, 30s, 45s
        console.warn(`  ⚠ rate limit, ${wait/1000}s 대기 후 재시도...`);
        await new Promise(res => setTimeout(res, wait));
        continue;
      }
      if (!r.ok) throw new Error(data?.error?.message || `openai ${r.status}`);
      return data.choices?.[0]?.message?.content ?? '';
    }
    throw new Error('openai rate limit: 재시도 초과');
  };
}

// .env.local 간단 파서 — dotenv 의존성 회피.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// 시작 디렉토리에서 위로 올라가며 .env.local 탐색.
export async function loadDotEnvLocal(startDir) {
  let dir = startDir || dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const path = resolve(dir, '.env.local');
    try {
      const raw = await readFile(path, 'utf-8');
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
      }
      return path;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
