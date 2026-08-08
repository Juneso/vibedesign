// salience 검산 러너 (BKT-380 · 0808) — lift 런에 점수를 매겨 순위표를 낸다.
// 트리 배선 전 검산용: 넥서스는 준서 정답(종교 0.7 · 인쇄술 0.8 · 포퓰리즘 0.6 ·
// 민주주의 0.7 · 컴퓨터 0.9)과 대조한다.
//
// 사용: LIFTS=runs/….json [MEMOS_FILE=golden/….json | BOOK=책] [ALIAS=1] node runSalience.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { computeSalience, buildAliasPrompt } from './lib/salience.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const nrmT = (s) => String(s || '').normalize('NFC').trim();

const liftRun = JSON.parse(await readFile(resolve(__dir, process.env.LIFTS), 'utf-8'));
let book;
if (process.env.MEMOS_FILE) {
  book = JSON.parse(await readFile(resolve(__dir, process.env.MEMOS_FILE), 'utf-8'));
} else {
  const ds = JSON.parse(await readFile(resolve(__dir, 'golden/books50-memos.json'), 'utf-8'));
  book = ds.books.find((b) => nrmT(b.title) === nrmT(process.env.BOOK || '피로사회'));
}
const memoTexts = new Map();
liftRun.lifts.forEach((l, i) => {
  const memo = book.memos[Number(l.memoId.split('-').pop())] || book.memos[i];
  memoTexts.set(l.memoId, memo?.text || '');
});

// 별칭 해석 — 폐쇄 판정 1콜 (ALIAS=1). 표제어 + 슬롯의 대상 구절을 이름 후보로 넣는다
let aliasGroups = [];
let aspects = {};
if (process.env.ALIAS === '1') {
  const { claudeCliTransport } = await import('./lib/claudeCliTransport.mjs');
  const llm = claudeCliTransport({ model: process.env.MODEL_ALIAS || 'claude-sonnet-5' }); // 별칭은 판정 품질이 병목 — 소네트 1콜
  const names = new Set();
  for (const l of liftRun.lifts) for (const c of l.claims) {
    names.add(nrmT(c.headword));
    for (const s of Object.values(c.slots || {}))
      for (const v of [...(s.pair || []), s.of, s.concept, s.subject, s.target].filter(Boolean)) {
        const n = nrmT(String(v).split('—')[0]);
        if (n.length >= 2 && n.length <= 14) names.add(n);
      }
  }
  try {
    const raw = await llm(buildAliasPrompt({ book: nrmT(book.title), names: [...names] }));
    const parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) || ['{}'])[0]);
    aliasGroups = (parsed.groups || []).filter((g) => Array.isArray(g) && g.length >= 2);
    aspects = parsed.aspects || {};
    console.log(`별칭 그룹 ${aliasGroups.length}개: ${aliasGroups.map((g) => g.join('≈')).join(' · ')}`);
    console.log(`측면 귀속 ${Object.keys(aspects).length}개: ${Object.entries(aspects).map(([a, c]) => `${a}→${c}`).join(' · ')}`);
  } catch (e) { console.log('별칭 판정 실패 — 자구만:', e.message.slice(0, 80)); }
}

// 목차·책 소개 — 저자·출판사 공인 개념 가중 (0808 준서: 빈도 뻥튀기의 반대편 닻).
// MEMOS_FILE 의 자체 필드가 우선, 없으면 obsidian-books-meta(알라딘 리치)에서 제목 매칭.
let rich = [book.toc, book.summary, book.intro].filter(Boolean);
if (!rich.length) {
  try {
    const meta = JSON.parse(await readFile(resolve(__dir, 'golden/obsidian-books-meta.json'), 'utf-8'));
    const m = Object.values(meta).find((b) => nrmT(b.title || b.matchedTitle).includes(nrmT(book.title)) || nrmT(book.title).includes(nrmT(b.matchedTitle || b.title)));
    if (m) { rich = [m.toc, m.summary].filter(Boolean); console.log('리치데이터: obsidian-books-meta 에서 목차·소개 로드'); }
  } catch {}
}
let richCore = [];
const richToc = rich[0] || '';
if (rich.length && process.env.ALIAS === '1') {
  try {
    const { claudeCliTransport } = await import('./lib/claudeCliTransport.mjs');
    const { buildRichCorePrompt } = await import('./lib/salience.mjs');
    const llm2 = claudeCliTransport({ model: 'claude-haiku-4-5-20251001' });
    const raw = await llm2(buildRichCorePrompt({ book: nrmT(book.title), toc: rich[0], summary: rich[1] }));
    richCore = JSON.parse((raw.match(/\{[\s\S]*\}/) || ['{}'])[0]).core || [];
    console.log(`리치 핵심 ${richCore.length}개: ${richCore.join(' · ')}`);
  } catch (e) { console.log('리치 핵심 추출 실패 — 목차 자구 폴백:', e.message.slice(0, 60)); }
}
const ranked = computeSalience({ lifts: liftRun.lifts, memoTexts, aliasGroups, aspects, richCore, richToc });
console.log(`\n■ salience — ${nrmT(book.title)} (${liftRun.label})`);
console.log('점수 | 빈도 | 메모 | 피참조 | 주장 | 개념');
for (const r of ranked) console.log(`${r.score.toFixed(2)} | ${String(r.freq).padStart(4)} | ${r.memos} | ${String(r.refScore).padStart(5)} | ${r.claims} | ${r.concept}`);

const out = { kind: 'salience', book: nrmT(book.title), lifts: liftRun.label, runAt: new Date().toISOString(), aliasGroups, aspects, richCore, ranked };
const label = `salience-${liftRun.label}`;
await writeFile(resolve(__dir, `runs/${label}.json`), JSON.stringify(out, null, 2));
console.log(`\n→ runs/${label}.json`);
