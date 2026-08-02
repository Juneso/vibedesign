// V10 — 책의 논지 전개 방식에 맞춘 위계 인제스트 (BKT-380)
//
// V8 과 Phase 1(planIngest → 키워드 + 메모 문장 + 과부하 분할)은 동일하고,
// Phase 2 만 다르다: "테마" 한 가지 모양 대신 책이 이야기를 풀어가는 방식
// (통시·분류·비교·인과…)을 먼저 판정하고 그 방식에 맞는 상위를 만든다.
// 순서가 의미를 갖는 방식(통시·과정·인과)은 단계에 번호가 붙는다.
//
// 입력은 V8 공정비교 런과 동일하게 golden/books50-memos.json 메모 전량 +
// 알라딘 리치데이터를 쓴다 — 같은 입력이어야 V8 과 나란히 비교된다.
//
// 사용: node eval/runHierV10.mjs "책1" "책2" "책3"
//        BOOKS="책1,책2" node eval/runHierV10.mjs
// 결과: runs/hier-v10-{N}.json + .md  (시리즈 hier-v10)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { runHierIngest, serializeTree } from './lib/hierEngine.mjs';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';
import { cachedPlanIngest } from './lib/planCache.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);

const N = (s) => String(s || '').normalize('NFC');
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

const titles = (process.argv.slice(2).length ? process.argv.slice(2) : (process.env.BOOKS || '').split(','))
  .map((s) => s.trim()).filter(Boolean);
if (!titles.length) { console.error('책 제목을 인자로 주세요'); process.exit(1); }

const ds = JSON.parse(await readFile(resolve(__dir, 'golden/books50-memos.json'), 'utf-8'));
const meta = JSON.parse(await readFile(resolve(__dir, 'golden/obsidian-books-meta.json'), 'utf-8'));

console.log(`[V10] 위계 ${MODEL} · planIngest ${INGEST_MODEL} · ${titles.length}권`);

// 항상 1부터 시작하면 부분 재실행이 기존 결과를 덮어쓴다 — 기존 번호 다음부터.
const { readdir } = await import('node:fs/promises');
const existing = (await readdir(resolve(__dir, 'runs'))).map((f) => f.match(/^hier-v10-(\d+)\.json$/)).filter(Boolean).map((m) => +m[1]);
let i = existing.length ? Math.max(...existing) : 0;
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
    console.log(`  [${i + 1}/${titles.length}] ${N(b.title)} — 메모 ${memos.length}개 · 리치데이터 ${Object.values(book.aladin).join('').length}자`);
    const r = await runHierIngest({
      book, memos, llm, embedFn, variant: 'v10',
      forceMode: process.env.FORCE_MODE || undefined, // 판정 무시하고 방식 강제 — 판정 A/B용
      planIngestFn: cachedPlanIngest(planIngest, { book, memos, model: INGEST_MODEL }),
      onProgress: (msg) => process.stdout.write(`      ${msg}\r`),
    });
    const tree = serializeTree(r.nodes, r.rootId);
    const sec = Math.round((Date.now() - t0) / 1000);

    const conceptKids = (id) => tree.nodes.filter((n) => n.parentId === id && n.kind === 'concept');
    const C = tree.nodes.filter((n) => n.kind === 'concept');
    const stages = C.filter((n) => conceptKids(n.id).length > 0);
    const keywords = C.length - stages.length;
    const sentences = tree.nodes.filter((n) => n.kind === 'sentence').length;
    const covered = new Set(tree.nodes.filter((n) => n.kind === 'sentence').map((n) => n.memoId)).size;

    const base = resolve(__dir, `runs/hier-v10-${++i}`);
    await writeFile(`${base}.json`, JSON.stringify({
      label: N(b.title), runAt: new Date().toISOString(),
      kind: 'hier-v10', variant: 'v10',
      mode: r.mode,
      hierModel: MODEL, ingestModel: INGEST_MODEL,
      nMemos: memos.length,
      counts: { stages: stages.length, keywords, sentences, coveredMemos: covered }, sec,
      tree, log: r.log,
    }, null, 2) + '\n', 'utf-8');

    let md = `# ${N(b.title)} — V10 (전개 방식 기반)\n\n`;
    md += `- 판정된 전개 방식: **${r.mode ? `${r.mode.mode} (확신 ${r.mode.confidence})` : '판정 실패'}**\n`;
    if (r.mode?.reason) md += `- 판정 근거: ${r.mode.reason}\n`;
    md += `- 메모 ${memos.length}개 · 위계 ${MODEL} · planIngest ${INGEST_MODEL} · ${sec}초\n\n`;
    md += `## 구조\n\n| 지표 | 값 |\n|---|---|\n`;
    md += `| 상위 단계 | ${stages.length} |\n| 키워드 | ${keywords} |\n| 문장 노드 | ${sentences} |\n| 메모 커버리지 | ${covered} / ${memos.length} |\n| 전체 노드 | ${tree.nodes.length} |\n\n`;
    md += `## 트리\n\n순서가 의미를 갖는 방식(통시·과정·인과)은 단계에 번호가 붙는다.\n\n`;
    await writeFile(`${base}.md`, md, 'utf-8');

    console.log(`      → ${r.mode?.mode || '판정실패'} · 단계 ${stages.length} · 키워드 ${keywords} · 문장 ${sentences} · 커버 ${covered}/${memos.length} (${sec}초)`);
  } catch (e) {
    console.log(`      ✗ 실패: ${e.message}`);
  }
}
console.log(`\n✓ ${i}권 완료`);
