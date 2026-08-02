// planIngest(gpt-4o) 응답 디스크 캐시 — 위계 로직만 바꿔 재실행할 때 가장 비싼
// 호출(planIngest)을 재사용해 OpenAI 비용을 없앤다.
//
// 사용: const cached = cachedPlanIngest(planIngest, { book, memos, model: INGEST_MODEL });
//       await runHierIngest({ ..., planIngestFn: cached });
//
// 캐시 키 = sha256({ title, memoTexts, model }) — 책 제목·메모 본문·모델이 같으면
// 같은 planIngest 결과를 재사용한다 (existingPages/contexts/profile 은 이 러너들에서
// 항상 고정값이라 키에 넣지 않는다).
//
// NO_CACHE=1 로 캐시를 건너뛰고 항상 새로 호출할 수 있다.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_DIR = resolve(__dir, '..', '.plan-cache');

function cacheKey({ book, memos, model }) {
  const payload = {
    title: book?.title || '',
    memoTexts: (memos || []).map((m) => m.text),
    model: model || '',
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function cachedPlanIngest(planIngestFn, { book, memos, model, cacheDir = DEFAULT_CACHE_DIR } = {}) {
  return async function wrappedPlanIngest(args) {
    if (process.env.NO_CACHE) return planIngestFn(args);

    const key = cacheKey({ book, memos, model });
    const file = resolve(cacheDir, `${key}.json`);

    if (existsSync(file)) {
      console.log(`  [planCache] 캐시 적중 (${book?.title || '?'})`);
      return JSON.parse(await readFile(file, 'utf-8'));
    }

    const out = await planIngestFn(args);
    if (!existsSync(cacheDir)) await mkdir(cacheDir, { recursive: true });
    await writeFile(file, JSON.stringify(out, null, 2) + '\n', 'utf-8');
    return out;
  };
}
