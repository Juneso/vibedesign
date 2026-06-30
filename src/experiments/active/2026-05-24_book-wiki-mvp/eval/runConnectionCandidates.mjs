// 책 간 연결 후보 추출 (BKT-287 Layer 1)
// 방향: LLM은 인사이트를 합성하지 않는다. 공유질문 + 양쪽 책의 수집 원문만 고른다.
//       인사이트는 유저가 답하며 생긴다(Layer 2). 연결의 역할 = 좋은 '도발(provocation)'.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);
const call = openaiNodeTransport({ model: 'gpt-4o' });

const BOOK_NAME = {
  isbn_9788937833663: '돈으로 살 수 없는 것들',
  isbn_9788932909349: '그리스인 조르바',
  isbn_9788952225122: '디자인의 디자인',
  isbn_9788937473562: '무의미의 축제',
};

// body의 메모 흐름에서 {quote(원문), thesis(논지)} 쌍 추출
function memosFromBody(body) {
  const memos = [];
  const lines = body.split(/\r?\n/);
  let curQuote = null;
  for (const line of lines) {
    const q = line.match(/^>\s*(?:\[[^\]]*\])?\s*(.+?)\s*(?:\[\^memo:[^\]]*\])?\s*$/);
    const t = line.match(/^>\s*—\s*논지:\s*(.+)$/);
    if (t) { memos.push({ quote: (curQuote || '').replace(/^"|"$|\.\.\.$/g, '').trim(), thesis: t[1].trim() }); curQuote = null; }
    else if (q && !line.includes('논지:')) { curQuote = q[1]; }
  }
  return memos.filter(m => m.quote || m.thesis);
}

const pages = [];
async function loadCache(file) {
  let cache;
  try { cache = JSON.parse(await readFile(resolve(__dir, file), 'utf-8')); } catch { return 0; }
  let n = 0;
  for (const [id, b] of Object.entries(cache.books)) {
    const bookName = b.title || BOOK_NAME[id] || id;
    for (const p of (b.pages || [])) {
      pages.push({ book: bookName, title: p.title, keyConcepts: p.keyConcepts || [], memos: memosFromBody(p.body || '') });
      n++;
    }
  }
  return n;
}
const nGolden = await loadCache('golden/ingest-cache.json');
const nMore = await loadCache('golden/more-books-cache.json');
console.log(`로드: 골든 ${nGolden}p + 추가 ${nMore}p = ${pages.length}p`);

// 메모 단위로 평탄화 — 연결의 단위는 '수집 원문 1개'
const units = [];
pages.forEach((p, pi) => p.memos.forEach((m, mi) => {
  units.push({ id: units.length, book: p.book, concept: p.title, quote: m.quote, thesis: m.thesis });
}));

const digest = units.map(u =>
  `[${u.id}] 《${u.book}》(${u.concept})\n    원문: ${u.quote || '(원문 없음)'}\n    논지: ${u.thesis}`
).join('\n');

const system = `너는 독서 위키의 "책 간 연결" 큐레이터다. 서로 다른 책에서 수집된 문장 두 개가, 같은 질문 앞에 세우면 흥미로워지는 쌍을 찾는다.

너의 역할은 **인사이트를 써주는 게 아니다.** 인사이트는 유저가 답하며 스스로 만든다. 너는 좋은 '도발'만 만든다:
- **공유질문(sharedQuestion)**: 두 원문이 동시에 답하게 되는, 구체적이고 답이 정해지지 않은 질문 하나.
- 그리고 그 질문 앞에 세울 **양쪽 원문 두 개**(aUnit, bUnit 인덱스로 지목).

절대 규칙:
1. 반드시 **다른 책**의 원문끼리 연결한다 (aUnit, bUnit의 책이 달라야 함).
2. 앵커는 키워드가 아니라 **원문이 실제로 말하는 내용**이다. 단어만 겹치고 내용이 안 닿으면 금지.
3. sharedQuestion 규칙:
   - 두 원문이 **둘 다** 답이 되는 질문이어야 한다. 한쪽만 관련되면 실패.
   - 구체적이어야 한다. "자유란?", "디자인이란?"처럼 한 단어로 환원되는 거대 추상 금지.
   - 답이 갈릴 수 있어야 한다(유저가 자기 생각으로 답할 여지). 정답이 뻔하면 실패.
   - 좋은 예: "값을 매길 수 없다고 우리가 말하는 것에, 사실 우리는 이미 값을 매기고 있지 않나?"
4. relation: 두 원문이 그 질문에 같은 방향이면 reinforce, 반대면 tension, 한쪽이 다른쪽의 전제면 premise, 추상↔사례면 instance.

뻔한 연결 많이 만들지 마라. 질문이 흥미롭지 않으면 빼라.`;

const user = `다음은 여러 책에서 수집된 문장(원문+논지)들이다.

${digest}

책을 가로지르는 연결 후보를 최대 15개 뽑아라. 인사이트를 쓰지 말고 질문과 원문 지목만 하라. JSON:
{
  "candidates": [
    { "aUnit": <인덱스>, "bUnit": <인덱스>, "sharedQuestion": "두 원문이 동시에 답하는 구체적 질문", "relation": "reinforce|tension|premise|instance", "confidence": 0.0~1.0 }
  ]
}`;

const raw = await call({ system, user, temperature: 0 });
const gen = JSON.parse(raw);

// 하드 필터: 같은 책 / 잘못된 인덱스 제거
gen.candidates = gen.candidates.filter(c => {
  const a = units[c.aUnit], b = units[c.bUnit];
  return a && b && a.book !== b.book;
});

// ── critic: 이게 좋은 '도발'인가 ──
const critItems = gen.candidates.map((c, i) => {
  const a = units[c.aUnit], b = units[c.bUnit];
  return `[${i}] 공유질문: ${c.sharedQuestion}
   A 《${a.book}》: "${a.quote || a.thesis}"
   B 《${b.book}》: "${b.quote || b.thesis}"`;
}).join('\n\n');

const critSystem = `너는 책 간 연결 '도발'을 검수하는 심사관이다. 엄격하되 공정하라. 4개 게이트:

G1 양쪽 응답성: 두 원문이 **둘 다** sharedQuestion에 답이 되는가? 한쪽만 관련되면 FAIL.
G2 질문 구체성: sharedQuestion이 구체적인가? 한 단어 거대추상으로 환원되면 FAIL.
G3 도발성: 이 질문 앞에 두 원문을 세우면 **유저가 생각하고 싶어지는가**? 답이 뻔하거나, 두 원문이 그냥 같은 말 반복이면 FAIL(도발이 안 됨).
G4 내용 앵커: 단어 우연일치가 아니라 원문 내용이 실제로 닿는가? 아니면 FAIL.

판정:
- keep이면 reason에 **두 원문이 그 질문에서 어떻게 갈리거나 만나는지** 한 줄로 써라.
- drop이면 깨진 게이트를 구체적으로.
4개 모두 PASS여야 keep.`;

const critUser = `후보들:\n\n${critItems}\n\nJSON으로만 답하라:
{ "verdicts": [ { "i": <번호>, "verdict": "keep|drop", "gates": {"G1":"pass|fail","G2":"pass|fail","G3":"pass|fail","G4":"pass|fail"}, "reason": "..." } ] }`;

const critRaw = await call({ system: critSystem, user: critUser, temperature: 0 });
const crit = JSON.parse(critRaw);
const vBy = new Map(crit.verdicts.map(v => [v.i, v]));
gen.candidates.forEach((c, i) => { c._v = vBy.get(i) || { verdict: 'drop', reason: '(판정 누락)' }; });

const kept = gen.candidates.filter(c => c._v.verdict === 'keep');
const dropped = gen.candidates.filter(c => c._v.verdict !== 'keep');

const REL = { tension: '긴장/대조', reinforce: '보강', premise: '전제→귀결', instance: '추상↔사례' };
const bookCount = new Set(pages.map(p => p.book)).size;
const lines = [];
lines.push(`# 책 간 연결 후보 — 도발형 (${units.length}개 원문, ${bookCount}권)`);
lines.push(`생성 ${gen.candidates.length} → critic 통과 ${kept.length} / 탈락 ${dropped.length}\n`);
lines.push(`라벨링: 각 후보 [ ]에 ✅(생각하고 싶어짐)/❌(시시함) + 관계 교정\n`);
lines.push(`## ✅ 통과 (${kept.length})\n`);
kept.sort((x, y) => (y.confidence || 0) - (x.confidence || 0));
kept.forEach((c, i) => {
  const a = units[c.aUnit], b = units[c.bUnit];
  lines.push(`### ${i + 1}. [${REL[c.relation] || c.relation}] conf ${c.confidence}`);
  lines.push(`- ❓ 공유질문: **${c.sharedQuestion}**`);
  lines.push(`- A 《${a.book}》(${a.concept}): "${a.quote || a.thesis}"`);
  lines.push(`- B 《${b.book}》(${b.concept}): "${b.quote || b.thesis}"`);
  lines.push(`- critic: ${c._v.reason}`);
  lines.push(`- 판정: [   ]\n`);
});
lines.push(`\n## ❌ 탈락 (${dropped.length})\n`);
dropped.forEach((c) => {
  const a = units[c.aUnit], b = units[c.bUnit];
  const fails = Object.entries(c._v.gates || {}).filter(([, v]) => v === 'fail').map(([k]) => k).join(',');
  lines.push(`- ❓"${c.sharedQuestion}" 《${a.book}》↔《${b.book}》 — FAIL ${fails}: ${c._v.reason}`);
});
const md = lines.join('\n');
await writeFile(resolve(__dir, 'runs/connection-candidates.md'), md);
await writeFile(resolve(__dir, 'runs/connection-candidates.json'), JSON.stringify({ units, kept, dropped }, null, 2));
console.log(md);
console.log(`\n저장: eval/runs/connection-candidates.md (통과 ${kept.length} / 탈락 ${dropped.length})`);
