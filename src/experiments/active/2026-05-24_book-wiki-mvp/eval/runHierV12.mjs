// v12 조립 러너 (BKT-342) — lift 골든을 입력으로 주장 단위 조립을 돌린다.
//
// PROVIDER=manual (기본): LLM 콜을 golden/hier-v12-manual-*.json 픽스처로 대체,
//   임베딩 없음 — 개발 루프 API 0원. 조립 파이프라인 자체의 검증용.
// PROVIDER=deepseek|openai: 마일스톤 A/B 체크포인트용 (transport 재사용). 임베딩은 openai.
//
// 사용: node runHierV12.mjs [라벨]   → runs/hier-v12-<PROVIDER>-<라벨|N>.json/.md

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { assembleV12, serializeV12 } from './lib/hierV12Engine.mjs';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PROVIDER = process.env.PROVIDER || 'manual';
const label = process.argv[2] || '1';
const BOOK = (process.env.BOOK || '피로사회').normalize('NFC');

// LIFTS 로 lift 소스를 바꾼다 — 골든(기본) 또는 실 모델 lift 런 (4단계 재생성)
const golden = JSON.parse(await readFile(resolve(__dir, process.env.LIFTS || 'golden/lift-golden-피로사회.json'), 'utf-8'));
const ds = JSON.parse(await readFile(resolve(__dir, 'golden/books50-memos.json'), 'utf-8'));
const book = process.env.MEMOS_FILE
  ? JSON.parse(await readFile(resolve(__dir, process.env.MEMOS_FILE), 'utf-8'))
  : ds.books.find((b) => nrmT(b.title) === BOOK);
if (!book) throw new Error(`books50 에 없는 책: ${BOOK}`);
function nrmT(s) { return String(s || '').normalize('NFC').trim(); }

let llm, embedFn = null;
if (PROVIDER === 'claude') {
  // 4단계 재생성 경로 — 조립 LLM 콜을 claude CLI(구독 요금)로. 임베딩은 EMBED=1 일 때만
  // (openai text-embedding-3-small, 런당 수십 분의 1원 — fold-back·패러프레이즈 병합용)
  const { claudeCliTransport } = await import('./lib/claudeCliTransport.mjs');
  llm = claudeCliTransport({ model: process.env.MODEL || 'claude-haiku-4-5-20251001' });
  if (process.env.EMBED === '1') {
    await loadDotEnvLocal(__dir);
    embedFn = async (text) => {
      const r = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message || 'embed fail');
      return d.data[0].embedding;
    };
  }
} else if (PROVIDER === 'manual') {
  const fx = JSON.parse(await readFile(resolve(__dir, 'golden/hier-v12-manual-피로사회.json'), 'utf-8'));
  // 시스템 프롬프트 문면으로 어떤 콜인지 식별하는 개발용 스텁 — transport 계약과 동일 시그니처
  llm = async ({ system }) => {
    if (system.includes('역할 블록')) return JSON.stringify(fx.roleBlocks);
    if (system.includes('묶는 개념')) return JSON.stringify(fx.foldBack || { folds: [] });
    if (system.includes('구절이 가리키는 개념')) return '{"map":{}}'; // 의미 매칭 — 픽스처 경로는 자구만
    throw new Error('픽스처에 없는 콜: ' + system.slice(0, 40));
  };
} else {
  await loadDotEnvLocal(__dir);
  llm = PROVIDER === 'deepseek'
    ? openaiNodeTransport({ baseURL: 'https://api.deepseek.com/v1', keyEnv: 'DEEPSEEK_API_KEY', model: 'deepseek-v4-flash' })
    : openaiNodeTransport({ model: process.env.HIER_MODEL || 'gpt-4o-mini' });
  embedFn = async (text) => {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || 'embed fail');
    return d.data[0].embedding;
  };
}

// salience — 조립 전에 계산해 전달 (0808: 점수가 방향·강등·대조 축·구조 예산을 정한다).
// 기본은 자구·결정적(별칭 없음 — manual 재현성 유지). 리치 핵심은 목차 자구 폴백.
const { computeSalience } = await import('./lib/salience.mjs');
const memoTexts = new Map();
golden.lifts.forEach((l) => {
  const memo = book.memos[Number(l.memoId.split('-').pop())];
  memoTexts.set(l.memoId, memo?.text || '');
});
let richToc = book.toc || '';
if (!richToc) {
  try {
    const meta = JSON.parse(await readFile(resolve(__dir, 'golden/obsidian-books-meta.json'), 'utf-8'));
    const m = Object.values(meta).find((b) => nrmT(b.title || b.matchedTitle).includes(nrmT(book.title)));
    if (m) richToc = m.toc || '';
  } catch {}
}
// SALIENCE=runs/salience-*.json — runSalience 산출(별칭·측면 귀속 포함)을 그대로 쓴다.
// 합성 표제어 lift 뽑기에서 자구 재계산이 핵심 개념(컴퓨터)을 놓쳐 강등해버린 실측의 수리.
let salience, aliasMap = new Map();
if (process.env.SALIENCE) {
  const sal = JSON.parse(await readFile(resolve(__dir, process.env.SALIENCE), 'utf-8'));
  salience = sal.ranked;
  for (const g of (sal.aliasGroups || [])) for (const a of g.slice(1)) aliasMap.set(nrmT(a).replace(/\s+/g, '').toLowerCase(), g[0]);
  for (const [asp, core] of Object.entries(sal.aspects || {})) aliasMap.set(nrmT(asp).replace(/\s+/g, '').toLowerCase(), core);
} else {
  salience = computeSalience({ lifts: golden.lifts, memoTexts, richToc });
}
console.log('  · salience 상위:', salience.slice(0, 6).map((r2) => `${r2.concept} ${r2.score}`).join(' · '));

const t0 = Date.now();
const r = await assembleV12({
  book: { title: nrmT(book.title), author: book.author },
  lifts: golden.lifts, llm, embedFn, salience, aliasMap,
  onProgress: (m) => console.log('  ·', m),
});
const sec = Math.round((Date.now() - t0) / 100) / 10;

const out = {
  label: `hier-v12-${PROVIDER}-${label}`, runAt: new Date().toISOString(), kind: 'hier-v12',
  provider: PROVIDER, promptVersion: golden.promptVersion, nMemos: golden.lifts.length,
  llmCalls: r.llmCalls, counts: r.counts, sec, tree: serializeV12(r), log: r.log,
};
const base = resolve(__dir, `runs/${out.label}`);
await writeFile(`${base}.json`, JSON.stringify(out, null, 2));

// md 렌더 — 준서 검토용
const byId = new Map(out.tree.nodes.map((n) => [n.id, n]));
const kids = (pid) => out.tree.nodes.filter((n) => n.parentId === pid);
function renderNode(n, depth) {
  const pad = '  '.repeat(depth);
  if (n.kind === 'sentence') return `${pad}- p.${n.sources[0] ?? '?'} ${n.title}${n.confidence !== 'high' ? ` ⚠${n.confidence}` : ''}\n`;
  const tag = n.role ? ` 〔${n.role}〕` : n.crossCut ? ' 〔fold-back〕' : n.promoted ? ' ★' : '';
  let s = `${pad}- **${n.title}**${tag}${n.relation ? ` (${n.relation})` : ''}\n`;
  for (const k of kids(n.id)) s += renderNode(k, depth + 1);
  return s;
}
let md = `# ${out.label} — 주장 단위 조립 (lift 골든 입력)\n\n`;
md += `> ${out.runAt} · ${PROVIDER} · LLM ${r.llmCalls}콜 · ${sec}초\n`;
md += `> 주장 ${r.counts.claims} · 클러스터 ${r.counts.clusters} (승격 ★ ${r.counts.promoted}) · 블록 ${r.counts.blocks} · 대조 엣지 ${r.counts.contrastEdges} · 미배정 ${r.counts.orphans}\n\n## 트리\n\n`;
for (const b of kids(out.tree.rootId)) md += renderNode(b, 0);
md += `\n## 대조 엣지 (lift 슬롯 그대로 — 재판정 0콜)\n\n`;
for (const e of out.tree.edges.filter((x) => x.type === '대조')) {
  const nm = (id) => id ? byId.get(id)?.title : null;
  md += `- ${e.pair.join(' ↔ ')}\n  - 축: ${e.axis} · 출처 ${e.claimKey}${nm(e.a) && nm(e.b) ? ` · 클러스터 간: ${nm(e.a)} ↔ ${nm(e.b)}` : ''}\n`;
}
md += `\n## 로그\n\n${r.log.map((l) => `- ${l}`).join('\n')}\n`;
await writeFile(`${base}.md`, md);

console.log(`\n✓ ${out.label} — 주장 ${r.counts.claims} · 블록 ${r.counts.blocks} · 대조 엣지 ${r.counts.contrastEdges} · LLM ${r.llmCalls}콜 (${sec}초)`);
console.log(`  → runs/${out.label}.json / .md`);
