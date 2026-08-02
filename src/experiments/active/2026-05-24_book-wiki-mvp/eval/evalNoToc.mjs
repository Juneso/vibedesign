// 목차(TOC) 유무 비교 eval — 기존 planIngest(키워드 추출 + 개요/디스크립션) 로직을
// toc 있음(baseline) / toc 없음(영어책 시나리오) 두 조건으로 각각 돌려 품질 낙폭을 본다.
// llm.js 프롬프트는 손대지 않음(책 메타에서 toc만 비움). Google Books엔 description은 있고 목차는 없는 상황 재현.
// 실행: node eval/evalNoToc.mjs   (필요: .env.local 의 OPENAI_API_KEY)
// 출력: 콘솔 + eval/runs/toc-ablation.md

import { readFile, writeFile } from 'node:fs/promises';
import { planIngest, setLLMTransport } from '../lib/llm.js';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

await loadDotEnvLocal(process.cwd());
setLLMTransport(openaiNodeTransport({ model: process.env.INGEST_MODEL || 'gpt-4o' }));

// 책 메타 (protoRealMeta.mjs 와 동일) — description류(summary·aladin)는 유지, toc만 조건별로 제거
const META = {
  id: 'book_design', title: '디자인의 디자인', author: '하라 켄야',
  summary: '하라 켄야가 디자인의 본질을 다시 묻는 책. 디자인을 "새로운 것을 만드는 일"이 아니라 "이미 알고 있다고 여기는 것을 미지의 것으로 되돌려 다시 보게 하는 일(RE-DESIGN)"로 재정의한다. 정보를 받는 사람의 머릿속에 구축되는 구조로 보는 "정보의 건축", 일상의 미지화, 미디어를 횡단하는 커뮤니케이션 디자인, 생활에 기초한 문명 비평으로서의 디자인을 다룬다.',
  toc: ['디자인이라는 것', 'RE-DESIGN — 21세기의 일상', '정보의 건축 그 가능성', '욕망의 에듀케이션', '일본의 디자인', '비주얼커뮤니케이션 디자인', '디자이너의 일'],
  aladin: {
    intro: '그래픽 디자이너 하라 켄야가 "디자인이란 무엇인가"라는 물음을 정면으로 다룬 디자인 사상서. 새로움의 생산이 아니라 익숙한 일상을 낯설게 되돌아보는 RE-DESIGN의 관점에서 디자인의 가능성을 탐색한다.',
    publisherIntro: '하라 켄야는 첨단 테크놀로지가 끊임없이 "신기한 과일"을 식탁에 올리듯 새로움만을 좇는 현대 디자인을 비판하고, 평범한 일상 속에 잠든 무수한 디자인의 가능성을 "미지화"를 통해 일깨운다. 정보는 대량 저장·고속 이동이 아니라 받는 사람의 머릿속에 구축되는 "정보의 건축"이며, 디자인은 미디어에 종속되지 않고 그 본질을 탐색하는 횡단적 커뮤니케이션이다.',
    excerpts: '"익숙한 것을 미지의 것으로 재발견할 수 있는 감성 또한 똑같은 창조성이다." / "정보의 건축은 그 정보를 접한 사람들의 머릿속에 구축되어 가는 것이다."',
    recommend: '디자인을 ‘스타일링’이 아니라 ‘사고방식’으로 이해하게 해주는 책.',
  },
};

// .md 발췌 파싱 (protoRealMeta.mjs 와 동일)
const MD = process.env.HOME + '/Library/Mobile Documents/iCloud~md~obsidian/Documents/Junseo/200 Literature/210 Books/디자인의 디자인_220308_191948.md';
const raw = await readFile(MD, 'utf-8');
const parsed = []; let cur = null;
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim(); const m = t.match(/^(\d+)\.\s*(.*)$/);
  if (m) { cur = { p: Number(m[1]), chapter: m[2] && m[2].length < 25 ? m[2] : '', lines: [] }; parsed.push(cur); if (m[2] && m[2].length >= 25) cur.lines.push(m[2]); }
  else if (t) { if (!cur) { cur = { p: 32, chapter: '', lines: [] }; parsed.push(cur); } cur.lines.push(t); }
}
const memos = parsed.map((x) => ({ id: `m${x.p}`, page: x.p, chapter: x.chapter, text: x.lines.join(' ').trim(), myThought: '' })).filter((x) => x.text.length > 10);
const pageOf = (id) => Number(String(id).replace(/^m/, ''));
const overview = (body = '') => { const m = body.match(/##\s*개요\s*([\s\S]*?)(\n##\s|$)/); return (m ? m[1] : body).trim().replace(/\[\^[^\]]*\]/g, '').replace(/\s+/g, ' ').trim(); };

async function runCondition(label, book) {
  console.log(`\n\n######## 조건: ${label} (toc ${book.toc.length}개) ########`);
  const out = await planIngest({ memos, book, existingPages: [], contexts: [], profile: {} });
  // analyses: 메모별 키워드 추출 + anchor
  const analyses = out.analyses || [];
  const anchors = analyses.map((a) => a.tocAnchor || '미지정');
  const anchorDist = {}; for (const a of anchors) anchorDist[a] = (anchorDist[a] || 0) + 1;
  // patches: 개념 페이지(키워드 + 개요/디스크립션)
  const pages = [];
  for (const pt of out.patches || []) {
    const pd = pt.pageDraft; if (!pd || pt.action !== 'create') continue;
    const src = [...new Set((pd.sources || []).filter((s) => s.kind === 'memo').map((s) => pageOf(s.id)))].filter(Boolean);
    pages.push({ title: pd.title, keyConcepts: pd.keyConcepts || [], overview: overview(pd.body), pages: src.sort((a, b) => a - b) });
  }
  // 콘솔
  console.log(`\n[analyses ${analyses.length}개] 메모별 tocAnchor:`);
  for (const a of analyses) console.log(`  ${a.memoId} | anchor:${a.tocAnchor || '미지정'}(${a.anchorConfidence}) | keyConcepts:[${(a.keyConcepts || []).join(', ')}]`);
  console.log(`\n  anchor 분포: ${Object.entries(anchorDist).map(([k, v]) => `${k}×${v}`).join(' / ')}`);
  console.log(`  '미지정' 비율: ${((anchorDist['미지정'] || 0) / Math.max(1, analyses.length) * 100).toFixed(0)}%`);
  console.log(`\n[개념 페이지 ${pages.length}개 — 키워드 + 개요(디스크립션)]`);
  for (const p of pages) {
    console.log(`\n  • ${p.title}  [${p.keyConcepts.join(', ')}]  (p${p.pages.join(',p')})`);
    console.log(`    개요: ${p.overview}`);
  }
  return { label, analyses, anchorDist, missRate: (anchorDist['미지정'] || 0) / Math.max(1, analyses.length), pages };
}

const withToc = await runCondition('목차 있음 (알라딘/한국책)', { ...META, toc: META.toc });
const noToc = await runCondition('목차 없음 (Google Books/영어책 시나리오)', { ...META, toc: [] });

// ── 마크다운 리포트 ──
const fmtPages = (r) => r.pages.map((p) => `### ${p.title}\n- **키워드:** ${p.keyConcepts.join(', ')}\n- **출처:** p${p.pages.join(', p')}\n- **개요(디스크립션):** ${p.overview}`).join('\n\n');
const md = `# 목차(TOC) Ablation — 인제스트 키워드·디스크립션 품질 비교

> 책: ${META.title} / 발췌 ${memos.length}개 / 모델 ${process.env.INGEST_MODEL || 'gpt-4o'}
> 두 조건 모두 description류(책소개·책속에서·추천글)는 동일하게 주입. **toc만 차이.**

## 요약
| | 목차 있음 | 목차 없음 |
|---|---|---|
| 개념 페이지 수 | ${withToc.pages.length} | ${noToc.pages.length} |
| tocAnchor '미지정' 비율 | ${(withToc.missRate * 100).toFixed(0)}% | ${(noToc.missRate * 100).toFixed(0)}% |

---

## A. 목차 있음 (baseline)

${fmtPages(withToc)}

---

## B. 목차 없음 (영어책 시나리오)

${fmtPages(noToc)}
`;
const outPath = new URL('./runs/toc-ablation.md', import.meta.url);
await writeFile(outPath, md, 'utf-8');
console.log(`\n\n→ 리포트 저장: eval/runs/toc-ablation.md`);
console.log(`\n요약: 페이지수 ${withToc.pages.length}→${noToc.pages.length} | 미지정 ${(withToc.missRate * 100).toFixed(0)}%→${(noToc.missRate * 100).toFixed(0)}%`);
