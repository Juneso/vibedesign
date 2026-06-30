// planIngest 원출력 진단 — 발췌 누락이 어느 단계에서 생기는지 본다.
import { readFile } from 'node:fs/promises';
import { planIngest, setLLMTransport } from '../lib/llm.js';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';
await loadDotEnvLocal(process.cwd());
setLLMTransport(openaiNodeTransport({ model: process.env.EVAL_MODEL || 'gpt-4o-mini' }));

const book = { id: 'book_design', title: '디자인의 디자인', author: '하라 켄야',
  summary: '하라 켄야가 디자인을 RE-DESIGN(이미 아는 것을 미지의 것으로 되돌려 다시 보기)으로 재정의. 정보의 건축, 일상의 미지화, 미디어 횡단 커뮤니케이션, 문명 비평으로서의 디자인.',
  toc: ['디자인이라는 것', 'RE-DESIGN — 21세기의 일상', '정보의 건축 그 가능성', '욕망의 에듀케이션', '일본의 디자인', '비주얼커뮤니케이션 디자인', '디자이너의 일'],
  aladin: { intro: '디자인이란 무엇인가를 다룬 사상서.', publisherIntro: '새로움만 좇는 현대 디자인 비판, 일상의 미지화, 정보의 건축, 문명 비평으로서의 디자인.', excerpts: '', recommend: '' } };

const MD = process.env.HOME + '/Library/Mobile Documents/iCloud~md~obsidian/Documents/Junseo/200 Literature/210 Books/디자인의 디자인_220308_191948.md';
const raw = await readFile(MD, 'utf-8');
const parsed = []; let cur = null;
for (const line of raw.split(/\r?\n/)) { const t = line.trim(); const m = t.match(/^(\d+)\.\s*(.*)$/);
  if (m) { cur = { p: Number(m[1]), lines: [] }; parsed.push(cur); if (m[2] && m[2].length >= 25) cur.lines.push(m[2]); }
  else if (t) { if (!cur) { cur = { p: 32, lines: [] }; parsed.push(cur); } cur.lines.push(t); } }
const memos = parsed.map((x) => ({ id: `m${x.p}`, text: x.lines.join(' ').trim(), myThought: '' })).filter((x) => x.text.length > 10);

const out = await planIngest({ memos, book, existingPages: [], contexts: [], profile: {} });

console.log(`입력 메모 ${memos.length}개: ${memos.map((m) => m.id).join(', ')}\n`);
console.log(`=== analyses ${(out.analyses || []).length}개 (메모별 개념 추출 단계) ===`);
for (const a of out.analyses || []) console.log(`  ${a.memoId} | toc:${a.tocAnchor} | conf:${a.anchorConfidence} | keyConcepts: [${(a.keyConcepts || []).join(', ')}]`);
const analyzed = new Set((out.analyses || []).map((a) => a.memoId));
console.log(`\n  ▶ analyses에서 빠진 메모: ${memos.filter((m) => !analyzed.has(m.id)).map((m) => m.id).join(', ') || '없음'}`);

console.log(`\n=== patches ${(out.patches || []).length}개 (개념 페이지 단계) ===`);
for (const p of out.patches || []) { const pd = p.pageDraft || {}; const src = (pd.sources || p.addSources || []).filter((s) => s.kind === 'memo').map((s) => s.id); console.log(`  ${p.action} | "${pd.title || p.pageId}" | keyConcepts:[${(pd.keyConcepts || []).join(', ')}] | sources:[${src.join(', ')}]`); }

// 어느 메모가 어떤 개념 페이지에도 안 닿았나 (analyses keyConcept ↔ patch keyConcept 매칭)
const pageConcepts = new Set((out.patches || []).flatMap((p) => (p.pageDraft?.keyConcepts || [])));
const covered = new Set();
for (const a of out.analyses || []) if ((a.keyConcepts || []).some((kc) => pageConcepts.has(kc))) covered.add(a.memoId);
console.log(`\n  ▶ 페이지로 안 떨어진 메모(개념은 추출됐으나 page 없음): ${memos.filter((m) => !covered.has(m.id)).map((m) => m.id).join(', ') || '없음'}`);
console.log(`  ▶ patch가 만든 keyConcepts: [${[...pageConcepts].join(', ')}]`);
