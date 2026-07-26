// literature-v1 — 문학(소설) 전용 인제스트 러너 (BKT-380)
//
// 비문학 v11 러너와 같은 관례: golden/books50-memos.json 메모 전량 + 알라딘
// 리치데이터, NFC 정규화, 번호 이어쓰기. 결과는 runs/literature-v1-{N}.json + .md.
// planIngestLit(gpt-4o)은 디스크 캐시 — 비문학 planIngest 캐시와 키가 섞이지 않게
// 모델 태그를 "gpt-4o#lit" 로 구분한다(캐시 키에 프롬프트가 안 들어가므로 필수).
//
// 사용: node eval/runLitV1.mjs "데미안"
//        BOOKS="데미안,모순" node eval/runLitV1.mjs
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { runLitIngest, planIngestLit } from './lib/litEngine.mjs';
import { serializeTree } from './lib/hierEngine.mjs';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';
import { cachedPlanIngest } from './lib/planCache.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);

const N = (s) => String(s || '').normalize('NFC');
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
// KIMI=1 이면 비싼 두 콜(planIngestLit·모티프 확정)을 Moonshot Kimi 로 A/B (BKT-381 4o 비용 최소화).
// 필요 env: MOONSHOT_API_KEY (.env.local). 모델·주소는 KIMI_MODEL / KIMI_BASE_URL 로 오버라이드.
const KIMI = process.env.KIMI === '1';
const INGEST_MODEL = process.env.INGEST_MODEL || (KIMI ? (process.env.KIMI_MODEL || 'kimi-k2.5') : 'gpt-4o');
const KEY = process.env.OPENAI_API_KEY;
const llm = openaiNodeTransport({ model: MODEL });
const bigOpts = KIMI
  ? { model: INGEST_MODEL, baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1', keyEnv: 'MOONSHOT_API_KEY' }
  : { model: INGEST_MODEL };
const llm4o = openaiNodeTransport(bigOpts);
const llmConsol = openaiNodeTransport(bigOpts);

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

const titles = (process.argv.slice(2).length ? process.argv.slice(2) : (process.env.BOOKS || '').split(','))
  .map((s) => s.trim()).filter(Boolean);
if (!titles.length) { console.error('책 제목을 인자로 주세요'); process.exit(1); }

const ds = JSON.parse(await readFile(resolve(__dir, 'golden/books50-memos.json'), 'utf-8'));
// 골든셋 밖의 문학 책(하루키 잡문집 등) — 옵시디언에서 파싱해 둔 폴백 소스
try {
  const extra = JSON.parse(await readFile(resolve(__dir, 'golden/extra-lit-memos.json'), 'utf-8'));
  ds.books.push(...(extra.books || []));
} catch { /* 없으면 골든셋만 */ }
const meta = JSON.parse(await readFile(resolve(__dir, 'golden/obsidian-books-meta.json'), 'utf-8'));
// 문학 리치데이터 폴백 — eval/fetchLitMeta.mjs 가 만든다 (없으면 리치데이터 없이 진행)
let litMeta = {};
try { litMeta = JSON.parse(await readFile(resolve(__dir, 'golden/aladin-lit-meta.json'), 'utf-8')); } catch { /* 아직 미수집 */ }
// 정본 모티프 앵커 (사이클 3) — 없으면 앵커 없이 동작. CANON=0 으로 끌 수 있다(A/B용).
let canonDb = {};
if (process.env.CANON !== '0') {
  try { canonDb = JSON.parse(await readFile(resolve(__dir, 'golden/lit-canon-motifs.json'), 'utf-8')).books || {}; } catch { /* 미적재 */ }
}

console.log(`[literature-v1] 보조 ${MODEL} · planIngestLit ${INGEST_MODEL} · ${titles.length}권`);

const existing = (await readdir(resolve(__dir, 'runs'))).map((f) => f.match(/^literature-v1-(\d+)\.json$/)).filter(Boolean).map((m) => +m[1]);
let i = existing.length ? Math.max(...existing) : 0;
let done = 0;
for (const t of titles) {
  const b = ds.books.find((x) => N(x.title) === N(t));
  if (!b) { console.log(`  ⚠ "${t}" — 데이터셋에 없음`); continue; }
  const m = Object.values(meta).find((x) => N(x.title) === N(t))
    || Object.values(litMeta).find((x) => N(x.title) === N(t)) || {};

  // ⚠ 같은 페이지에 메모가 2개면 id `m${p}` 가 충돌해 하나가 유실된다(무의미의 축제 p98 실측).
  //   유일 페이지는 기존 형식 유지(캐시 호환), 중복만 뒤에 구분자를 붙인다.
  const seenP = new Map();
  const memos = b.memos.map((mm) => {
    const n = seenP.get(mm.p) || 0; seenP.set(mm.p, n + 1);
    return { id: n ? `m${mm.p}dup${n}` : `m${mm.p}`, p: mm.p, text: mm.text, myThought: '' };
  });
  const book = {
    title: N(b.title), author: m.author || b.author || '', category: m.category || b.category || '',
    toc: m.toc || [], summary: m.summary || '', aladin: m.aladin || {},
  };

  const t0 = Date.now();
  try {
    console.log(`  [${done + 1}/${titles.length}] ${N(b.title)} — 메모 ${memos.length}개`);
    const canon = Object.entries(canonDb).find(([k]) => N(k) === N(t))?.[1] || null;
    const planFn = cachedPlanIngest(
      (args) => planIngestLit({ ...args, llm: llm4o, canon }),
      // 캐시 키에 프롬프트가 안 들어가므로 태그로 구분: 비문학 캐시와 충돌 방지(#lit)
      // + 리치데이터 유무(+rich) + 정본 앵커 유무(+canon) — 입력이 바뀌면 새로 분석하게 한다
      // #lit2: speaker 3분류(인물|서술자|미상) 프롬프트부터 — 이전 캐시와 분리
      { book, memos, model: `${INGEST_MODEL}#lit2${(book.summary || book.aladin?.intro) ? '+rich' : ''}${canon ? '+canon' : ''}` },
    );
    const r = await runLitIngest({
      book, memos, llm, embedFn, planLitFn: planFn, canon, llmConsol,
      onProgress: (msg) => process.stdout.write(`      ${msg}\r`),
    });
    const tree = serializeTree(r.nodes, r.rootId);
    const sec = Math.round((Date.now() - t0) / 1000);
    const covered = new Set(tree.nodes.filter((n) => n.kind === 'sentence').map((n) => n.memoId)).size;

    const base = resolve(__dir, `runs/literature-v1-${++i}`);
    await writeFile(`${base}.json`, JSON.stringify({
      label: N(b.title), runAt: new Date().toISOString(),
      kind: 'literature-v1', variant: 'literature-v1',
      mode: r.mode,
      hierModel: MODEL, ingestModel: INGEST_MODEL,
      nMemos: memos.length,
      counts: { ...r.stats, coveredMemos: covered }, sec,
      tree, log: r.log,
    }, null, 2) + '\n', 'utf-8');

    // 최상위(루트 직속) 모티프만 상단 목록에 — 목소리(voice) 노드는 모티프 아래 중첩으로만
    const motifs = tree.nodes.filter((n) => n.kind === 'concept' && n.parentId === r.rootId);
    const voices = tree.nodes.filter((n) => n.role === 'voice');
    let md = `# ${N(b.title)} — literature-v1 (모티프 축)\n\n`;
    md += `- 모티프: ${motifs.map((n) => `**${n.title}**`).join(' · ') || '(불성립)'}\n`;
    if (voices.length) md += `- 목소리 분기: ${[...new Set(voices.map((n) => n.title))].join(' · ')}\n`;
    md += `- 메모 ${memos.length}개 · 보조 ${MODEL} · planIngestLit ${INGEST_MODEL} · ${sec}초\n\n`;
    md += `## 구조\n\n| 지표 | 값 |\n|---|---|\n`;
    md += `| 모티프 | ${r.stats.motifs} |\n| 목소리 분기 | ${r.stats.voices} |\n| 문장 노드 | ${r.stats.sentences} |\n| root 잔류 문장 | ${r.stats.rootSentences} |\n| 메모 커버리지 | ${covered} / ${memos.length} |\n\n`;
    md += `## 트리\n\n모티프 아래 문장은 페이지순 = 서사 진행순. 각 문장에 speaker/emotion/arc 속성.\n\n`;
    // 중첩 렌더링: 책 → (모티프|인물) → [인물의 모티프] → 문장
    const sentLine = (s, indent) => `${indent}- p${s.sources[0] || '?'} [${[s.arc, s.speaker, s.emotion].filter(Boolean).join('·')}] ${String(s.title).slice(0, 80)}\n`;
    const renderNode = (c, depth) => {
      const indent = '  '.repeat(depth);
      md += `${indent}- **${c.title}**${c.gloss ? ` — ${c.gloss}` : ''}\n`;
      for (const sub of tree.nodes.filter((n) => n.parentId === c.id && n.kind === 'concept')) renderNode(sub, depth + 1);
      for (const s of tree.nodes.filter((n) => n.parentId === c.id && n.kind === 'sentence').sort((a, b) => (a.sources[0] || 0) - (b.sources[0] || 0))) md += sentLine(s, indent + '  ');
    };
    for (const c of motifs) renderNode(c, 0);
    const rootSents = tree.nodes.filter((n) => n.parentId === r.rootId && n.kind === 'sentence');
    if (rootSents.length) {
      md += `- *(미분류 — root 직속)*\n`;
      for (const s of rootSents) md += `  - p${s.sources[0] || '?'} ${String(s.title).slice(0, 80)}\n`;
    }
    await writeFile(`${base}.md`, md, 'utf-8');

    console.log(`      → 모티프 ${r.stats.motifs} · 목소리 ${r.stats.voices} · 문장 ${r.stats.sentences} · root 잔류 ${r.stats.rootSentences} · 커버 ${covered}/${memos.length} (${sec}초)`);
    done++;
  } catch (e) {
    console.log(`      ✗ 실패: ${e.message}`);
  }
}
console.log(`\n✓ ${done}권 완료`);
