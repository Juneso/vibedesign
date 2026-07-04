// 위계 인제스트 셔플 안정성 측정 — 같은 메모셋을 순서만 바꿔 3회 돌리고
// "트리가 얼마나 같은 모양으로 재현되는가"를 잰다. (BKT-342 위계 품질 개선의 측정 기준)
//
// 실행: node eval/runHierStability.mjs v5   (또는 v6)
// 지표:
//  - 메모쌍 관계 일치율: 페이지쌍 (p,q)의 관계 라벨(merged/조상/형제/무관)이 run 간 일치하는 비율.
//    개념 "이름"은 실행마다 흔들리므로 항상 안정적인 메모 페이지를 기준으로 잰다.
//  - 위계쌍 재현율: run별 "위계 있음(merged·조상·형제)" 쌍 집합 간 자카드.
//  - 깊이 분포·op 카운트(merge/child/parent/attach/flip).
// 출력: eval/runs/hier-stability-{variant}.md + 개별 트리 JSON

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';
import { runHierIngest, serializeTree, memoPairRelations } from './lib/hierEngine.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
const KEY = process.env.OPENAI_API_KEY;
const llm = openaiNodeTransport({ model: MODEL });

const variant = (process.argv[2] || 'v5').toLowerCase();
if (!['v5', 'v6', 'v7', 'v8'].includes(variant)) { console.error('usage: node eval/runHierStability.mjs v5|v6|v7|v8'); process.exit(1); }

// v8 전용: planIngest 로더 (gpt-4o 필수)
let planIngestFn = null;
if (variant === 'v8') {
  const { planIngest, setLLMTransport } = await import('../lib/llm.js');
  const INGEST_MODEL = process.env.INGEST_MODEL || 'gpt-4o';
  setLLMTransport(openaiNodeTransport({ model: INGEST_MODEL }));
  planIngestFn = planIngest;
  console.log(`[v8] planIngest 모델: ${INGEST_MODEL}`);
}

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

// ─── 데이터: 실제 옵시디언 발췌 (evalNoToc.mjs 와 동일 소스) ─────
// ⚠ 이전엔 손질된 합성 메모를 썼으나(입력이 깔끔해 테마가 쉽게 나오는 편향), 실 발췌로 교체.
const book = {
  title: '디자인의 디자인', author: '하라 켄야', category: '예술/디자인 > 디자인 이론',
  // 실제 판본 목차 (evalNoToc META 와 동일). 발췌가 이 목차 범위를 실제로 커버.
  toc: ['디자인이라는 것', 'RE-DESIGN — 21세기의 일상', '정보의 건축 그 가능성', '욕망의 에듀케이션', '일본의 디자인', '비주얼커뮤니케이션 디자인', '디자이너의 일'],
  // v7 테마 앵커링용 실제 책 리치데이터 — evalNoToc META.aladin 과 동일 출처(알라딘 실데이터) verbatim.
  // ⚠ summary 는 메모셋에 맞춰 손대지 않는다(편향 방지). anchor 검증의 ground truth 는 아래 리치데이터.
  // v5/v6 place 프롬프트에는 안 들어감 — 테마 단계(theme_gen·critic)에서만 사용.
  summary: '하라 켄야가 디자인의 본질을 다시 묻는 책. 디자인을 "새로운 것을 만드는 일"이 아니라 "이미 알고 있다고 여기는 것을 미지의 것으로 되돌려 다시 보게 하는 일(RE-DESIGN)"로 재정의한다. 정보를 받는 사람의 머릿속에 구축되는 구조로 보는 "정보의 건축", 일상의 미지화, 미디어를 횡단하는 커뮤니케이션 디자인, 생활에 기초한 문명 비평으로서의 디자인을 다룬다.',
  aladin: {
    intro: '그래픽 디자이너 하라 켄야가 "디자인이란 무엇인가"라는 물음을 정면으로 다룬 디자인 사상서. 새로움의 생산이 아니라 익숙한 일상을 낯설게 되돌아보는 RE-DESIGN의 관점에서 디자인의 가능성을 탐색한다.',
    publisherIntro: '하라 켄야는 첨단 테크놀로지가 끊임없이 "신기한 과일"을 식탁에 올리듯 새로움만을 좇는 현대 디자인을 비판하고, 평범한 일상 속에 잠든 무수한 디자인의 가능성을 "미지화"를 통해 일깨운다. 정보는 대량 저장·고속 이동이 아니라 받는 사람의 머릿속에 구축되는 "정보의 건축"이며, 디자인은 미디어에 종속되지 않고 그 본질을 탐색하는 횡단적 커뮤니케이션이다.',
    excerpts: '"익숙한 것을 미지의 것으로 재발견할 수 있는 감성 또한 똑같은 창조성이다." / "정보의 건축은 그 정보를 접한 사람들의 머릿속에 구축되어 가는 것이다."',
    recommend: '디자인을 ‘스타일링’이 아니라 ‘사고방식’으로 이해하게 해주는 책.',
  },
};
// 실제 발췌 파싱 (evalNoToc.mjs 와 동일 규칙). myThought 는 원본에 없음 → 빈 값.
const MD = process.env.HOME + '/Library/Mobile Documents/iCloud~md~obsidian/Documents/Junseo/200 Literature/210 Books/디자인의 디자인_220308_191948.md';
const rawMd = await readFile(MD, 'utf-8');
const parsed = []; let cur = null;
for (const line of rawMd.split(/\r?\n/)) {
  const t = line.trim(); const m = t.match(/^(\d+)\.\s*(.*)$/);
  if (m) { cur = { p: Number(m[1]), lines: [] }; parsed.push(cur); if (m[2] && m[2].length >= 25) cur.lines.push(m[2]); }
  else if (t) { if (!cur) { cur = { p: 32, lines: [] }; parsed.push(cur); } cur.lines.push(t); }
}
const memosBase = parsed
  .map((x) => ({ p: x.p, text: x.lines.join(' ').trim(), my: '' }))
  .filter((x) => x.text.length > 10);
console.log(`[데이터] 실 발췌 ${memosBase.length}개 (p${memosBase.map((m) => m.p).join(',p')})`);

// 시드 고정 셔플 (mulberry32) — 재현 가능. run1은 원래 순서(=기존 결과와 비교 가능).
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, seed) {
  const rng = mulberry32(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const RUNS = [
  { name: 'run1-orig', memos: memosBase },
  { name: 'run2-seed7', memos: shuffled(memosBase, 7) },
  { name: 'run3-seed42', memos: shuffled(memosBase, 42) },
];

// ─── 실행 ──────────────────────────────────────────────────────
// 대시보드 연동: runs/ 평면에 hier-stability-{variant}-{n}.json + 같은 이름 .md 를 run마다 즉시 기록.
// (eval-dashboard 가 runs/*.json 을 시리즈로 묶고 짝 .md 를 본문으로 렌더링)
const runsDir = resolve(__dir, 'runs');
function renderTreeText(tree) {
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const kids = (pid) => tree.nodes.filter((n) => n.parentId === pid);
  const lines = [];
  (function walk(id, d) {
    const n = byId.get(id);
    lines.push(`${'  '.repeat(d)}${n.kind === 'root' ? '■' : '•'} ${n.title}${n.sources?.length ? ' ·p' + n.sources.join(',p') : ''}`);
    kids(id).forEach((k) => walk(k.id, d + 1));
  })(tree.rootId, 0);
  return lines.join('\n');
}
function runMd(r, idx) {
  const s = r.stats;
  const themes = [];
  for (let i = 0; i < r.log.length; i++) {
    if (r.log[i].startsWith('[theme]')) themes.push(`- ${r.log[i].replace('[theme] ', '')}${r.log[i + 1]?.startsWith('[theme.desc]') ? `\n  ${r.log[i + 1].replace('[theme.desc]   ↳ ', '— ')}` : ''}`);
    if (r.log[i].startsWith('[theme✗]')) themes.push(`- (기각) ${r.log[i].replace('[theme✗] ', '')}`);
  }
  // 👀 체크포인트 — 이 run에서 뭘 보면 결과를 알 수 있는지. variant별 관전 포인트.
  const check = [];
  if (variant === 'v5') {
    check.push(`- **트리에서 억지 포함관계 찾기** — child ${s.child}·parent ${s.parent}건이 검증 없이 생성됨. "A ⊃ B"가 말이 되는지 눈으로 확인`);
    check.push(`- **다른 회차와 위계가 같은가** — V5는 순서 의존이 심해 회차마다 위계가 달라지는 것이 알려진 문제`);
  } else if (variant === 'v6') {
    check.push(`- **flip ${s.flip}건** — 교차검증이 기각·강등한 위계 제안 수. 남은 child ${s.child}·parent ${s.parent}건만 검증 통과 위계 (로그 [flip] 참조)`);
    check.push(`- **트리가 평면화됐는가** — V6는 가짜 위계를 걸러내는 대신 정리감을 잃는 트레이드오프. 테마가 없는 것이 정상`);
  } else if (variant === 'v8') {
    check.push(`- **planIngest 페이지 ${s.pages}개** — 개념 노드들에 개요(## 개요 디스크립션)가 실제로 붙었는가. 아래 "개념별 개요" 섹션에서 gloss가 비어있으면 실패`);
    check.push(`- **테마 ${s.theme}개 (기각 ${s.themeRejected})** — V7과 동일 하이브리드 anchor 테마. 이름·anchor·설명이 책 논지 축(재발견/정보의 건축/비움)과 일치하는지 확인`);
    check.push(`- **다른 회차와 같은 축인가** — 재발견 / 정보의 건축+감각 / 비움 3축 재현 여부`);
    check.push(`- merge ${s.merge + s.mergeGlobal}건 (Phase 1.5 동의어 병합) · planIngest가 겹치는 페이지를 별도 create했을 경우 여기서 합쳐져야 정상`);
  } else {
    check.push(`- **테마 ${s.theme}개 (기각 ${s.themeRejected})** — 아래 테마 목록의 이름·anchor·설명이 책의 논지 축과 일치하는지가 핵심. 뜬금없는 우산 개념이 있으면 실패`);
    check.push(`- **anchor가 실제 인용인가** — 책 요약·목차에 없는 구절을 지어냈으면 critic이 놓친 것`);
    check.push(`- **다른 회차와 같은 축인가** — 재발견 / 정보의 건축+감각 / 비움 3축이 재현되어야 안정`);
    check.push(`- flip ${s.flip}건 · merge ${s.merge + s.mergeGlobal}건 — 같은 메모 중복(엑스포메이션=미지화 류)이 합쳐졌는지 트리에서 확인`);
  }
  // v8: 개념별 개요 섹션 (gloss가 개요 전문)
  let overviewSection = '';
  if (variant === 'v8') {
    const conceptNodes = r.tree.nodes.filter((n) => n.kind === 'concept' && n.gloss);
    if (conceptNodes.length) {
      overviewSection = `\n## 개념별 개요\n\n${conceptNodes.map((n) => `**${n.title}**\n${n.gloss.slice(0, 200)}${n.gloss.length > 200 ? '…' : ''}`).join('\n\n')}\n`;
    }
  }

  return `# ingest ${variant} · 셔플 ${idx}회차

> ${MODEL} · 순서 [${r.memos.map((m) => m.p).join(',')}] · ${r.secs}s · 개념 ${s.conceptCount} · 깊이 L${s.maxDepth}${variant === 'v8' ? ` · planIngest 페이지 ${s.pages}` : ''}

## 👀 체크포인트

${check.join('\n')}
${themes.length ? `\n## 테마 (anchor + description)\n\n${themes.join('\n')}\n` : ''}${overviewSection}
## 트리

\`\`\`
${renderTreeText(r.tree)}
\`\`\`

## 로그 (op별 판단 근거)

\`\`\`
${r.log.join('\n')}
\`\`\`

> 시리즈 종합(3-run 안정성 지표): runs/hier-stability-${variant}.md
`;
}

const results = [];
let runIdx = 0;
for (const run of RUNS) {
  runIdx++;
  console.log(`\n━━━ ${variant} · ${run.name} · 순서: [${run.memos.map((m) => m.p).join(',')}] ━━━`);
  const t0 = Date.now();
  const r = await runHierIngest({ book, memos: run.memos, llm, embedFn, variant, planIngestFn, onProgress: (msg) => process.stdout.write(`  ${msg}\r`) });
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const rel = memoPairRelations(r.nodes, r.rootId);
  const result = { ...run, stats: r.stats, rel, tree: serializeTree(r.nodes, r.rootId), log: r.log, secs };
  results.push(result);
  console.log(`\n  개념 ${r.stats.conceptCount} · L${r.stats.maxDepth} · merge ${r.stats.merge}+${r.stats.mergeGlobal} child ${r.stats.child} parent ${r.stats.parent} attach ${r.stats.attach} cluster ${r.stats.cluster}${variant !== 'v5' ? ` flip ${r.stats.flip}` : ''}${(variant === 'v7' || variant === 'v8') ? ` theme ${r.stats.theme}(-${r.stats.themeRejected})` : ''}${variant === 'v8' ? ` pages ${r.stats.pages}` : ''} · ${secs}s`);
  const base = `hier-stability-${variant}-${runIdx}`;
  await writeFile(resolve(runsDir, `${base}.json`), JSON.stringify({ run: run.name, order: run.memos.map((m) => m.p), stats: r.stats, tree: result.tree, rel, log: r.log }, null, 1));
  await writeFile(resolve(runsDir, `${base}.md`), runMd(result, runIdx));
}

// ─── 안정성 계산 ───────────────────────────────────────────────
const pairKeys = Object.keys(results[0].rel);
// 방향 라벨은 셔플 시 순서가 바뀌어도 페이지 번호 기준이므로 그대로 비교 가능
function agreement(a, b) {
  let same = 0; for (const k of pairKeys) if (a[k] === b[k]) same++;
  return same / pairKeys.length;
}
// "관계 있음" 쌍 집합 자카드 (none 제외)
function jaccard(a, b) {
  const sa = new Set(pairKeys.filter((k) => a[k] !== 'none'));
  const sb = new Set(pairKeys.filter((k) => b[k] !== 'none'));
  const inter = [...sa].filter((k) => sb.has(k)).length;
  const uni = new Set([...sa, ...sb]).size;
  return uni ? inter / uni : 1;
}
const pairsOf = [[0, 1], [0, 2], [1, 2]];
const agr = pairsOf.map(([i, j]) => agreement(results[i].rel, results[j].rel));
const jac = pairsOf.map(([i, j]) => jaccard(results[i].rel, results[j].rel));
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

// 3-run 모두 동일 라벨인 쌍 비율
let allSame = 0;
for (const k of pairKeys) if (results[0].rel[k] === results[1].rel[k] && results[1].rel[k] === results[2].rel[k]) allSame++;

// ─── 리포트 ────────────────────────────────────────────────────
function renderTree(tree) {
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const kids = (pid) => tree.nodes.filter((n) => n.parentId === pid);
  const lines = [];
  (function walk(id, d) {
    const n = byId.get(id);
    lines.push(`${'  '.repeat(d)}${n.kind === 'root' ? '■' : '•'} ${n.title}${n.sources?.length ? ' ·p' + n.sources.join(',p') : ''}`);
    kids(id).forEach((k) => walk(k.id, d + 1));
  })(tree.rootId, 0);
  return lines.join('\n');
}

const md = `# 위계 인제스트 셔플 안정성 — ${variant}

> 모델 ${MODEL} · 메모 ${memosBase.length}개 · 3회 실행(원순서 + 시드 7, 42 셔플)
> 지표는 메모 페이지쌍(${pairKeys.length}쌍)의 트리 관계 라벨(merged/조상/형제/무관) 기준.

## 안정성 요약

| 지표 | run1↔2 | run1↔3 | run2↔3 | 평균 |
|---|---|---|---|---|
| 관계 라벨 일치율 | ${agr.map((x) => (x * 100).toFixed(0) + '%').join(' | ')} | **${(avg(agr) * 100).toFixed(0)}%** |
| 관계쌍 자카드 | ${jac.map((x) => (x * 100).toFixed(0) + '%').join(' | ')} | **${(avg(jac) * 100).toFixed(0)}%** |

- 3회 모두 동일 라벨: **${allSame}/${pairKeys.length}쌍 (${(allSame / pairKeys.length * 100).toFixed(0)}%)**

## run별 구조 통계

| run | 개념 수 | 최대 깊이 | merge | merge* | child | parent | attach | cluster${variant !== 'v5' ? ' | flip' : ''}${(variant === 'v7' || variant === 'v8') ? ' | theme(기각)' : ''}${variant === 'v8' ? ' | planIngest 페이지' : ''} | 시간 |
|---|---|---|---|---|---|---|---|---${variant !== 'v5' ? '|---' : ''}${(variant === 'v7' || variant === 'v8') ? '|---' : ''}${variant === 'v8' ? '|---' : ''}|---|
${results.map((r) => `| ${r.name} | ${r.stats.conceptCount} | L${r.stats.maxDepth} | ${r.stats.merge} | ${r.stats.mergeGlobal} | ${r.stats.child} | ${r.stats.parent} | ${r.stats.attach} | ${r.stats.cluster}${variant !== 'v5' ? ` | ${r.stats.flip}` : ''}${(variant === 'v7' || variant === 'v8') ? ` | ${r.stats.theme}(${r.stats.themeRejected})` : ''}${variant === 'v8' ? ` | ${r.stats.pages}` : ''} | ${r.secs}s |`).join('\n')}
${(variant === 'v7' || variant === 'v8') ? `\n## run별 테마 (name + description)\n\n${results.map((r) => {
  const lines = [];
  for (let i = 0; i < r.log.length; i++) {
    if (r.log[i].startsWith('[theme]')) lines.push(`- ${r.log[i].replace('[theme] ', '**')}**${r.log[i + 1]?.startsWith('[theme.desc]') ? `\n  - ${r.log[i + 1].replace('[theme.desc]   ↳ ', '')}` : ''}`.replace('**"', '**"').replace(')**', ')**'));
    if (r.log[i].startsWith('[theme✗]')) lines.push(`- ~~${r.log[i].replace('[theme✗] ', '')}~~`);
  }
  return `### ${r.name}\n${lines.join('\n') || '(테마 없음)'}`;
}).join('\n\n')}\n` : ''}
${results.map((r) => `## ${r.name} — 트리\n\n\`\`\`\n${renderTree(r.tree)}\n\`\`\``).join('\n\n')}

## run별 로그

${results.map((r) => `<details><summary>${r.name}</summary>\n\n\`\`\`\n${r.log.join('\n')}\n\`\`\`\n</details>`).join('\n\n')}
`;
const mdPath = resolve(__dir, `runs/hier-stability-${variant}.md`);
await writeFile(mdPath, md);
console.log(`\n═══ ${variant} 안정성: 라벨 일치 ${(avg(agr) * 100).toFixed(0)}% · 자카드 ${(avg(jac) * 100).toFixed(0)}% · 3-run 동일 ${(allSame / pairKeys.length * 100).toFixed(0)}% ═══`);
console.log(`→ ${mdPath}`);
