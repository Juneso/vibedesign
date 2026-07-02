// 트랙 A — question-first 연결.
// memo-questions.json(메모별 질문 후보) → 질문 클러스터링 → 한 클러스터에 ≥2권이면 연결.
// 공유질문 = 클러스터 대표질문(짝짓기보다 먼저 존재) → 억지 아우르기 구조적 불가.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);
const call = openaiNodeTransport({ model: 'gpt-4o' });

const { units } = JSON.parse(await readFile(resolve(__dir, 'golden/memo-questions.json'), 'utf-8'));
const uById = new Map(units.map(u => [u.id, u]));

// ── 임베딩 헬퍼 (text-embedding-3-small) ──
async function embed(texts) {
  const key = process.env.OPENAI_API_KEY;
  const out = [];
  for (let i = 0; i < texts.length; i += 256) {
    const batch = texts.slice(i, i + 256);
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: batch }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `embed ${r.status}`);
    out.push(...d.data.map(x => x.embedding));
  }
  return out;
}
const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

// unit별 thesis 임베딩 + universal 질문 임베딩들
const thesisVecs = await embed(units.map(u => u.thesis || ''));
const qFlat = [];
units.forEach((u, ui) => (u.universal || []).forEach(q => qFlat.push({ ui, q })));
const qVecs = await embed(qFlat.map(x => x.q));
const qByUnit = units.map(() => []);
qFlat.forEach((x, i) => qByUnit[x.ui].push({ q: x.q, v: qVecs[i] }));
console.log(`임베딩: thesis ${units.length} + 보편질문 ${qFlat.length}`);

// ── cross-book 쌍 점수 = 0.5·질문유사도(max) + 0.5·thesis유사도 ──
const W_Q = 0.5, W_T = 0.5, TOP_N = 60;
const scored = [];
for (let i = 0; i < units.length; i++) {
  for (let j = i + 1; j < units.length; j++) {
    if (units[i].book === units[j].book) continue;
    let qsim = 0, qa = '', qb = '';
    for (const x of qByUnit[i]) for (const y of qByUnit[j]) {
      const s = cos(x.v, y.v); if (s > qsim) { qsim = s; qa = x.q; qb = y.q; }
    }
    const tsim = cos(thesisVecs[i], thesisVecs[j]);
    scored.push({ i, j, qsim, tsim, score: W_Q * qsim + W_T * tsim, qa, qb });
  }
}
scored.sort((a, b) => b.score - a.score);
const cand = scored.slice(0, TOP_N);
console.log(`cross-book 쌍 ${scored.length} → 상위 ${cand.length} 후보 (score ${cand[cand.length-1].score.toFixed(3)}~${cand[0].score.toFixed(3)})`);

// ── LLM 확정: 각 후보쌍이 진짜 공유질문을 갖는가 ──
const confItems = cand.map((c, i) => {
  const a = uById.get(units[c.i].id), b = uById.get(units[c.j].id);
  return `[${i}] (q유사 ${c.qsim.toFixed(2)} / t유사 ${c.tsim.toFixed(2)})
   A 《${a.book}》: "${a.quote || a.thesis}" (보편Q: ${c.qa})
   B 《${b.book}》: "${b.quote || b.thesis}" (보편Q: ${c.qb})`;
}).join('\n\n');
const confSystem = `너는 두 책의 문장쌍을 **하나의 공유질문** 앞에 세울 수 있는지 판정한다. 임베딩이 후보를 골랐고, 너는 그 질문을 만들 수 있는지 본다.

가장 중요한 원칙:
- **두 문장이 서로 다른 말을 하는 것은 문제가 아니라 좋은 것이다.** 좋은 연결은 하나의 질문에 두 책이 *다르게* 답하는 것이다(긴장·대조·보강 다 포함). "A는 X를, B는 Y를 말해서 다르다"는 이유로 기각하지 마라 — 그 X와 Y가 **같은 질문에 대한 서로 다른 답**이면 오히려 훌륭한 연결이다.
- 판정 기준은 단 하나: **하나의 질문을 세웠을 때, 두 문장이 모두 그 질문에 대한 답/입장으로 읽히는가?**
  - 읽히면 keep. canonical에 그 질문을 써라(입장을 부르는 형태, 정의물음 금지).
  - drop은 오직: 한 문장이 그 질문과 정말 무관하거나, 하나의 질문으로 묶으려면 억지 상위추상("둘 다 인간을 다룸")까지 올라가야 할 때만.`;
const confUser = `후보쌍:\n\n${confItems}\n\nJSON:
{ "verdicts": [ { "i": <번호>, "verdict": "keep|drop", "canonical": "공유질문(keep일 때)", "reason": "..." } ] }`;
const confRaw = await call({ system: confSystem, user: confUser, temperature: 0 });
const { verdicts: confV } = JSON.parse(confRaw);
const confBy = new Map(confV.map(v => [v.i, v]));

const enriched = cand.map((c, i) => {
  const v = confBy.get(i) || { verdict: 'drop', reason: '(누락)' };
  return { canonical: v.canonical, memberUnits: [units[c.i].id, units[c.j].id],
    books: [units[c.i].book, units[c.j].book], _pairV: v, qsim: c.qsim, tsim: c.tsim };
}).filter(c => c._pairV.verdict === 'keep');
console.log(`LLM 확정: ${cand.length} → keep ${enriched.length}`);

// 확정 기각된 상위 후보(임베딩 점수순) — 확정이 과하게 깠는지 점검용
const confRejects = cand.map((c, i) => ({ c, v: confBy.get(i) })).filter(x => x.v && x.v.verdict !== 'keep').slice(0, 10);
console.log(`\n── 확정 기각 상위 ${confRejects.length}개 (점검용) ──`);
for (const { c, v } of confRejects) {
  const a = uById.get(units[c.i].id), b = uById.get(units[c.j].id);
  console.log(`• 《${a.book}》"${(a.quote||a.thesis).slice(0,30)}" ↔ 《${b.book}》"${(b.quote||b.thesis).slice(0,30)}"\n   보편Q: ${c.qa} / ${c.qb}\n   기각: ${v.reason}`);
}

// ── Step 4: critic — 각 클러스터가 좋은 도발인가 ──
function unitLine(uid) { const u = uById.get(uid); return `《${u.book}》"${u.quote || u.thesis}"`; }
const critItems = enriched.map((c, i) =>
  `[${i}] 공유질문: ${c.canonical}\n` + c.memberUnits.map(uid => `   - ${unitLine(uid)}`).join('\n')
).join('\n\n');

const critSystem = `너는 question-first 연결을 검수한다. 각 클러스터는 "하나의 공유질문 + 그 질문에 답하는 여러 책의 문장"이다. 게이트:
G1 응답성: 묶인 문장들이 **모두** 이 공유질문에 실제로 답이 되는가? 안 되는 문장이 있으면 그 문장을 dropUnits에 넣어라.
G2 질문 품질: 공유질문이 입장을 부르는 진짜 질문인가? 단순 정의물음("X란?")이거나 한쪽으로 답이 뻔하면 FAIL.
G3 도발성: 서로 다른 책의 문장을 이 질문 앞에 세우면 생각하고 싶어지는가? 그냥 같은 말 반복이면 FAIL.
2권 이상이 남고 G2·G3 pass면 keep.`;
const critUser = `클러스터들:\n\n${critItems}\n\nJSON:
{ "verdicts": [ { "i": <번호>, "verdict": "keep|drop", "dropUnits": [<uid>...], "reason": "..." } ] }`;

const critRaw = await call({ system: critSystem, user: critUser, temperature: 0 });
const { verdicts } = JSON.parse(critRaw);
const vBy = new Map(verdicts.map(v => [v.i, v]));

const kept = [];
enriched.forEach((c, i) => {
  const v = vBy.get(i) || { verdict: 'drop', reason: '(누락)' };
  if (v.verdict !== 'keep') { c._drop = v.reason; return; }
  const drop = new Set(v.dropUnits || []);
  const survivors = c.memberUnits.filter(uid => !drop.has(uid));
  const books = [...new Set(survivors.map(uid => uById.get(uid)?.book))];
  if (books.length >= 2) kept.push({ ...c, memberUnits: survivors, books, reason: v.reason });
  else c._drop = v.reason + ' (생존 <2권)';
});

// ── 출력 ──
const lines = [];
lines.push(`# 책 간 연결 — question-first (트랙 A)`);
lines.push(`cross-book쌍 ${scored.length} → 임베딩 상위 ${cand.length} → LLM확정 ${enriched.length} → critic 통과 ${kept.length}\n`);
lines.push(`라벨링: 각 연결 [ ]에 ✅/❌ + (필요시 공유질문 교정)\n`);
kept.sort((a, b) => b.books.length - a.books.length);
kept.forEach((c, i) => {
  lines.push(`### ${i + 1}. ❓ **${c.canonical}**  (${c.books.length}권)`);
  c.memberUnits.forEach(uid => { const u = uById.get(uid); lines.push(`- 《${u.book}》(${u.concept}): "${u.quote || u.thesis}"`); });
  lines.push(`- critic: ${c.reason}`);
  lines.push(`- 판정: [   ]\n`);
});
const dropped = enriched.filter(c => c._drop);
lines.push(`\n## 탈락 (${dropped.length})\n`);
dropped.forEach(c => lines.push(`- ❓"${c.canonical}" (${c.books.join(', ')}) — ${c._drop}`));

const md = lines.join('\n');
await writeFile(resolve(__dir, 'runs/connections-qf.md'), md);
await writeFile(resolve(__dir, 'runs/connections-qf.json'), JSON.stringify({ kept, dropped }, null, 2));
console.log(md);
console.log(`\n저장: eval/runs/connections-qf.md (통과 ${kept.length})`);
