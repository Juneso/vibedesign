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

const richText = [book.toc, book.summary, book.intro].filter(Boolean).join(' ');
const ranked = computeSalience({ lifts: liftRun.lifts, memoTexts, aliasGroups, aspects, richText });
console.log(`\n■ salience — ${nrmT(book.title)} (${liftRun.label})`);
console.log('점수 | 빈도 | 메모 | 피참조 | 주장 | 개념');
for (const r of ranked) console.log(`${r.score.toFixed(2)} | ${String(r.freq).padStart(4)} | ${r.memos} | ${String(r.refScore).padStart(5)} | ${r.claims} | ${r.concept}`);

const out = { kind: 'salience', book: nrmT(book.title), lifts: liftRun.label, runAt: new Date().toISOString(), aliasGroups, aspects, ranked };
const label = `salience-${liftRun.label}`;
await writeFile(resolve(__dir, `runs/${label}.json`), JSON.stringify(out, null, 2));
console.log(`\n→ runs/${label}.json`);
