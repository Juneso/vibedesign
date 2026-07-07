// v9 동화 우선 인제스트 — 4권 확장 러너 (BKT-378)
// 실행: node eval/runHierV9Books.mjs [money|justice|zorba|all]   (기본 all = 3권; design은 runHierV9.mjs)
// 각 책: 도착 순서 3종(원순서/시드7/42) → 온라인+통합 → 수렴 안정성 + 오라클 일치
// 조르바 = 목차 무용(toc=[]) 폴백 + v9.1 상향 승격 테스트베드
// 출력: eval/runs/hier-v9-{key}.md + hier-v9-{key}-{n}.json

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';
import { createEngine } from './lib/hierV9Engine.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
const KEY = process.env.OPENAI_API_KEY;
const llm = openaiNodeTransport({ model: MODEL });
async function embed(text) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || 'embed fail');
  return d.data[0].embedding;
}

// ─── 발췌 파서 (runPredict.mjs 와 동일 규칙) ─────────────────────
const BOOKS_DIR = process.env.HOME + '/Library/Mobile Documents/iCloud~md~obsidian/Documents/Junseo/200 Literature/210 Books/';
function parseMd(raw, { defaultFirstPage = null, chapterMarkers = false } = {}) {
  const memos = []; let cur = null; let curCh = chapterMarkers ? 0 : null; // 마커 이전 = 서론(0)
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim(); if (!t) continue;
    const mk = t.match(/^(\d)ㅣ/); // 독자가 직접 쓴 장 마커(돈사것) — 앱의 memo.chapter 필드에 해당
    if (mk) { if (chapterMarkers) curCh = Number(mk[1]); continue; }
    const m = t.match(/^(\d+)\.\s*(.*)$/);
    if (m) { cur = { p: Number(m[1]), lines: [], ch: curCh }; memos.push(cur); if (m[2] && m[2].length >= 25) cur.lines.push(m[2]); }
    else if (cur) cur.lines.push(t);
    else if (defaultFirstPage != null) { cur = { p: defaultFirstPage, lines: [], ch: curCh }; memos.push(cur); cur.lines.push(t); }
    // defaultFirstPage 없으면 페이지 이전 블록(독자 서두 메모)은 스킵 — 페이지 근거가 없어 부착 불가
  }
  return memos.map((x) => ({ p: x.p, text: x.lines.join(' ').trim(), my: '', anchorCh: x.ch })).filter((x) => x.text.length > 10);
}

// ─── 책 레지스트리 (목차·오라클 = golden/hier-oracle-3books.md 유래) ──
const BOOKS = {
  money: {
    md: '돈으로 살 수 없는 것들_200905_171227.md',
    parseOpts: { chapterMarkers: true },
    book: {
      title: '돈으로 살 수 없는 것들', author: '마이클 샌델',
      toc: ['서론: 시장과 도덕', '새치기', '인센티브', '시장은 어떻게 도덕을 밀어내는가', '삶과 죽음의 시장', '명명권'],
      summary: '시장의 도덕적 한계를 묻는 책. 시장 가치가 비시장 규범(줄서기·시민의 의무·선물·생명)을 밀어내고 재화의 의미를 변질시키는 사례들을 통해, 어떤 재화를 상품화해선 안 되는지 논한다.',
    },
    oracle: {
      chapters: { 33: [0], 55: [1], 64: [1], 66: [1], 99: [2], 103: [2], 108: [2], 116: [2], 130: [2], 131: [2], 146: [3], 157: [3], 162: [3], 166: [3], 193: [4], 200: [4], 246: [5], 258: [5], 275: [5] },
      mustLink: [[99, 103], [162, 166], [193, 200]],
      cannotLink: [[55, 64], [64, 66], [246, 258], [146, 157]],
    },
  },
  justice: {
    md: '정의란 무엇인가_200905_172120.md',
    book: {
      title: '정의란 무엇인가', author: '마이클 샌델',
      // 레포에 목차 데이터 없음 → 실제 한국어판 10강 목차 (알라딘 취득 전 임시)
      toc: ['옳은 일 하기', '최대 행복 원칙 — 공리주의', '우리는 우리 자신을 소유하는가 — 자유지상주의', '대리인 고용하기 — 시장과 도덕', '중요한 것은 동기다 — 이마누엘 칸트', '평등 옹호 — 존 롤스', '소수집단우대정책 논쟁', '누가 어떤 자격을 가졌는가 — 아리스토텔레스', '우리는 서로에게 무엇을 빚지고 있는가 — 충직 딜레마', '정의와 공동선'],
      summary: '정의를 판단하는 세 기준(복지 극대화·자유 존중·미덕)을 공리주의, 자유지상주의, 칸트, 롤스, 아리스토텔레스를 통해 검토하고, 좋은 삶에 대한 판단을 회피하지 않는 공동선의 정치를 제안한다.',
    },
    oracle: {
      chapters: { 27: [0], 28: [0], 41: [0], 53: [0], 54: [0], 137: [3], 142: [3], 146: [3], 149: [3], 152: [3], 178: [4], 182: [4], 184: [4], 188: [4], 194: [4], 219: [5], 229: [5], 230: [5], 251: [6], 260: [6], 286: [7], 319: [7, 8], 325: [8], 326: [8], 344: [8], 348: [8], 382: [9] },
      mustLink: [[53, 54], [137, 142], [182, 184], [325, 348]],
      cannotLink: [[229, 230], [188, 194], [326, 344], [27, 53]],
    },
  },
  zorba: {
    md: '그리스인 조르바_230618_163748.md',
    book: {
      title: '그리스인 조르바', author: '니코스 카잔차키스',
      toc: [], // 목차 무용(소설) → 폴백: 평면 + 상향 승격 + 오버레이
      summary: '책과 관념 속에 사는 화자("대장")와 몸으로 사는 자유인 조르바의 대화. 자유, 죽음, 관념과 삶의 대비, 익숙한 세상을 처음 보는 눈을 다룬다.',
    },
    oracle: {
      chapters: {}, // 부착 채점 없음
      mustLink: [[52, 393], [99, 243], [70, 296], [30, 118]],
      cannotLink: [[52, 88], [66, 70], [308, 316]],
    },
  },
};

function mulberry32(seed) { return function () { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffled(arr, seed) { const a = arr.slice(); const rnd = mulberry32(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const pct = (x) => (x * 100).toFixed(0) + '%';
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

async function runBook(key) {
  const cfg = BOOKS[key];
  const memosBase = parseMd(await readFile(BOOKS_DIR + cfg.md, 'utf-8'), cfg.parseOpts || {});
  console.log(`\n════ ${cfg.book.title} — 메모 ${memosBase.length}개 · 목차 ${cfg.book.toc.length || '없음(폴백)'} ════`);
  const specs = [
    { name: 'run1-orig', memos: memosBase },
    { name: 'run2-seed7', memos: shuffled(memosBase, 7) },
    { name: 'run3-seed42', memos: shuffled(memosBase, 42) },
  ];
  let sharedCache = null;
  const results = [];
  for (const spec of specs) {
    const t0 = Date.now(); const logs = [];
    const eng = createEngine({ llm, embed, book: cfg.book, log: (s) => { logs.push(s); } });
    if (sharedCache) Object.assign(eng.cache, sharedCache); else sharedCache = eng.cache;
    for (const m of spec.memos) await eng.ingest(m);
    const digest = await eng.consolidate();
    results.push({ name: spec.name, rel: eng.relations(), tree: eng.renderTree(), digest, snap: eng.snapshot(), logs, sec: Math.round((Date.now() - t0) / 1000) });
    console.log(`  [${spec.name}] ${results.at(-1).sec}s · 다이제스트 ${digest.length}건`);
  }

  // 안정성
  const pairKeys = Object.keys(results[0].rel);
  const agreement = (a, b) => pairKeys.reduce((s, k) => s + (a[k] === b[k] ? 1 : 0), 0) / pairKeys.length;
  const jaccard = (a, b) => {
    const sa = new Set(pairKeys.filter((k) => a[k] !== 'none')), sb = new Set(pairKeys.filter((k) => b[k] !== 'none'));
    const uni = new Set([...sa, ...sb]).size;
    return uni ? [...sa].filter((k) => sb.has(k)).length / uni : 1;
  };
  const pairsOf = [[0, 1], [0, 2], [1, 2]];
  const agr = pairsOf.map(([i, j]) => agreement(results[i].rel, results[j].rel));
  const jac = pairsOf.map(([i, j]) => jaccard(results[i].rel, results[j].rel));

  // 오라클
  const score = (r) => {
    const chOf = new Map(), nodeOf = new Map(), parentOf = new Map();
    for (const nd of r.snap.nodes) for (const m of nd.memos) { chOf.set(m.p, nd.chapterIdx); nodeOf.set(m.p, nd.id); parentOf.set(m.p, nd.parentId); }
    const linked = (a, b) => nodeOf.get(a) && (nodeOf.get(a) === nodeOf.get(b) ||
      (parentOf.get(a) && parentOf.get(a) === parentOf.get(b))); // 같은 노드 or 같은 승격 부모
    let ok = 0, wrong = [];
    const entries = Object.entries(cfg.oracle.chapters);
    for (const [p, allow] of entries) {
      const got = chOf.get(Number(p));
      if (got != null && allow.includes(got)) ok++;
      else wrong.push(`p${p}→${got == null ? '미분류' : cfg.book.toc[got]}(기대 ${allow.map((i) => cfg.book.toc[i]).join('|')})`);
    }
    const mlOk = cfg.oracle.mustLink.filter(([a, b]) => linked(a, b)).length;
    const clBad = cfg.oracle.cannotLink.filter(([a, b]) => nodeOf.get(a) && nodeOf.get(a) === nodeOf.get(b)).length; // cannot-link는 동일 노드(병합)만 위반
    return { ok, n: entries.length, wrong, mlOk, mlN: cfg.oracle.mustLink.length, clBad, clN: cfg.oracle.cannotLink.length };
  };
  const oracle = results.map(score);
  const promoted = results[0].snap.nodes.filter((n) => n.virtual).length;

  const md = `# 위계 인제스트 v9 — ${cfg.book.title}

> 모델 ${MODEL} · 메모 ${memosBase.length}개 · ${cfg.book.toc.length ? `목차 ${cfg.book.toc.length}장` : '**목차 없음 → 평면 + v9.1 상향 승격 폴백**'} · 3회 실행(원순서 + 시드 7, 42)

## 안정성

| 지표 | run1↔2 | run1↔3 | run2↔3 | 평균 |
|---|---|---|---|---|
| 관계 라벨 일치율 | ${pct(agr[0])} | ${pct(agr[1])} | ${pct(agr[2])} | **${pct(avg(agr))}** |
| 관계쌍 자카드 | ${pct(jac[0])} | ${pct(jac[1])} | ${pct(jac[2])} | **${pct(avg(jac))}** |

## 오라클 일치

| run | 부착 | must-link | cannot-link 위반 | 오답 |
|---|---|---|---|---|
${results.map((r, i) => `| ${r.name} | ${cfg.book.toc.length ? `${oracle[i].ok}/${oracle[i].n}` : '—'} | ${oracle[i].mlOk}/${oracle[i].mlN} | ${oracle[i].clBad}/${oracle[i].clN} | ${oracle[i].wrong.join('; ') || '—'} |`).join('\n')}

승격(v9.1) 노드: ${promoted}개

## run별 최종 트리

${results.map((r) => `### ${r.name} (${r.sec}s)\n\n\`\`\`\n${r.tree}\n\`\`\`\n\n다이제스트:\n${r.digest.map((d) => `- ${d}`).join('\n') || '- (없음)'}`).join('\n\n')}

## 온라인 로그

${results.map((r) => `<details><summary>${r.name}</summary>\n\n\`\`\`\n${r.logs.join('\n')}\n\`\`\`\n</details>`).join('\n\n')}
`;
  await writeFile(resolve(__dir, `runs/hier-v9-${key}.md`), md);
  for (let i = 0; i < results.length; i++)
    await writeFile(resolve(__dir, `runs/hier-v9-${key}-${i + 1}.json`), JSON.stringify({ name: results[i].name, snap: results[i].snap, rel: results[i].rel, digest: results[i].digest }, null, 2));
  console.log(`  ═══ ${key}: 라벨 ${pct(avg(agr))} · 자카드 ${pct(avg(jac))} · 부착 ${cfg.book.toc.length ? oracle.map((o) => `${o.ok}/${o.n}`).join(',') : '—'} · ML ${oracle.map((o) => `${o.mlOk}/${o.mlN}`).join(',')} · CL위반 ${oracle.map((o) => o.clBad).join(',')} · 승격 ${promoted} ═══`);
  return { key, agr: avg(agr), jac: avg(jac), oracle, promoted };
}

const arg = (process.argv[2] || 'all').toLowerCase();
const keys = arg === 'all' ? Object.keys(BOOKS) : [arg];
for (const k of keys) { if (!BOOKS[k]) { console.error(`unknown book: ${k}`); process.exit(1); } await runBook(k); }
