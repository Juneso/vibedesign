// 실데이터 인제스트 — Junseo의 "디자인의 디자인" 발췌 .md 를 그대로 넣어 위계 생성.
// 실행: node eval/protoReal.mjs
// 로직 = v4 (목차 숨은 척추, 구체 키워드 포착 + 동의어만 병합, 전체 leaf 단일 군집화).
// 출력 = eval/hier-data.js  (hier-tree.html 이 읽음)

import { readFile, writeFile } from 'node:fs/promises';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

await loadDotEnvLocal(process.cwd());
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
const KEY = process.env.OPENAI_API_KEY;
const llm = openaiNodeTransport({ model: MODEL });

async function embed(text) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  const d = await r.json(); if (!r.ok) throw new Error(d?.error?.message || 'embed'); return d.data[0].embedding;
}
const cos = (a, b) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return s / (Math.sqrt(na) * Math.sqrt(nb)); };

// ─── 책 (toc = 숨은 척추) ──────────────────────────────────────
const book = {
  title: '디자인의 디자인', author: '하라 켄야', category: '예술/디자인 > 디자인 이론',
  toc: ['디자인이라는 사상의 기원', 'RE-DESIGN: 21세기의 일상', '정보의 건축이라는 사고', '일상의 미지화', '커뮤니케이션과 미디어', '비주얼커뮤니케이션 디자인', '디자이너라는 직업'],
  // 책 메타(소개·관점) — 인제스트 품질·균질화 방지용 주입 (BKT-234). 개념을 책의 프레이밍에 맞춰 정리.
  about: '하라 켄야는 디자인을 "새로운 것을 만드는 일"이 아니라 "이미 아는 것을 미지의 것으로 되돌려 다시 보게 하는 일(RE-DESIGN)"로 본다. 핵심 관점: ①일상의 미지화 — 익숙한 것을 낯설게 재발견하는 감성이 곧 창조성. ②정보의 건축 — 정보는 양·속도가 아니라 받는 사람 머릿속에 구축되는 구조이며 음미 가능성이 중요. ③미디어를 횡단하는 커뮤니케이션 디자인 — 미디어에 종속되지 않고 본질을 탐색. ④디자인은 생활에 기초한 문명 비평이자, 문제의 근원을 진단하는 의사 같은 역할.',
};

// ─── .md 파싱: "쪽수." 마커로 블록 분리, 발췌문만 추출 ─────────
const MD = process.env.HOME + '/Library/Mobile Documents/iCloud~md~obsidian/Documents/Junseo/200 Literature/210 Books/디자인의 디자인_220308_191948.md';
const raw = await readFile(MD, 'utf-8');
const memos = [];
let cur = null;
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  const m = t.match(/^(\d+)\.\s*(.*)$/);
  if (m) { cur = { p: Number(m[1]), chapter: m[2] && m[2].length < 25 ? m[2] : '', lines: [] }; memos.push(cur); if (m[2] && m[2].length >= 25) cur.lines.push(m[2]); }
  else if (t) { if (!cur) { cur = { p: 32, chapter: '', lines: [] }; memos.push(cur); } cur.lines.push(t); }
}
for (const x of memos) { x.text = x.lines.join(' ').trim(); x.my = ''; delete x.lines; }
const real = memos.filter((x) => x.text.length > 10);
console.log(`파싱된 발췌 ${real.length}개: ${real.map((x) => 'p' + x.p).join(', ')}`);

// ─── 트리 ──────────────────────────────────────────────────────
let SEQ = 0; const id = () => `n${++SEQ}`;
const nodes = new Map(); const log = [];
const root = { id: id(), title: book.title, parentId: null, level: 0, kind: 'root', sources: [], emb: null };
nodes.set(root.id, root);
const concepts = () => [...nodes.values()].filter((n) => n.kind === 'concept');
const childrenOf = (pid) => [...nodes.values()].filter((n) => n.parentId === pid);
const ancestry = (n) => { const path = []; let c = n; while (c && c.parentId) { c = nodes.get(c.parentId); if (c && c.kind === 'concept') path.unshift(c.title); } return path.join(' › ') || '(최상위)'; };
function addConcept(title, parentId, emb, gloss) {
  const lvl = nodes.get(parentId).level + 1;
  const n = { id: id(), title, parentId, level: lvl, kind: 'concept', sources: [], emb, gloss };
  nodes.set(n.id, n); return n;
}
const SYS = '너는 독서 발췌를 "책별 개념 위계 트리"에 점진적으로 끼워넣는 사서다. 보이는 노드는 오직 발췌에서 나온 개념뿐 — 책 목차는 참고용 숨은 척추일 뿐 절대 노드로 만들지 않는다. 같은 개념은 병합하고 새 상위개념을 남발하지 않는다. JSON만.';

async function extract(memo) {
  const prompt = `[발췌 (p${memo.p}${memo.chapter ? ', 장:' + memo.chapter : ''})]\n${memo.text}\n\n이 발췌의 **가장 핵심 개념 딱 1개**만 뽑아라. 두 개로 쪼개지 마라(한 발췌 = 한 개념). 측면·예시·효과는 그 한 개념에 포함.\n⚠ "디자인"·"정보"·"미디어"처럼 너무 일반적인 단어 금지 — 이 발췌만의 구체적 키워드로.\n출력 JSON: {"concepts":[{"name":"짧은 명사구","gloss":"한 줄 설명"}]}`;
  const r = await llm({ system: SYS, user: prompt, temperature: 0.1 });
  try { return (JSON.parse(r).concepts || []).slice(0, 1); } catch { return []; }
}
async function place(memo, c, cand) {
  const existing = concepts().map((n) => `${n.id} | ${n.title}`).join('\n') || '(없음)';
  const prompt = `[숨은 척추 — 참고만] 책 ${book.title} 목차: ${book.toc.join(' · ')}
[새 개념] ${c.name} — ${c.gloss}
[같은 개념 후보(유사도 상위)]
${cand.length ? cand.map((x) => `${x.id} | ${x.node.title} (${x.sim.toFixed(2)})`).join('\n') : '(없음)'}
[현재 개념들]
${existing}
판단: op="merge"는 후보가 **같은 한 단어로 부를 같은 개념**일 때만(관련/인접은 attach). op="attach"는 새 leaf, targetId는 항상 "${root.id}"(위계는 나중 군집화가 만든다).
출력 JSON: {"op":"merge|attach","targetId":"n?","reason":"한 줄"}`;
  const r = await llm({ system: SYS, user: prompt, temperature: 0.1 });
  try { return JSON.parse(r); } catch { return { op: 'attach', targetId: root.id, reason: 'parse-fail' }; }
}

// Phase 1: 포착
log.push('[Phase0] 목차=숨은 척추(노드 없음). root=책.');
for (const memo of real) {
  for (const c of await extract(memo)) {
    const emb = await embed(`${c.name}: ${c.gloss}`);
    const cand = concepts().map((n) => ({ id: n.id, node: n, sim: cos(emb, n.emb) })).sort((a, b) => b.sim - a.sim).slice(0, 3).filter((x) => x.sim > 0.3);
    const d = await place(memo, c, cand);
    if (d.op === 'merge' && nodes.get(d.targetId)?.kind === 'concept') {
      nodes.get(d.targetId).sources.push(memo.p);
      log.push(`[포착] p${memo.p} "${c.name}" → 병합 ${d.targetId} ${nodes.get(d.targetId).title}`);
    } else {
      const n = addConcept(c.name, root.id, emb, c.gloss); n.sources.push(memo.p);
      log.push(`[포착] p${memo.p} "${c.name}" → 신규 ${n.id}`);
    }
  }
}

// Phase 1.5: 임베딩 중복 제거 (남은 근접 중복 leaf 자동 병합)
{
  const DUP = 0.82; let merged = 0;
  for (let i = 0; i < concepts().length; i++) {
    const a = concepts()[i]; if (!a.emb) continue;
    for (const b of concepts()) {
      if (b === a || !b.emb || b.parentId !== a.parentId) continue;
      if (cos(a.emb, b.emb) >= DUP) { // b를 a로 흡수
        a.sources.push(...b.sources); nodes.delete(b.id); merged++;
        log.push(`[중복제거] "${b.title}" → "${a.title}" (sim≥${DUP})`);
      }
    }
  }
  if (merged) log.push(`[중복제거] ${merged}건 흡수`);
}

// Phase 2: 단일 군집화 (전원 배정)
{
  const leaves = concepts();
  const prompt = `[숨은 척추 — 참고만, 복붙 금지] 책 "${book.title}" 목차: ${book.toc.join(' · ')}
독자가 수집한 개념들을 책의 실제 주제 구조를 참고해 상위 테마 3~6개로 묶어 2단 위계를 만들어라.
- 모든 개념을 빠짐없이 어느 테마엔가 배정하라. 고아(최상위 잔류)는 정말 어디에도 안 맞는 1개 이하만 허용.
- 테마 이름=아우르는 발생적 이름(목차 복붙·자식명 동일 금지).
개념:
${leaves.map((k) => `${k.id}: ${k.title} — ${k.gloss || ''}`).join('\n')}
출력 JSON: {"themes":[{"name":"테마","childIds":["n?","n?"]}]}`;
  const r = await llm({ system: SYS, user: prompt, temperature: 0.1 });
  let out; try { out = JSON.parse(r); } catch { out = { themes: [] }; }
  for (const t of out.themes || []) {
    let parent = root;
    if (t.name && t.name.trim()) { parent = addConcept(t.name.trim(), root.id, null, '테마'); log.push(`[군집] 테마 "${t.name}"(${parent.id})`); }
    for (const cid of t.childIds || []) { const leaf = nodes.get(cid); if (leaf && leaf.kind === 'concept' && leaf.parentId === root.id) { leaf.parentId = parent.id; leaf.level = parent.level + 1; } }
  }
  // 잔여 고아 → 베스트 테마로 강제 배정
  const themes = concepts().filter((n) => childrenOf(n.id).length);
  const orphans = concepts().filter((n) => n.parentId === root.id && !childrenOf(n.id).length);
  if (orphans.length && themes.length) {
    const r2 = await llm({ system: SYS, user: `다음 개념들을 가장 알맞은 기존 테마에 배정하라(새 테마 만들지 마라).
테마: ${themes.map((t) => `${t.id}:${t.title}`).join(' / ')}
개념: ${orphans.map((o) => `${o.id}:${o.title}`).join(' / ')}
출력 JSON: {"assign":[{"id":"n?","themeId":"n?"}]}`, temperature: 0.1 });
    let a2; try { a2 = JSON.parse(r2); } catch { a2 = { assign: [] }; }
    for (const x of a2.assign || []) { const leaf = nodes.get(x.id), th = nodes.get(x.themeId); if (leaf && th && leaf.parentId === root.id && childrenOf(th.id).length >= 0 && th.kind === 'concept') { leaf.parentId = th.id; leaf.level = th.level + 1; log.push(`[고아배정] "${leaf.title}" → "${th.title}"`); } }
  }
}

// ─── Phase 3: 개념마다 책 내용 기반 한 문장 정리 (기존 인제스트의 '개요') ──
const memoText = {}; for (const x of real) memoText[x.p] = x.text;
async function summarize(node) {
  const kids = childrenOf(node.id);
  if (kids.length) { // 테마: 자식 정리를 한 문장으로 묶음
    const childLines = kids.map((k) => `- ${k.title}: ${k.summary || k.gloss || ''}`).join('\n');
    const r = await llm({ system: SYS, user: `책 "${book.title}"의 핵심 관점: ${book.about}\n\n상위 테마 "${node.title}" 아래 개념들이다. 이들을 아우르며 **이 테마가 책의 사상에서 어떤 자리를 차지하는지** 한 문장으로 정리하라(책 관점 활용, 사실 날조 금지).\n${childLines}\n출력 JSON: {"summary":"한 문장"}`, temperature: 0.3 });
    try { node.summary = JSON.parse(r).summary; } catch { node.summary = ''; }
  } else { // leaf: 발췌(앵커) + 책 메타로 개념을 책 사상 안에 자리매겨 설명 (BKT-234 품질)
    const src = node.sources.map((p) => `p${p}: ${memoText[p]}`).join('\n');
    const r = await llm({ system: SYS, user: `[책 맥락 — 이 개념을 책의 사상 안에 자리매기는 데 적극 활용하라]
책: ${book.title} (${book.author}) / 분류: ${book.category}
책의 핵심 관점: ${book.about}
목차 흐름: ${book.toc.join(' · ')}

개념 "${node.title}"의 **위키 개요를 2문장**으로 써라. 사용자가 자기 발췌의 단순 반복으로 느끼면 실패다 — 책 맥락으로 이해를 더해라.
- 1문장: 이 개념이 무엇인지 (발췌가 앵커).
- 2문장: 이 개념이 이 책의 핵심 사상(미지화·정보의 건축·RE-DESIGN·문명 비평 등)과 어떻게 연결되고 왜 중요한지 — 책 관점에서.
단, 이 책의 실제 관점을 벗어난 사실 날조 금지. 키워드 나열 금지.
[앵커 발췌]
${src}
출력 JSON: {"summary":"2문장"}`, temperature: 0.3 });
    try { node.summary = JSON.parse(r).summary; } catch { node.summary = ''; }
  }
}
// leaf 먼저(자식 정리가 테마 정리에 쓰이므로) → 테마
for (const n of concepts()) if (!childrenOf(n.id).length) await summarize(n);
for (const n of concepts()) if (childrenOf(n.id).length) await summarize(n);

// ─── 출력: 콘솔 트리 + HTML ────────────────────────────────────
function render(pid = root.id, depth = 0) {
  const n = nodes.get(pid); const src = n.sources.length ? `  ·p${n.sources.join(',p')}` : '';
  console.log(`${'  '.repeat(depth)}${n.kind === 'root' ? '■' : '•'} ${n.title}${src}`);
  for (const k of childrenOf(pid)) render(k.id, depth + 1);
}
console.log('\n===== 실데이터 결과 트리 =====\n'); render();
console.log(`\n개념 ${concepts().length} | 발췌 ${real.length} | 병합 ${log.filter((l) => l.includes('병합')).length}회`);
console.log('\n===== 로그 =====\n' + log.join('\n'));

function exportNode(n) {
  const kids = childrenOf(n.id);
  return { title: n.title, kind: n.kind === 'root' ? 'root' : (kids.length ? 'theme' : 'leaf'), summary: n.summary || '', pages: [...n.sources], children: kids.map(exportNode) };
}
const memoMap = {}; for (const x of real) memoMap[x.p] = { t: x.text, m: x.my, chapter: x.chapter || '' };
const data = `// 자동 생성 (node eval/protoReal.mjs) — 실데이터 인제스트 결과\nwindow.DATA = ${JSON.stringify({ book: { title: book.title, author: book.author }, memos: memoMap, tree: exportNode(root) }, null, 1)};\n`;
// hier-tree.html 의 <script id="data"> 블록만 갈아끼움 (자체 완결 단일 파일 유지)
const htmlPath = new URL('./hier-tree.html', import.meta.url);
let html = await readFile(htmlPath, 'utf-8');
html = html.replace(/<script id="data">[\s\S]*?<\/script>/, `<script id="data">\n${data}</script>`);
await writeFile(htmlPath, html, 'utf-8');
console.log('\n→ eval/hier-tree.html #data 블록 갱신 완료 (단일 파일)');
