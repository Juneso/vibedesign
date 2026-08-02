// 역량 질문(competency question) eval (BKT-380 온톨로지 규율 ②)
//
// 온톨로지 품질 평가의 표준 기법: "이 구조로 이 질문에 답할 수 있는가?"
// 답변자는 **트리 텍스트만** 보고 답한다(메모 원문 접근 금지) — 트리가 정보를
// 담지 못했으면 답이 나올 수 없다. 채점자는 메모 원문을 정답 근거로 삼아
// 0(불가)/1(부분)/2(충분)로 채점한다. "좋은 트리"를 주관 감상에서 측정으로 바꾼다.
//
// 사용: node eval/evalCompetency.mjs runs/hier-auto-1.json [runs/hier-auto-2.json …]
// 결과: runs/competency-{N}.json + .md (시리즈 competency)
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);

const N = (s) => String(s || '').normalize('NFC');
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
const llm = openaiNodeTransport({ model: MODEL });

// T-Box 수준의 일반 질문 — 어떤 비문학 책이든 위계가 제대로 섰다면 답할 수 있어야 한다.
const QUESTIONS = [
  { id: 'q1', q: '이 책의 핵심 주장(또는 중심 개념)은 무엇인가?' },
  { id: 'q2', q: '그 주장을 떠받치는 주요 근거나 구성 요소는 무엇인가?' },
  { id: 'q3', q: '시간적 전개(기원 → 전개 → 현재)가 있다면 순서대로 말하라. 없다면 없다고 답하라.' },
  { id: 'q4', q: '저자가 반박하거나 맞세우는 통념·대립 개념이 있는가?' },
  { id: 'q5', q: '주장·개념의 구체적 사례나 현대적 양상으로 무엇이 제시되는가?' },
];

function treeToText(tree) {
  const byParent = new Map();
  for (const n of tree.nodes) {
    if (!byParent.has(n.parentId)) byParent.set(n.parentId, []);
    byParent.get(n.parentId).push(n);
  }
  const root = tree.nodes.find((n) => n.kind === 'root');
  const lines = [];
  const walk = (id, depth) => {
    for (const c of byParent.get(id) || []) {
      const mark = c.kind === 'sentence' ? '·' : '-';
      const gloss = c.kind !== 'sentence' && c.gloss ? ` — ${String(c.gloss).slice(0, 150)}` : '';
      lines.push(`${'  '.repeat(depth)}${mark} ${c.title}${gloss}`);
      walk(c.id, depth + 1);
    }
  };
  walk(root.id, 0);
  return `${root.title}\n${lines.join('\n')}`;
}

const files = process.argv.slice(2);
if (!files.length) { console.error('런 파일 경로를 인자로 주세요 (예: runs/hier-auto-1.json)'); process.exit(1); }

const ds = JSON.parse(await readFile(resolve(__dir, 'golden/books50-memos.json'), 'utf-8'));
const existing = (await readdir(resolve(__dir, 'runs'))).map((f) => f.match(/^competency-(\d+)\.json$/)).filter(Boolean).map((m) => +m[1]);
let idx = existing.length ? Math.max(...existing) : 0;

console.log(`[CQ] 채점 모델 ${MODEL} · 대상 ${files.length}개 런`);

for (const f of files) {
  const run = JSON.parse(await readFile(resolve(__dir, f), 'utf-8'));
  const book = ds.books.find((b) => N(b.title) === N(run.label));
  if (!book) { console.log(`  ⚠ ${run.label} — 데이터셋에 없음`); continue; }
  const treeText = treeToText(run.tree);
  const truth = book.memos.map((m, i) => `[p.${m.p}] ${m.text}`).join('\n');

  const results = [];
  for (const { id, q } of QUESTIONS) {
    const ans = await llm({
      system: '아래 "위키 트리"만 보고 질문에 답한다. 트리에 없는 지식은 절대 쓰지 마라 — 배경지식으로 보충하면 평가가 무효가 된다. 트리에서 답을 구성할 수 없으면 정확히 "트리에서 답할 수 없음"이라고 답하라. JSON만 출력.',
      user: `[위키 트리]\n${treeText}\n\n[질문]\n${q}\n\n출력 JSON: {"answer":"트리 근거로만 쓴 답(2~4문장) 또는 \\"트리에서 답할 수 없음\\""}`,
      temperature: 0,
    });
    let a = ''; try { a = JSON.parse(ans).answer || ''; } catch { a = ans; }

    // ⚠ 루브릭을 점수별로 명시해야 한다 — 0점 조건만 주면 채점자가 축어적 일치를
    //   요구하는 쪽으로 폭주한다(첫 실행 3권 전항목 0점, 사유는 긍정인데 점수 0 실측).
    const jr = await llm({
      system: `독서 위키 품질 채점자. 답변이 이 책의 실제 발췌(정답 근거)와 의미상 부합하며 질문을 해소하는지 채점한다. 발췌와 표현이 달라도 취지가 맞으면 인정한다 — 축어적 일치를 요구하지 마라.
채점 루브릭:
- 2: 답변이 발췌의 내용과 의미상 부합하고 질문을 실질적으로 해소한다. 또는 발췌에도 답이 없어 "답할 수 없음"이 정당한 경우.
- 1: 방향은 맞지만 핵심이 빠졌거나 일부만 답했다.
- 0: 발췌와 어긋난다, 또는 발췌에 답이 있는데 "답할 수 없음"이라 했다.
score 는 반드시 숫자. JSON만 출력.`,
      user: `[질문]\n${q}\n\n[답변]\n${a}\n\n[정답 근거 — 실제 발췌]\n${truth}\n\n출력 JSON: {"score":2,"reason":"한 줄"} 형식(score 는 0·1·2 중 하나)`,
      temperature: 0,
    });
    let j = { score: 0, reason: '채점 실패' }; try { j = JSON.parse(jr); } catch { /* noop */ }
    results.push({ id, q, answer: a, score: j.score, reason: j.reason });
    process.stdout.write(`    ${id}:${j.score} `);
  }
  const total = results.reduce((s, r) => s + (r.score || 0), 0);
  console.log(`\n  [${run.label}] ${total}/${QUESTIONS.length * 2} (${f})`);

  const base = resolve(__dir, `runs/competency-${++idx}`);
  await writeFile(`${base}.json`, JSON.stringify({
    label: N(run.label), runAt: new Date().toISOString(), kind: 'competency',
    sourceRun: f, sourceVariant: run.variant || run.kind, model: MODEL,
    total, max: QUESTIONS.length * 2, results,
  }, null, 2) + '\n', 'utf-8');

  let md = `# ${N(run.label)} — 역량 질문 채점\n\n`;
  md += `- 대상 트리: \`${f}\` (${run.variant || run.kind})\n- 총점: **${total} / ${QUESTIONS.length * 2}**\n\n`;
  md += `| 질문 | 점수 | 근거 |\n|---|---|---|\n`;
  for (const r of results) md += `| ${r.q} | ${r.score} | ${String(r.reason).replace(/\|/g, '·')} |\n`;
  md += `\n## 답변 전문\n\n`;
  for (const r of results) md += `**${r.q}**\n\n> ${r.answer}\n\n`;
  await writeFile(`${base}.md`, md, 'utf-8');
}
console.log('\n✓ 완료');
