// 실데이터 인제스트 (기존 메타 로직 그대로) + 위계 레이어
// 실행: node eval/protoRealMeta.mjs
// 핵심: lib/llm.js 의 planIngest 를 *그대로* 호출 → 책 메타(summary·toc·알라딘 책소개·
//       책속에서·추천글) 주입된 keyConcepts + 개요 생성. 추출/개요 프롬프트는 손대지 않음.
//       그 위에 "위계 군집화"만 추가(구조만, 내용 재생성 없음).
// 출력: eval/hier-tree.html 의 #data 블록 갱신.

import { readFile, writeFile } from 'node:fs/promises';
import { planIngest, setLLMTransport } from '../lib/llm.js';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

await loadDotEnvLocal(process.cwd());
// planIngest(개념 페이지+sources)는 gpt-4o 가 안정적. mini는 patches 과소생성 + sources 누락.
const INGEST_MODEL = process.env.INGEST_MODEL || 'gpt-4o';
const CLUSTER_MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
setLLMTransport(openaiNodeTransport({ model: INGEST_MODEL }));
const rawLLM = openaiNodeTransport({ model: CLUSTER_MODEL }); // 위계 군집화용(구조만)

// ─── 책 메타 (기존 로직이 소비하는 형태 — summary·toc·aladin) ───
const book = {
  id: 'book_design',
  title: '디자인의 디자인',
  author: '하라 켄야',
  summary: '하라 켄야가 디자인의 본질을 다시 묻는 책. 디자인을 "새로운 것을 만드는 일"이 아니라 "이미 알고 있다고 여기는 것을 미지의 것으로 되돌려 다시 보게 하는 일(RE-DESIGN)"로 재정의한다. 정보를 받는 사람의 머릿속에 구축되는 구조로 보는 "정보의 건축", 일상의 미지화, 미디어를 횡단하는 커뮤니케이션 디자인, 생활에 기초한 문명 비평으로서의 디자인을 다룬다.',
  toc: ['디자인이라는 것', 'RE-DESIGN — 21세기의 일상', '정보의 건축 그 가능성', '욕망의 에듀케이션', '일본의 디자인', '비주얼커뮤니케이션 디자인', '디자이너의 일'],
  aladin: {
    intro: '그래픽 디자이너 하라 켄야가 “디자인이란 무엇인가”라는 물음을 정면으로 다룬 디자인 사상서. 새로움의 생산이 아니라 익숙한 일상을 낯설게 되돌아보는 RE-DESIGN의 관점에서 디자인의 가능성을 탐색한다.',
    publisherIntro: '하라 켄야는 첨단 테크놀로지가 끊임없이 “신기한 과일”을 식탁에 올리듯 새로움만을 좇는 현대 디자인을 비판하고, 평범한 일상 속에 잠든 무수한 디자인의 가능성을 “미지화”를 통해 일깨운다. 정보는 대량 저장·고속 이동이 아니라 받는 사람의 머릿속에 구축되는 “정보의 건축”이며, 디자인은 미디어에 종속되지 않고 그 본질을 탐색하는 횡단적 커뮤니케이션이다. 나아가 디자인을 생활이라는 관점에 기초한 문명 비평이자, 증상이 아닌 병의 근원을 진단하는 의사의 일에 비유한다.',
    excerpts: '“익숙한 것을 미지의 것으로 재발견할 수 있는 감성 또한 똑같은 창조성이다.” / “새로운 시대는 우리가 이미 알고 있는 일상이 끊임없이 미지화되어 새롭게 등장하는 시대다.” / “정보의 건축은 그 정보를 접한 사람들의 머릿속에 구축되어 가는 것이다.”',
    recommend: '디자인을 ‘스타일링’이 아니라 ‘사고방식’으로 이해하게 해주는 책.',
  },
};

// ─── .md 파싱 ──────────────────────────────────────────────────
const MD = process.env.HOME + '/Library/Mobile Documents/iCloud~md~obsidian/Documents/Junseo/200 Literature/210 Books/디자인의 디자인_220308_191948.md';
const raw = await readFile(MD, 'utf-8');
const parsed = []; let cur = null;
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim(); const m = t.match(/^(\d+)\.\s*(.*)$/);
  if (m) { cur = { p: Number(m[1]), chapter: m[2] && m[2].length < 25 ? m[2] : '', lines: [] }; parsed.push(cur); if (m[2] && m[2].length >= 25) cur.lines.push(m[2]); }
  else if (t) { if (!cur) { cur = { p: 32, chapter: '', lines: [] }; parsed.push(cur); } cur.lines.push(t); }
}
const memos = parsed.map((x) => ({ id: `m${x.p}`, page: x.p, chapter: x.chapter, text: x.lines.join(' ').trim(), myThought: '' })).filter((x) => x.text.length > 10);
const pageOf = (memoId) => Number(String(memoId).replace(/^m/, ''));
console.log(`발췌 ${memos.length}개 → planIngest(기존 메타 로직) 호출...`);

// ─── 1) 기존 planIngest 그대로 ─────────────────────────────────
const out = await planIngest({ memos, book, existingPages: [], contexts: [], profile: {} });
const overview = (body = '') => { const m = body.match(/##\s*개요\s*([\s\S]*?)(\n##\s|$)/); return (m ? m[1] : body).trim().replace(/\[\^[^\]]*\]/g, '').replace(/\s+/g, ' ').trim(); };
// 1) patch 페이지 (메타 기반 개요 보유) — sources 로 메모 연결
const pages = []; const byTitle = {};
for (const pt of out.patches || []) {
  const pd = pt.pageDraft; if (!pd || pt.action !== 'create') continue;
  const src = [...new Set((pd.sources || []).filter((s) => s.kind === 'memo').map((s) => pageOf(s.id)))].filter(Boolean);
  const pg = { key: 'p' + (pages.length + 1), title: pd.title, keyConcepts: pd.keyConcepts || [], gloss: overview(pd.body), pages: src, src: 'patch' };
  pages.push(pg); byTitle[pd.title] = pg;
}
// 2) 커버리지 보강 — 어떤 패치에도 안 닿은 메모는 analyses(thesis+bookContextLink)로 페이지 생성/부착
let recovered = 0;
const covered = new Set(pages.flatMap((p) => p.pages));
for (const a of out.analyses || []) {
  const no = pageOf(a.memoId); if (covered.has(no)) continue;
  const title = (a.keyConcepts || [])[0] || (a.thesis || '').slice(0, 14) || '기타';
  let pg = byTitle[title];
  if (!pg) { pg = { key: 'p' + (pages.length + 1), title, keyConcepts: a.keyConcepts || [], gloss: [a.thesis, a.bookContextLink].filter(Boolean).join(' '), pages: [], src: 'analyses' }; pages.push(pg); byTitle[title] = pg; }
  pg.pages = [...new Set([...pg.pages, no])]; covered.add(no); recovered++;
}
pages.forEach((p) => p.pages.sort((x, y) => x - y));
console.log(`(patch 페이지 ${pages.filter((p) => p.src === 'patch').length} + analyses 보강 ${recovered}개 메모)`);
console.log(`→ 개념 페이지 ${pages.length}개 (메타 기반):`);
pages.forEach((p) => console.log(`   • ${p.title}  [${p.keyConcepts.join(', ')}]  p${p.pages.join(',p')}`));

// ─── 2) 위계 군집화 (구조만, 내용 재생성 없음. toc=숨은 척추) ──
async function gpt(user) { const r = await rawLLM({ system: '너는 개념들을 책의 주제 구조에 맞춰 묶는 사서다. JSON만.', user, temperature: 0.1 }); try { return JSON.parse(r); } catch { return {}; } }
const cl = await gpt(`[숨은 척추 — 참고만, 복붙 금지] 책 "${book.title}" 목차: ${book.toc.join(' · ')}
아래 개념 페이지들을 책의 실제 주제 구조를 참고해 상위 테마 3~6개로 묶어 2단 위계를 만들어라.
- 모든 개념을 빠짐없이 배정(고아 최소화). 테마 이름=아우르는 발생적 이름(목차 복붙·자식명 동일 금지).
개념: ${pages.map((p) => `${p.key}: ${p.title} — ${p.gloss.slice(0, 50)}`).join('\n')}
출력 JSON: {"themes":[{"name":"테마","childKeys":["p1","p2"]}]}`);

// ─── 트리 구성 ─────────────────────────────────────────────────
const byKey = Object.fromEntries(pages.map((p) => [p.key, p]));
const used = new Set();
const themes = (cl.themes || []).map((t) => ({
  title: t.name, kind: 'theme', summary: '', pages: [],
  children: (t.childKeys || []).filter((k) => byKey[k] && !used.has(k)).map((k) => { used.add(k); const p = byKey[k]; return { title: p.title, kind: 'leaf', summary: p.gloss, pages: p.pages, children: [] }; }),
})).filter((t) => t.children.length);
const orphans = pages.filter((p) => !used.has(p.key)).map((p) => ({ title: p.title, kind: 'leaf', summary: p.gloss, pages: p.pages, children: [] }));
const tree = { title: book.title, kind: 'root', summary: '', pages: [], children: [...themes, ...orphans] };

function show(n, d = 0) { console.log('  '.repeat(d) + (n.kind === 'theme' ? '▣ ' : n.kind === 'root' ? '■ ' : '• ') + n.title + (n.summary ? '  — ' + n.summary.slice(0, 54) + '…' : '')); (n.children || []).forEach((c) => show(c, d + 1)); }
console.log('\n===== 위계 트리 =====\n'); show(tree);
console.log(`\n개념 ${pages.length} | 테마 ${themes.length} | 고아 ${orphans.length}`);

// ─── HTML #data 갱신 ───────────────────────────────────────────
const memoMap = {}; for (const x of memos) memoMap[x.page] = { t: x.text, m: x.myThought, chapter: x.chapter || '' };
const dataJs = `// 자동 생성 (node eval/protoRealMeta.mjs) — 기존 planIngest(메타) + 위계\nwindow.DATA = ${JSON.stringify({ book: { title: book.title, author: book.author }, memos: memoMap, tree }, null, 1)};\n`;
const htmlPath = new URL('./hier-tree.html', import.meta.url);
let html = await readFile(htmlPath, 'utf-8');
html = html.replace(/<script id="data">[\s\S]*?<\/script>/, `<script id="data">\n${dataJs}</script>`);
await writeFile(htmlPath, html, 'utf-8');
console.log('\n→ eval/hier-tree.html #data 갱신 완료');
