// 상위 개념(super-concept) 생성 — 첫 시도.
// 여러 책의 keyConcepts를 LLM으로 클러스터링해, 책을 가로지르는 상위 개념을 만든다.
// 상위 개념 노드는 멤버 개념을 keyConcepts로 가지므로, 그래프의 "공유 개념" 엣지 규칙에 의해
// 멤버 개념을 가진 모든 페이지(책 무관)와 자동 연결된다.
//
// 사용: node eval/buildSuperConcepts.mjs
// 결과: golden/super-concepts.json  { superConcepts: [{ id, title, note, members: [개념...] }] }

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { setLLMTransport, SYSTEM_RULES } from '../lib/llm.js';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

await loadDotEnvLocal(__dirname);
const MODEL = process.env.EVAL_MODEL || 'gpt-4o';
const transport = openaiNodeTransport({});
setLLMTransport((args) => transport({ ...args, model: args.model || MODEL }));

// ── 두 캐시에서 개념 수집 ──
function collectFromCache(cache) {
  const out = []; // { concept, bookId, pageTitle }
  for (const bid of Object.keys(cache.books || {})) {
    for (const p of (cache.books[bid].pages || [])) {
      for (const c of (p.keyConcepts || [])) out.push({ concept: c, bookId: p.bookId || bid, pageTitle: p.title });
    }
  }
  return out;
}

const ingestCache = JSON.parse(await readFile(resolve(ROOT, 'golden/ingest-cache.json'), 'utf-8'));
const designCache = JSON.parse(await readFile(resolve(ROOT, 'golden/design-books-cache.json'), 'utf-8'));
const all = [...collectFromCache(ingestCache), ...collectFromCache(designCache)];

// 개념별 등장 책 집계
const byConcept = new Map();
for (const r of all) {
  if (!byConcept.has(r.concept)) byConcept.set(r.concept, new Set());
  byConcept.get(r.concept).add(r.bookId);
}
const conceptList = [...byConcept.keys()];
console.log(`수집된 고유 개념: ${conceptList.length}개`);

// ── LLM 클러스터링 ──
const prompt = `다음은 여러 책의 위키 페이지에서 추출된 "개념" 목록이다. 책마다 표현이 달라 서로 연결되지 않고 책별로만 묶여 있다.

[개념 목록]
${conceptList.map(c => `- ${c}`).join('\n')}

[작업]
이 개념들을 가로지르는 "상위 개념(super-concept)" 5~8개를 만들어라.
- 상위 개념은 **서로 다른 책에서 온 개념들을 묶을 때** 가치가 있다. 가능한 한 2개 이상의 개념을 포함하고, 서로 다른 책에 걸치도록 묶어라.
- 디자인/사용성/철학/사회 등 큰 주제로 묶어도 좋다.
- members 에는 위 [개념 목록]에 있는 문자열을 **그대로(verbatim)** 넣어라. 새 표현을 만들지 마라.
- 한 개념이 여러 상위 개념에 속해도 된다. 묶이지 않는 개념은 버려도 된다.

[출력] 아래 JSON만 출력. 설명 금지.
{"superConcepts":[{"title":"상위 개념명(짧은 명사구)","note":"왜 이 개념들이 한 묶음인지 1문장","members":["개념A","개념B","개념C"]}]}`;

const raw = await transport({ system: SYSTEM_RULES, user: prompt, temperature: 0.3, model: MODEL });
let parsed;
try {
  const jsonStr = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  parsed = JSON.parse(jsonStr);
} catch (e) {
  console.error('JSON 파싱 실패. 원본 일부:\n', raw.slice(0, 500));
  process.exit(1);
}

const valid = new Set(conceptList);
const superConcepts = (parsed.superConcepts || [])
  .map((s, i) => {
    const members = (s.members || []).filter(m => valid.has(m)); // 존재하는 개념만
    const books = new Set();
    members.forEach(m => byConcept.get(m)?.forEach(b => books.add(b)));
    return { id: `super-${i}`, title: s.title, note: s.note || '', members, bookSpan: books.size };
  })
  .filter(s => s.members.length >= 2); // 최소 2개 묶여야 의미

await writeFile(resolve(ROOT, 'golden/super-concepts.json'), JSON.stringify({ superConcepts }, null, 2), 'utf-8');
console.log(`✓ 상위 개념 ${superConcepts.length}개 생성`);
for (const s of superConcepts) {
  console.log(`  • ${s.title} (${s.members.length}개 개념, ${s.bookSpan}권 교차): ${s.members.join(', ')}`);
}
