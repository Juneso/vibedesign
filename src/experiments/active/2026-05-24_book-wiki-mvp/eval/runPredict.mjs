// 전이 채점 (RUBRIC-PREDICT · BKT-379) — "이해했다 = 새 상황을 설명/예측할 수 있다"
// 실행: node eval/runPredict.mjs
//
// 응답자(gpt-4o-mini)에게 위키 내용만 주고 전이 질문에 답하게 한 뒤 저지가 채점.
// 조건: PRED@node(대상 개념 노드만) / PRED@tree(트리 전체+오버레이) / flat(구조 없는 문장 리스트)
//   → tree−node 갭 = 구조·연결의 기여 / tree−flat 갭 = 구조가 같은 정보 대비 주는 이득
// 위키 소스: 디자인의 디자인 = v9 실산출(runs/hier-v9-1.json) · 나머지 3권 = 오라클 골든
//   (v9 미실행 책은 상한선 측정 — 골든이 곧 목표 트리)
// 출력: eval/runs/predict-1.md + predict-1.json

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
const llm = openaiNodeTransport({ model: MODEL });
async function ask({ system, user }) {
  const raw = await llm({ system, user });
  try { return JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; }
}

// ─── 발췌 로드 (페이지 → 원문) ───────────────────────────────────
const HOME = process.env.HOME;
const BOOKS_DIR = HOME + '/Library/Mobile Documents/iCloud~md~obsidian/Documents/Junseo/200 Literature/210 Books/';
function parseMd(raw, { defaultFirstPage = null } = {}) {
  const out = new Map(); let p = defaultFirstPage, buf = [];
  const flush = () => { if (p != null && buf.length) out.set(p, (out.get(p) ? out.get(p) + ' ' : '') + buf.join(' ').trim()); buf = []; };
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim(); if (!t) continue;
    if (/^\dㅣ/.test(t)) continue; // 장 마커(돈사것)
    const m = t.match(/^(\d+)\.\s*(.*)$/);
    if (m) { flush(); p = Number(m[1]); if (m[2] && m[2].length >= 25) buf.push(m[2]); }
    else buf.push(t);
  }
  flush();
  return out; // Map<page, text>
}
const quotes = {
  design: parseMd(await readFile(BOOKS_DIR + '디자인의 디자인_220308_191948.md', 'utf-8'), { defaultFirstPage: 32 }),
  'sandel-money': parseMd(await readFile(BOOKS_DIR + '돈으로 살 수 없는 것들_200905_171227.md', 'utf-8')),
  'sandel-justice': parseMd(await readFile(BOOKS_DIR + '정의란 무엇인가_200905_172120.md', 'utf-8')),
  zorba: parseMd(await readFile(BOOKS_DIR + '그리스인 조르바_230618_163748.md', 'utf-8')),
};

// ─── 위키 구조 ───────────────────────────────────────────────────
// 디자인의 디자인: v9 실산출 로드
const v9 = JSON.parse(await readFile(resolve(__dir, 'runs/hier-v9-1.json'), 'utf-8'));
const designWiki = {
  title: '디자인의 디자인',
  chapters: [...new Set(v9.snap.nodes.map((n) => n.chapter))],
  nodes: v9.snap.nodes.map((n) => ({ chapter: n.chapter, title: n.title, pages: n.memos.map((m) => m.p) })),
  overlay: v9.snap.overlay.map((l) => `${l.a} ↔ ${l.b}`),
};
// 나머지 3권: 오라클 골든 (golden/hier-oracle-3books.md 유래)
const moneyWiki = { title: '돈으로 살 수 없는 것들', chapters: ['서론: 시장과 도덕', '1. 새치기', '2. 인센티브', '3. 시장은 어떻게 도덕을 밀어내는가', '4. 삶과 죽음의 시장', '5. 명명권'], nodes: [
  { chapter: '서론: 시장과 도덕', title: '시장의 비판단성', pages: [33] },
  { chapter: '1. 새치기', title: '지불 능력', pages: [55] }, { chapter: '1. 새치기', title: '선물', pages: [64] }, { chapter: '1. 새치기', title: '줄서기의 도덕', pages: [66] },
  { chapter: '2. 인센티브', title: '벌금 대 요금', pages: [99, 103] }, { chapter: '2. 인센티브', title: '상품화 효과', pages: [108, 116, 130, 131] },
  { chapter: '3. 시장은 어떻게 도덕을 밀어내는가', title: '선물', pages: [146] }, { chapter: '3. 시장은 어떻게 도덕을 밀어내는가', title: '공정성과 부패', pages: [157] }, { chapter: '3. 시장은 어떻게 도덕을 밀어내는가', title: '비시장 규범 밀어내기', pages: [162, 166] },
  { chapter: '4. 삶과 죽음의 시장', title: '죽음의 상품화', pages: [193, 200] },
  { chapter: '5. 명명권', title: '효율성', pages: [246] }, { chapter: '5. 명명권', title: '상업주의의 침범', pages: [258] }, { chapter: '5. 명명권', title: '스카이박스화', pages: [275] },
], overlay: ['규범 밀어내기: 벌금 대 요금 ↔ 상품화 효과 ↔ 비시장 규범 밀어내기 (책의 중심 논지)', '선물(1장) ↔ 선물(3장)'] };
const justiceWiki = { title: '정의란 무엇인가', chapters: ['1강 옳은 일 하기', '4강 대리인 고용하기 — 시장과 도덕', '5강 칸트', '6강 롤스', '7강 소수집단우대정책', '8강 아리스토텔레스', '9강 충직 딜레마', '10강 정의와 공동선'], nodes: [
  { chapter: '1강 옳은 일 하기', title: '정의의 세 기준', pages: [41, 27, 28] }, { chapter: '1강 옳은 일 하기', title: '도덕적 사유', pages: [53, 54] },
  { chapter: '4강 대리인 고용하기 — 시장과 도덕', title: '시민의 의무', pages: [137, 142] }, { chapter: '4강 대리인 고용하기 — 시장과 도덕', title: '자유로운 선택', pages: [146, 149, 152] },
  { chapter: '5강 칸트', title: '의무와 경향성', pages: [178] }, { chapter: '5강 칸트', title: '정언 명령', pages: [182, 184] }, { chapter: '5강 칸트', title: '자율', pages: [188] }, { chapter: '5강 칸트', title: '필연성과 자유 영역', pages: [194] },
  { chapter: '6강 롤스', title: '계약의 도덕적 효력', pages: [219] }, { chapter: '6강 롤스', title: '차등 원칙', pages: [229] }, { chapter: '6강 롤스', title: '무지의 장막', pages: [230] },
  { chapter: '7강 소수집단우대정책', title: '법과 사회적 의지', pages: [251] }, { chapter: '7강 소수집단우대정책', title: '대학의 사명', pages: [260] },
  { chapter: '8강 아리스토텔레스', title: '목적론', pages: [286] },
  { chapter: '9강 충직 딜레마', title: '좋은 삶', pages: [319] }, { chapter: '9강 충직 딜레마', title: '부담을 감수하는 자아', pages: [325, 348] }, { chapter: '9강 충직 딜레마', title: '서사적 존재', pages: [326] }, { chapter: '9강 충직 딜레마', title: '집단 책임', pages: [344] },
  { chapter: '10강 정의와 공동선', title: '공동선', pages: [382] },
], overlay: ['좋은 삶/미덕: 정의의 세 기준 ↔ 목적론 ↔ 좋은 삶', '자유로운 선택 ↔ 자율 ↔ 무지의 장막'] };
const zorbaWiki = { title: '그리스인 조르바', chapters: [], nodes: [ // 목차 무용 → 평면 (폴백)
  { chapter: '', title: '자유', pages: [52, 167, 393, 470] }, { chapter: '', title: '관념과 삶', pages: [30, 118, 380, 432, 434] },
  { chapter: '', title: '처음 보는 눈', pages: [88, 99, 243] }, { chapter: '', title: '죽음', pages: [70, 296] },
  { chapter: '', title: '몸', pages: [66, 166] }, { chapter: '', title: '낱말의 위험', pages: [308] },
  { chapter: '', title: '깨어남', pages: [116] }, { chapter: '', title: '슬픔의 관능', pages: [164] },
  { chapter: '', title: '가르침과 배움', pages: [165] }, { chapter: '', title: '영혼', pages: [316] },
], overlay: ['처음 보는 눈 ↔ 미지화(디자인의 디자인)'] };
const WIKIS = { design: designWiki, 'sandel-money': moneyWiki, 'sandel-justice': justiceWiki, zorba: zorbaWiki };

// ─── 전이 질문 골든 (SSOT: RUBRIC-PREDICT.md) ────────────────────
const ITEMS = [
  { id: 1, book: 'sandel-money', concept: '비시장 규범 밀어내기', q: '헌혈에 5만원 사례금을 도입하면 헌혈 참여는 어떻게 될까?', expected: '늘지 않거나 줄 수 있다 — 금전 보상이 시민적 동기를 노동/거래 프레임으로 바꿔 밀어냄', ev: [162, 166, 99] },
  { id: 2, book: 'sandel-money', concept: '벌금 대 요금', q: '탄소배출권 거래제는 벌금인가 요금인가? 이 구분이 왜 중요한가?', expected: '거래 가능해지는 순간 도덕적 낙인이 요금으로 변질될 위험 — 제도의 목적·규범 파악이 선행돼야', ev: [103, 99, 116] },
  { id: 3, book: 'sandel-money', concept: '죽음의 상품화', q: '유명인 사망 시점을 맞추는 온라인 베팅 서비스는 어떤 논거로 비판할 수 있나?', expected: '타인 죽음에 대한 도박(말기환금과 동형) — 부패(변질) 논거', ev: [193, 200, 157] },
  { id: 4, book: 'sandel-justice', concept: '정언 명령', q: '말기 환자를 안심시키기 위한 선의의 거짓말은 칸트에게 허용되는가?', expected: '불허 — 결과가 아니라 준칙의 보편화 가능성이 기준. 거짓 약속 = 타인 욕구 위에 내 욕구 특권화', ev: [184, 182, 188] },
  { id: 5, book: 'sandel-justice', concept: '부담을 감수하는 자아', q: '"내가 태어나기 전의 일인데 왜 사과해야 하나"라는 전범국 후손의 항변에 9강 개념으로 답하면?', expected: '서사적·소속된 자아 — 선택하지 않은 연대·기억의 의무가 정체성에서 나온다', ev: [325, 326, 344] },
  { id: 6, book: 'design', concept: '미지화', q: "'새로운 의자를 디자인하라'와 '앉는다는 것을 다시 정의하라' — 하라 켄야가 더 디자인적이라 할 과제는? 왜?", expected: '후자 — 창조성은 신기함이 아니라 익숙한 것의 재발견(RE-DESIGN)', ev: [35, 38, 70] },
  { id: 7, book: 'zorba', concept: '처음 보는 눈', q: '조르바라면 10년째 똑같은 출근길을 어떻게 대할까?', expected: '매일 처음 보듯 — 세상의 처녀성 회복, 새로운 세상이 안 보이면 스스로 창조', ev: [99, 243, 88] },
  { id: 8, book: 'zorba', concept: '자유', q: '"경제적 자유를 얻으려고 10년간 모든 소비를 끊는 파이어족"은 조르바 기준으로 자유로운가?', expected: '회의적 — 자유는 축적이 아니라 탐욕(집착)을 버리는 능력. 더 높은 주인을 섬기는 노예근성일 수도', ev: [52, 393, 470] },
  { id: 9, book: 'cross', concept: '미지화 × 처음 보는 눈', q: '하라 켄야와 조르바가 공유하는 태도를 한 문장으로 — 그리고 둘의 차이는?', expected: '공유 = 익숙한 것을 처음 보듯(미지화/처녀성 회복). 차이 = 디자인적 사유 vs 몸으로 사는 것', evCross: [['design', 35], ['design', 70], ['zorba', 99], ['zorba', 243]] },
];

// ─── 컨텍스트 구성 ───────────────────────────────────────────────
const quoteOf = (book, p) => `(p${p}) ${quotes[book].get(p) || '[원문 누락]'}`;
function nodeCtx(book, title) {
  const nd = WIKIS[book].nodes.find((n) => n.title === title);
  if (!nd) throw new Error(`노드 없음: ${book}/${title}`);
  return `[개념] ${nd.title}${nd.chapter ? ` (${WIKIS[book].title} · ${nd.chapter})` : ` (${WIKIS[book].title})`}\n` + nd.pages.map((p) => quoteOf(book, p)).join('\n');
}
function treeCtx(book) {
  const w = WIKIS[book];
  const lines = [`■ ${w.title}`];
  const chapters = w.chapters.length ? w.chapters : [''];
  for (const ch of chapters) {
    if (ch) lines.push(`\n## ${ch}`);
    for (const nd of w.nodes.filter((n) => n.chapter === ch)) {
      lines.push(`\n### ${nd.title}`);
      for (const p of nd.pages) lines.push(quoteOf(book, p));
    }
  }
  if (w.overlay.length) lines.push(`\n## 개념 연결(오버레이)\n${w.overlay.map((o) => `- ${o}`).join('\n')}`);
  return lines.join('\n');
}
function flatCtx(book) {
  const w = WIKIS[book];
  const pages = [...new Set(w.nodes.flatMap((n) => n.pages))].sort((a, b) => a - b);
  return `${w.title} — 수집 문장 목록:\n` + pages.map((p) => quoteOf(book, p)).join('\n');
}
function contextsFor(item) {
  if (item.book !== 'cross') {
    return { node: nodeCtx(item.book, itemNodeTitle(item)), tree: treeCtx(item.book), flat: flatCtx(item.book) };
  }
  return {
    node: nodeCtx('design', '미지화') + '\n\n' + nodeCtx('zorba', '처음 보는 눈'),
    tree: treeCtx('design') + '\n\n' + treeCtx('zorba'),
    flat: flatCtx('design') + '\n\n' + flatCtx('zorba'),
  };
}
function itemNodeTitle(item) {
  // v9 트리(디자인)의 노드 제목은 lift 결과라 오라클 개념명과 다를 수 있음 → 페이지로 탐색
  if (WIKIS[item.book].nodes.some((n) => n.title === item.concept)) return item.concept;
  const nd = WIKIS[item.book].nodes.find((n) => n.pages.includes(item.ev[0]));
  if (!nd) throw new Error(`개념 탐색 실패: ${item.concept}`);
  return nd.title;
}
const evQuotes = (item) => (item.ev ? item.ev.map((p) => quoteOf(item.book, p)) : item.evCross.map(([b, p]) => quoteOf(b, p))).join('\n');

// ─── 응답자 · 저지 ───────────────────────────────────────────────
async function respond(ctx, q) {
  return (await ask({
    system: `아래 [자료]만 근거로 질문에 답하라. 자료 밖 지식·상식 사용 금지. 근거 문장을 (pXX)로 인용하라. 자료로 답할 수 없으면 "자료 부족"이라고 말하라. 3~5문장. JSON: {"answer": "..."}`,
    user: `[자료]\n${ctx}\n\n[질문]\n${q}`,
  })).answer || '';
}
async function judge(item, answer) {
  const out = await ask({
    system: `전이 질문 응답을 채점한다. 각 축 1~5 정수. JSON: {"grounding": n, "thesis": n, "transfer": n, "comment": "한 줄"}
- grounding(근거성): 답이 제공 자료의 인용에 정박했는가. 자료 밖 지식 의존 = 감점.
- thesis(논지 정합): 기대 논지와 방향 일치.
- transfer(전이 성공): 새 상황의 구체 요소에 개념을 실제 적용했는가. 개념 정의 재진술만 = 감점.`,
    user: `[질문] ${item.q}\n[기대 논지] ${item.expected}\n[핵심 근거 원문]\n${evQuotes(item)}\n\n[응답]\n${answer}`,
  });
  const n = (x) => Math.max(1, Math.min(5, Math.round(Number(x) || 1)));
  return { grounding: n(out.grounding), thesis: n(out.thesis), transfer: n(out.transfer), comment: out.comment || '' };
}

// ─── 실행 ───────────────────────────────────────────────────────
const CONDS = ['node', 'tree', 'flat'];
const rows = [];
for (const item of ITEMS) {
  const ctxs = contextsFor(item);
  const row = { id: item.id, book: item.book, concept: item.concept, q: item.q, conds: {} };
  for (const c of CONDS) {
    const answer = await respond(ctxs[c], item.q);
    const score = await judge(item, answer);
    row.conds[c] = { answer, ...score, total: (score.grounding + score.thesis + score.transfer) / 3 };
    console.log(`[${item.id}·${c}] G${score.grounding} T${score.thesis} X${score.transfer} — ${score.comment.slice(0, 60)}`);
  }
  rows.push(row);
}

const mean = (c, k) => rows.reduce((s, r) => s + r.conds[c][k], 0) / rows.length;
const f = (x) => x.toFixed(2);
let md = `# 전이 채점 v1 (RUBRIC-PREDICT · BKT-379)

> 모델 ${MODEL} (응답자·저지 동일) · 아이템 ${ITEMS.length}건 · 조건 3종
> 위키 소스: 디자인의 디자인 = **v9 실산출**(hier-v9-1.json) · 나머지 3권 = 오라클 골든(상한선)
> ⚠ v1 한계: 저지 미캘리브레이션(judge-calib 미적용), 대조군 A(랜덤 문장) 미실행.

## 조건별 평균 (1~5)

| 조건 | 근거성 | 논지 정합 | 전이 성공 | 종합 |
|---|---|---|---|---|
| PRED@node (노드 단독) | ${f(mean('node', 'grounding'))} | ${f(mean('node', 'thesis'))} | ${f(mean('node', 'transfer'))} | **${f(mean('node', 'total'))}** |
| PRED@tree (트리+오버레이) | ${f(mean('tree', 'grounding'))} | ${f(mean('tree', 'thesis'))} | ${f(mean('tree', 'transfer'))} | **${f(mean('tree', 'total'))}** |
| flat (구조 없는 문장 리스트) | ${f(mean('flat', 'grounding'))} | ${f(mean('flat', 'thesis'))} | ${f(mean('flat', 'transfer'))} | **${f(mean('flat', 'total'))}** |

- 구조·연결의 기여 (tree − node): **${f(mean('tree', 'total') - mean('node', 'total'))}**
- 구조의 이득, 같은 정보 대비 (tree − flat): **${f(mean('tree', 'total') - mean('flat', 'total'))}**

## 아이템별

| # | 개념 | node | tree | flat | 질문 |
|---|---|---|---|---|---|
${rows.map((r) => `| ${r.id} | ${r.concept} | ${f(r.conds.node.total)} | ${f(r.conds.tree.total)} | ${f(r.conds.flat.total)} | ${r.q.slice(0, 40)}… |`).join('\n')}

## 응답 전문

${rows.map((r) => `### #${r.id} ${r.concept} — ${r.q}\n\n${CONDS.map((c) => `**${c}** (G${r.conds[c].grounding}/T${r.conds[c].thesis}/X${r.conds[c].transfer} · ${r.conds[c].comment})\n> ${r.conds[c].answer.replace(/\n/g, ' ')}`).join('\n\n')}`).join('\n\n')}
`;
await writeFile(resolve(__dir, 'runs/predict-1.md'), md);
await writeFile(resolve(__dir, 'runs/predict-1.json'), JSON.stringify({ model: MODEL, rows }, null, 2));
console.log(`\n═══ 전이 채점: node ${f(mean('node', 'total'))} · tree ${f(mean('tree', 'total'))} · flat ${f(mean('flat', 'total'))} ═══`);
console.log('→ eval/runs/predict-1.md');
