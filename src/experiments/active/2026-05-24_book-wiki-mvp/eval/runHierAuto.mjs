// 자동 디스패치 인제스트 (BKT-380 확정안) — 책의 척추가 어디 있느냐로 엔진을 고른다.
//
// 목차가 시간 순으로 흐르는 책(서양미술사류)은 목차 자체가 척추 → v10 시대 편성.
// 핵심 테제가 있는 책(존중정치학·피로사회류)은 테제가 척추 → v11 관계 축.
// 판정 신호는 목차 형태(장 제목 구조)만 쓴다 — 이번 라운드 8회 실행 전부에서 안정적이었고,
// 키워드·본문을 보는 판정은 전부 흔들렸다. 근거 장 제목 인용을 실제 목차와 대조해 검증한다.
//
// 사용: node eval/runHierAuto.mjs "책1" "책2" …
// 결과: runs/hier-auto-{N}.json + .md (시리즈 hier-auto, 디스패치 근거 포함)
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { runHierIngest, serializeTree } from './lib/hierEngine.mjs';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';
import { cachedPlanIngest } from './lib/planCache.mjs';
import { buildNarrative } from './lib/logNarrative.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);

const N = (s) => String(s || '').normalize('NFC');
const nrm = (s) => N(s).replace(/\s+/g, '').toLowerCase();
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
const INGEST_MODEL = process.env.INGEST_MODEL || 'gpt-4o';
const KEY = process.env.OPENAI_API_KEY;
const llm = openaiNodeTransport({ model: MODEL });

const { planIngest, setLLMTransport } = await import('../lib/llm.js');
setLLMTransport(openaiNodeTransport({ model: INGEST_MODEL }));

async function embedFn(text) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || 'embed fail');
  return d.data[0].embedding;
}

// 디스패치 판정 — 목차 장 제목 구조만 본다. 목차가 없으면 테제형(v11)이 기본값:
// 시간축 주장은 적극적 근거가 있을 때만 하는 쪽이 안전하다(가짜 시대 편성의 손상이 더 크다).
async function dispatch(book) {
  const toc = (book.toc || []).map(String).filter(Boolean);
  if (!toc.length) return { variant: 'v11', why: '목차 없음 → 테제형 기본값' };
  const raw = await llm({
    system: '비문학 책의 목차 장 제목 구조만 보고 책이 시간 순(시대·연대·인물 계보·발전 과정)으로 전개되는지 판정한다. tocEvidence 에 근거 장 제목을 그대로 옮겨 적어라. JSON만 출력.',
    user: `책: ${book.title}\n\n[목차]\n${toc.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n출력 JSON: {"chronological":true|false,"confidence":"high|med|low","tocEvidence":["장 제목"]}`,
    temperature: 0,
  });
  let j = {}; try { j = JSON.parse(raw); } catch { /* 판정 실패 → 기본값 */ }
  const ev = (Array.isArray(j.tocEvidence) ? j.tocEvidence : []).filter((x) => toc.some((t) => nrm(t).includes(nrm(x)) || nrm(x).includes(nrm(t))));
  const chrono = j.chronological === true && j.confidence === 'high' && ev.length > 0;
  return {
    variant: chrono ? 'v10' : 'v11',
    why: chrono ? `목차 시간순(high) — 근거: ${ev.slice(0, 3).join(' · ')}` : `시간순 아님(${j.chronological} · ${j.confidence || '?'}) → 테제형`,
  };
}

const titles = (process.argv.slice(2).length ? process.argv.slice(2) : (process.env.BOOKS || '').split(','))
  .map((s) => s.trim()).filter(Boolean);
if (!titles.length) { console.error('책 제목을 인자로 주세요'); process.exit(1); }

const ds = JSON.parse(await readFile(resolve(__dir, 'golden/books50-memos.json'), 'utf-8'));
const meta = JSON.parse(await readFile(resolve(__dir, 'golden/obsidian-books-meta.json'), 'utf-8'));

const existing = (await readdir(resolve(__dir, 'runs'))).map((f) => f.match(/^hier-auto-(\d+)\.json$/)).filter(Boolean).map((m) => +m[1]);
let i = existing.length ? Math.max(...existing) : 0;

console.log(`[AUTO] 위계 ${MODEL} · planIngest ${INGEST_MODEL} · ${titles.length}권`);

for (const t of titles) {
  const b = ds.books.find((x) => N(x.title) === N(t));
  if (!b) { console.log(`  ⚠ "${t}" — 데이터셋에 없음`); continue; }
  const m = Object.values(meta).find((x) => N(x.title) === N(t)) || {};

  const memos = b.memos.map((mm, k) => ({ id: `ds-${b.id}-${k}`, p: mm.p, text: mm.text, chapter: `p.${mm.p}`, myThought: '' }));
  const book = {
    title: N(b.title), author: m.author || '', category: m.category || '',
    toc: m.toc || [], summary: m.summary || '', aladin: m.aladin || {},
  };

  const t0 = Date.now();
  try {
    const d = await dispatch(book);
    console.log(`  [${N(b.title)}] 디스패치 → ${d.variant} (${d.why})`);
    const r = await runHierIngest({
      book, memos, llm, embedFn, variant: d.variant,
      planIngestFn: cachedPlanIngest(planIngest, { book, memos, model: INGEST_MODEL }),
      onProgress: (msg) => process.stdout.write(`      ${msg}\r`),
    });
    const tree = serializeTree(r.nodes, r.rootId);
    const sec = Math.round((Date.now() - t0) / 1000);

    const C = tree.nodes.filter((n) => n.kind === 'concept');
    const sentences = tree.nodes.filter((n) => n.kind === 'sentence').length;
    const covered = new Set(tree.nodes.filter((n) => n.kind === 'sentence').map((n) => n.memoId)).size;

    const base = resolve(__dir, `runs/hier-auto-${++i}`);
    await writeFile(`${base}.json`, JSON.stringify({
      label: N(b.title), runAt: new Date().toISOString(),
      kind: 'hier-auto', variant: d.variant, dispatch: d.why,
      mode: r.mode, hierModel: MODEL, ingestModel: INGEST_MODEL,
      nMemos: memos.length,
      counts: { concepts: C.length, sentences, coveredMemos: covered }, sec,
      tree, log: r.log,
    }, null, 2) + '\n', 'utf-8');

    let md = `# ${N(b.title)} — 자동 디스패치 (${d.variant})\n\n`;
    md += `- 디스패치: **${d.variant}** — ${d.why}\n`;
    md += `- 결과: ${r.mode ? `${r.mode.mode} (${r.mode.confidence})` : '평면'}\n`;
    md += `- 메모 ${memos.length}개 · 커버 ${covered}/${memos.length} · ${sec}초\n\n`;
    // 단계별 서사 — LLM 호출 없이 로그를 사람 말로 번역(lib/logNarrative.mjs)
    md += buildNarrative({ log: r.log, dispatch: d.why, variant: d.variant, tree, counts: { concepts: C.length, sentences, coveredMemos: covered }, nMemos: memos.length });
    await writeFile(`${base}.md`, md, 'utf-8');

    console.log(`      → ${d.variant} · 개념 ${C.length} · 문장 ${sentences} · 커버 ${covered}/${memos.length} (${sec}초)`);
  } catch (e) {
    console.log(`      ✗ 실패: ${e.message}`);
  }
}
console.log(`\n✓ 완료`);
