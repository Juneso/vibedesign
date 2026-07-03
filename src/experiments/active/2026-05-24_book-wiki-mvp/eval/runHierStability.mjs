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

import { writeFile } from 'node:fs/promises';
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
if (!['v5', 'v6', 'v7'].includes(variant)) { console.error('usage: node eval/runHierStability.mjs v5|v6|v7'); process.exit(1); }

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

// ─── 데이터: protoHierIngestV5와 동일 (비교 공정성) ─────────────
const book = {
  title: '디자인의 디자인', author: '하라 켄야', category: '예술/디자인 > 디자인 이론',
  toc: ['디자인이라는 것의 발견', 'RE-DESIGN: 21세기의 일상', '정보의 건축이라는 사고', 'HAPTIC: 감각의 깨어남', '무인양품의 비전', '엑스포메이션 — 미지화'],
  // v7 테마 앵커링용 핵심 논지 (evalNoToc META와 동일 출처). v5/v6 place 프롬프트에는 안 들어감.
  summary: '하라 켄야가 디자인의 본질을 다시 묻는 책. 디자인을 "새로운 것을 만드는 일"이 아니라 "이미 알고 있다고 여기는 것을 미지의 것으로 되돌려 다시 보게 하는 일(RE-DESIGN)"로 재정의한다. 정보를 받는 사람의 머릿속에 구축되는 구조로 보는 "정보의 건축", 촉각 등 오감을 깨우는 HAPTIC, 비움으로써 참여를 부르는 엠프티니스(무인양품), 일상의 미지화(엑스포메이션)를 다룬다.',
};
const memosBase = [
  { p: 18, text: '디자인은 새로운 것을 만드는 일이 아니라, 이미 알고 있다고 여기는 것을 낯설게 되돌아보게 하는 일이다.', my: '창조보다 재발견' },
  { p: 33, text: '익숙한 사물을 다시 디자인하면, 우리가 그것을 사실은 잘 모르고 있었다는 걸 깨닫는다.', my: '리디자인 = 무지의 자각' },
  { p: 41, text: '화장지의 심을 사각형으로 바꾸자, 굴릴 때의 저항이 "아껴 쓰라"는 메시지가 되었다.', my: '형태가 곧 메시지' },
  { p: 55, text: '정보는 시각만으로 전달되지 않는다. 손끝의 촉각, 무게, 질감이 의미를 만든다.', my: '오감으로 읽는 정보' },
  { p: 60, text: 'HAPTIC 전시는 디자이너들에게 "감각을 깨우는" 사물을 의뢰한 실험이었다.', my: '촉각 디자인의 실천' },
  { p: 72, text: '정보를 잘 설계한다는 것은, 사람의 감각이 그것을 자연스럽게 이해하도록 구조를 짓는 일이다.', my: '정보의 건축' },
  { p: 88, text: '비어 있음은 부족함이 아니다. 빈 그릇이기에 무엇이든 담을 수 있다.', my: '여백 = 가능성의 그릇' },
  { p: 90, text: '엠프티니스는 의미를 비워둠으로써 보는 사람이 스스로 의미를 채우게 한다.', my: '비움이 참여를 부른다' },
  { p: 104, text: '무인양품은 "이것이 좋다"가 아니라 "이것으로 충분하다"라는 절제된 만족을 디자인한다.', my: '충분함의 미학' },
  { p: 108, text: '브랜드의 색을 지우고 익명의 사물이 될 때, 오히려 더 넓은 사람에게 가닿는다.', my: '익명성의 힘' },
  { p: 121, text: '엑스포메이션은 안다고 착각하던 대상을 다시 모르게 만들어, 호기심을 되살리는 방법이다.', my: '미지화 = 앎의 리셋' },
  { p: 130, text: '평범한 일상의 사물 속에 디자인이 답해야 할 가장 어려운 질문이 들어 있다.', my: '일상이 곧 과제' },
  { p: 142, text: '여백을 남긴 포스터가, 가득 채운 포스터보다 더 강하게 말을 건다.', my: '여백의 전달력' },
  { p: 150, text: '촉각을 자극하는 종이의 질감은 시각 정보가 닿지 못하는 기억을 깨운다.', my: '질감과 기억' },
];

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
  return `# 위계 셔플 안정성 · ${variant} · ${r.name} (${idx}회차)

> 모델 ${MODEL} · 메모 순서: [${r.memos.map((m) => m.p).join(', ')}] · ${r.secs}s
> 개념 ${s.conceptCount} · 최대 깊이 L${s.maxDepth} · merge ${s.merge}+${s.mergeGlobal} · child ${s.child} · parent ${s.parent} · attach ${s.attach}${variant !== 'v5' ? ` · flip ${s.flip}` : ''}${variant === 'v7' ? ` · theme ${s.theme}(기각 ${s.themeRejected})` : ''}

## 트리

\`\`\`
${renderTreeText(r.tree)}
\`\`\`
${themes.length ? `\n## 테마 (anchor + description)\n\n${themes.join('\n')}\n` : ''}
## 로그

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
  const r = await runHierIngest({ book, memos: run.memos, llm, embedFn, variant, onProgress: (msg) => process.stdout.write(`  ${msg}\r`) });
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const rel = memoPairRelations(r.nodes, r.rootId);
  const result = { ...run, stats: r.stats, rel, tree: serializeTree(r.nodes, r.rootId), log: r.log, secs };
  results.push(result);
  console.log(`\n  개념 ${r.stats.conceptCount} · L${r.stats.maxDepth} · merge ${r.stats.merge}+${r.stats.mergeGlobal} child ${r.stats.child} parent ${r.stats.parent} attach ${r.stats.attach} cluster ${r.stats.cluster}${variant !== 'v5' ? ` flip ${r.stats.flip}` : ''}${variant === 'v7' ? ` theme ${r.stats.theme}(-${r.stats.themeRejected})` : ''} · ${secs}s`);
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

| run | 개념 수 | 최대 깊이 | merge | merge* | child | parent | attach | cluster${variant !== 'v5' ? ' | flip' : ''}${variant === 'v7' ? ' | theme(기각)' : ''} | 시간 |
|---|---|---|---|---|---|---|---|---${variant !== 'v5' ? '|---' : ''}${variant === 'v7' ? '|---' : ''}|---|
${results.map((r) => `| ${r.name} | ${r.stats.conceptCount} | L${r.stats.maxDepth} | ${r.stats.merge} | ${r.stats.mergeGlobal} | ${r.stats.child} | ${r.stats.parent} | ${r.stats.attach} | ${r.stats.cluster}${variant !== 'v5' ? ` | ${r.stats.flip}` : ''}${variant === 'v7' ? ` | ${r.stats.theme}(${r.stats.themeRejected})` : ''} | ${r.secs}s |`).join('\n')}
${variant === 'v7' ? `\n## run별 테마 (name + description)\n\n${results.map((r) => {
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
