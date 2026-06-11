// judge ↔ 내 판정 일치율 측정 (DES-302)
//
// 입력:
//   golden/calib-set-v1.json        — runCalibrationGen.mjs 산출 (숨김 variant 포함)
//   runs/calib-labeling-sheet.md    — Junseo가 판정/이유를 채운 시트
// 동작:
//   1. 시트에서 라벨 파싱 (판정 합/불 + 레벨 + 이유)
//   2. 같은 셋을 V8 judge(J1·J2·J3 + F체커, lib/judgesV8.mjs — 운영 eval과 동일 코드)로 블라인드 채점
//   3. 일치율 계산: 전체 / 위험 불일치(judge합·내불) / 변형별 / 레벨(정확·±1)
//   4. 불일치 건 중재 리포트 → runs/judge-calib-N.md
//
// 사용: node eval/runJudgeCalibration.mjs   (judge=gpt-4o)

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';
import { scoreNudge } from './lib/judgesV8.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dirname);
const EVAL_MODEL = process.env.EVAL_MODEL || 'gpt-4o';
const transport = openaiNodeTransport({});
const judge = (user) => transport({ user, temperature: 0, model: EVAL_MODEL });

const seed = JSON.parse(await readFile(resolve(__dirname, 'golden/seed-v1.json'), 'utf-8'));
const calib = JSON.parse(await readFile(resolve(__dirname, 'golden/calib-set-v2.json'), 'utf-8'));

// ─── 1. 라벨 파싱 ────────────────────────────────────────────────
const sheetRaw = await readFile(resolve(__dirname, 'runs/calib-labeling-sheet.md'), 'utf-8');
const labels = new Map();
for (const sec of sheetRaw.split(/^## /m).slice(1)) {
  const id = sec.match(/^([CD]-\d+[a-z])/)?.[1];
  if (!id) continue;
  const verdictRaw = sec.match(/^- 판정:\s*(.*)$/m)?.[1]?.trim() || '';
  const levelRaw = sec.match(/^- 레벨:\s*(.*)$/m)?.[1]?.trim() || '';
  const reason = sec.match(/^- 이유:\s*(.*)$/m)?.[1]?.trim() || '';
  let verdict = null;
  if (/^(합|합격|o|pass|✅|👍)/i.test(verdictRaw)) verdict = true;
  else if (/^(불|불합격|x|fail|❌|👎)/i.test(verdictRaw)) verdict = false;
  const level = levelRaw.match(/L[1-7]/i)?.[0]?.toUpperCase() || null;
  if (verdict !== null) labels.set(id, { verdict, level, reason });
}

if (labels.size === 0) {
  console.error('✗ 시트에 채워진 판정이 없음 — runs/calib-labeling-sheet.md 의 "- 판정:" 칸을 합/불 로 채운 뒤 다시 실행.');
  process.exit(1);
}
const labeled = calib.items.filter(it => labels.has(it.id));
console.log(`▶ Judge Calibration (judge=${EVAL_MODEL}) — 라벨 ${labels.size}건 / 셋 ${calib.items.length}건`);
if (labeled.length < calib.items.length) console.log(`  ⚠ 미라벨 ${calib.items.length - labeled.length}건은 측정에서 제외`);

const myPass = labeled.filter(it => labels.get(it.id).verdict).length;
console.log(`  내 판정 분포: 합 ${myPass} / 불 ${labeled.length - myPass}`);

// ─── 2. 블라인드 채점 ────────────────────────────────────────────
const rows = [];
for (const it of labeled) {
  const book = seed.books.find(b => b.id === it.bookId);
  const memo = seed.memos.find(m => m.bookId === it.bookId && m.page === it.page);
  process.stdout.write(`  [${it.id}] 채점...`);
  const scored = await scoreNudge({ out: it.out, memo, book, judge });
  const my = labels.get(it.id);
  rows.push({ ...it, book, memo, scored, my, agree: scored.pass === my.verdict });
  console.log(` judge=${scored.pass ? '합' : '불'} / 나=${my.verdict ? '합' : '불'} ${scored.pass === my.verdict ? '✓' : '✗'}`);
}

// ─── 3. 일치율 ───────────────────────────────────────────────────
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-');
const agreeN = rows.filter(r => r.agree).length;
const falsePass = rows.filter(r => r.scored.pass && !r.my.verdict);   // 위험: judge합·내불
const falseFail = rows.filter(r => !r.scored.pass && r.my.verdict);  // 보수: judge불·내합

const byVariant = {};
for (const r of rows) {
  (byVariant[r.variant] ||= { n: 0, agree: 0 }).n++;
  if (r.agree) byVariant[r.variant].agree++;
}

const lvlRows = rows.filter(r => r.my.level);
const lvlExact = lvlRows.filter(r => r.scored.j3.level === r.my.level).length;
const lvlAdj = lvlRows.filter(r => Math.abs(Number(r.scored.j3.level[1]) - Number(r.my.level[1])) <= 1).length;

// ─── 4. 리포트 ───────────────────────────────────────────────────
async function nextRound() {
  const runsDir = resolve(__dirname, 'runs');
  if (!existsSync(runsDir)) return 1;
  const files = await readdir(runsDir);
  const nums = files.map(f => f.match(/^judge-calib-(\d+)\.md$/)).filter(Boolean).map(m => Number(m[1]));
  return nums.length ? Math.max(...nums) + 1 : 1;
}
const ROUND = await nextRound();
const disagreements = rows.filter(r => !r.agree);

const md = `# Judge Calibration Round ${ROUND} — 일치율 측정 (DES-302)

> judge=\`${EVAL_MODEL}\` / 셋: calib-v1 (${calib.genModel} 생성) / 라벨 ${labeled.length}건 (합 ${myPass} · 불 ${labeled.length - myPass})

## 일치율: ${pct(agreeN, rows.length)} (${agreeN}/${rows.length}) — 목표 85~90%

| 지표 | 값 |
|---|---|
| 전체 일치율 | **${pct(agreeN, rows.length)}** |
| 위험 불일치 (judge 합 · 나 불) | ${falsePass.length}건 — ${falsePass.map(r => r.id).join(', ') || '없음'} |
| 보수 불일치 (judge 불 · 나 합) | ${falseFail.length}건 — ${falseFail.map(r => r.id).join(', ') || '없음'} |
| 레벨 일치 (정확 / ±1) | ${lvlRows.length ? `${pct(lvlExact, lvlRows.length)} / ${pct(lvlAdj, lvlRows.length)} (${lvlRows.length}건)` : '레벨 라벨 없음'} |

**변형별 일치율** (variant는 측정 후 공개):
${Object.entries(byVariant).map(([v, s]) => `- ${v}: ${pct(s.agree, s.n)} (${s.agree}/${s.n})`).join('\n')}

## 전체 표

| id | 변형 | 나 | judge | J1 | J2 | J3결격 | lvl(judge/나) | 일치 |
|---|---|---|---|---|---|---|---|---|
${rows.map(r => { const defects = [r.scored.j3.quiz&&'quiz',r.scored.j3.coreMiss&&'core',r.scored.j3.disconnect&&'disc',r.scored.j3.samefork&&'same',r.scored.j3.forced&&'forced',r.scored.j3.burden&&'burden'].filter(Boolean).join(',')||'—'; return `| ${r.id} | ${r.variant} | ${r.my.verdict ? '합' : '불'} | ${r.scored.pass ? '합' : '불'} | ${r.scored.j1.score} | ${r.scored.j2.score} | ${defects} | ${r.scored.j3.level}/${r.my.level || '-'} | ${r.agree ? '✓' : '✗'} |`; }).join('\n')}

---

## 불일치 중재 (${disagreements.length}건)

각 건을 재판정해 3분류: (a) judge가 틀림 → 루브릭에 반례 추가 / (b) 내 기준 모순 → 명문화 / (c) 케이스 모호 → 제외.

${disagreements.map(r => `### ${r.id} — ${r.book.title} p.${r.memo.page} (변형: ${r.variant})

> "${r.memo.quote.slice(0, 100)}…"

- 메시지: ${r.out.message}
- 선지: ${r.out.choices.join(' / ')}
- **나**: ${r.my.verdict ? '합' : '불'}${r.my.level ? ` (${r.my.level})` : ''} — ${r.my.reason || '(이유 없음)'}
- **judge**: ${r.scored.pass ? '합' : '불'} (J1=${r.scored.j1.score} J2=${r.scored.j2.score} J3=${[r.scored.j3.quiz&&'quiz',r.scored.j3.coreMiss&&'coreMiss',r.scored.j3.disconnect&&'disconnect',r.scored.j3.samefork&&'samefork',r.scored.j3.forced&&'forced',r.scored.j3.burden&&'burden'].filter(Boolean).join(',')||'결격없음'} ${r.scored.j3.level}${r.scored.det.allPass ? '' : ' / F체커 실패'})
  - J1: ${r.scored.j1.reasoning}
  - J2: ${r.scored.j2.reasoning}
  - J3: ${r.scored.j3.reasoning}
- 중재: (a/b/c)
`).join('\n')}
`;

await mkdir(resolve(__dirname, 'runs'), { recursive: true });
await writeFile(resolve(__dirname, `runs/judge-calib-${ROUND}.md`), md, 'utf-8');
await writeFile(resolve(__dirname, `runs/judge-calib-${ROUND}.json`), JSON.stringify({
  round: ROUND, evalModel: EVAL_MODEL, n: rows.length, agree: agreeN,
  falsePass: falsePass.map(r => r.id), falseFail: falseFail.map(r => r.id), byVariant,
  rows: rows.map(r => ({ id: r.id, variant: r.variant, my: r.my, judge: { pass: r.scored.pass, j1: r.scored.j1, j2: r.scored.j2, j3: r.scored.j3, det: r.scored.det } })),
}, null, 2), 'utf-8');

console.log(`\n일치율 ${pct(agreeN, rows.length)} | 위험 불일치 ${falsePass.length} | 보수 불일치 ${falseFail.length}`);
console.log(`✓ runs/judge-calib-${ROUND}.md`);
