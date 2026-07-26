// 한눈 이해도(glanceability) 채점 — "마인드맵 한판만 봐도 책의 맥락이 잡히는가"
//
// 이 제품의 원래 약속은 트리를 펼쳐 읽는 게 아니라 **한눈에 보는 것**이다. 그런데
// 역량 질문은 트리 전문을 주고 묻기 때문에, 상위 층이 맹탕이어도 아래 문장들이
// 답을 대신 채워 준다. 그래서 상위 층의 품질이 측정에서 빠진다.
//
// 여기서는 **핵심 개념 + 축 이름까지, 딱 2층만** 보여주고 책을 설명하게 한다.
// 축 이름이 "사회적 영향"·"현대적 양상" 같은 맹탕이면 여기서 바로 걸린다 —
// 형식적으로는 멀쩡해 결함 목록에는 안 잡히는 종류의 실패다.
//
// 사용: node eval/evalGlance.mjs runs/hier-auto-39.json [...]
// 결과: runs/glance-{N}.json + .md (시리즈 glance)
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);

const N = (s) => String(s || '').normalize('NFC');
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
const llm = openaiNodeTransport({ model: MODEL });

// 책 제목은 가린다 — 제목이 보이면 트리가 아니라 모델의 배경지식을 재게 된다.
const MASK = '(제목 가림)';

// 상위 2층만 남긴 텍스트 — 핵심 개념과 축 이름까지. 키워드·문장은 가린다.
// 가려진 개수는 함께 알려 준다(구조가 얼마나 큰지는 알아야 판단이 공정하다).
function glanceView(tree) {
  const root = tree.nodes.find((n) => n.kind === 'root');
  const kids = (id) => tree.nodes.filter((n) => n.parentId === id && n.kind === 'concept');
  const deepCount = (id) => {
    let n = 0;
    const walk = (i) => { for (const c of tree.nodes.filter((x) => x.parentId === i)) { n++; walk(c.id); } };
    walk(id); return n;
  };
  // AXIS_ONLY=1 이면 핵심 개념 이름도 가린다 — 축 이름만의 정보량을 잰다.
  // (핵심 개념 이름이 보이면 "성과사회" 한 단어로 책이 식별돼 축의 기여를 못 잰다)
  const maskCore = process.env.AXIS_ONLY === '1';
  const lines = [`책: ${MASK}`];
  let ci = 0;
  for (const top of kids(root.id)) {
    const mid = kids(top.id);
    const label = maskCore ? `핵심 개념 ${++ci} (이름 가림)` : top.title;
    if (!mid.length) { lines.push(`- ${maskCore ? '키워드 (이름 가림)' : top.title} (가려진 하위 ${deepCount(top.id)}개)`); continue; }
    lines.push(`- ${label}`);
    for (const m of mid) lines.push(`  - ${m.title} (가려진 하위 ${deepCount(m.id)}개)`);
  }
  return lines.join('\n');
}

const files = process.argv.slice(2);
if (!files.length) { console.error('런 파일 경로를 인자로 주세요 (예: runs/hier-auto-39.json)'); process.exit(1); }

const ds = JSON.parse(await readFile(resolve(__dir, 'golden/books50-memos.json'), 'utf-8'));
const existing = (await readdir(resolve(__dir, 'runs'))).map((f) => f.match(/^glance-(\d+)\.json$/)).filter(Boolean).map((m) => +m[1]);
let idx = existing.length ? Math.max(...existing) : 0;

console.log(`[GLANCE] 채점 모델 ${MODEL} · 대상 ${files.length}개 런`);

for (const f of files) {
  const run = JSON.parse(await readFile(resolve(__dir, f), 'utf-8'));
  const book = ds.books.find((b) => N(b.title) === N(run.label));
  if (!book) { console.log(`  ⚠ ${run.label} — 데이터셋에 없음`); continue; }
  const view = glanceView(run.tree);
  const truth = book.memos.map((m) => `[p.${m.p}] ${m.text}`).join('\n');

  // 식별 과제 — "이 책을 설명하라"는 느슨해서 축 이름이 흐릿해도 대충 맞는 말이 나온다
  // (첫 설계에서 4권 중 3권이 만점으로 포화됐다). 대신 **여러 후보 중 어느 책인지 맞히게**
  // 한다. 상위 층이 "사회적 영향·현대적 양상"뿐이면 어느 책인지 가릴 수 없어 바로 틀린다.
  // 오답 후보는 같은 데이터셋의 다른 책 요약이라 분야가 겹쳐 난이도가 유지된다.
  const summarize = (b) => b.memos.slice(0, 6).map((m) => m.text.slice(0, 60)).join(' / ');
  const others = ds.books.filter((b) => N(b.title) !== N(run.label) && b.memos.length >= 8);
  // 결정적 선택 — 런마다 후보가 달라지면 비교가 안 된다. 제목 해시로 고른다.
  const h = [...N(run.label)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const picks = [0, 1, 2].map((k) => others[(h + k * 37) % others.length]).filter(Boolean);
  const cands = [...picks, book];
  // 정답 위치도 고정 배치(해시)로 섞는다
  const order = cands.map((b, i) => ({ b, i })).sort((a, x) => ((h + a.i * 13) % 97) - ((h + x.i * 13) % 97));
  const answerIdx = order.findIndex((o) => N(o.b.title) === N(run.label));

  const idRaw = await llm({
    system: '어떤 책의 독서 위키를 **위 두 층만** 보여준다(책 제목은 가려져 있다). 아래 후보 중 이 위키가 어느 책의 것인지 고른다. 보이는 이름들만 근거로 삼아라. 이름이 뭉뚱그려져 어느 책인지 가릴 수 없으면 pick 을 -1 로 두어라 — 찍는 것보다 낫다. JSON만 출력.',
    user: `[위키 상위 2층]\n${view}\n\n[후보]\n${order.map((o, i) => `${i} | ${summarize(o.b)}`).join('\n')}\n\n출력 JSON: {"pick":0,"why":"어느 이름이 결정적이었는지 한 줄","decisive":["결정적이었던 축 이름"],"useless":["어느 책에나 해당해 도움이 안 된 축 이름"]}`,
    temperature: 0,
  });
  let idj = { pick: -1, why: '', decisive: [], useless: [] };
  try { idj = JSON.parse(idRaw); } catch { /* noop */ }
  const correct = Number(idj.pick) === answerIdx;

  const j = {
    score: correct ? 2 : (Number(idj.pick) === -1 ? 0 : 0),
    identified: correct,
    abstained: Number(idj.pick) === -1,
    reason: String(idj.why || ''),
    genericTerms: idj.useless || [],
    decisive: idj.decisive || [],
  };
  const reading = `식별: ${correct ? '성공' : (j.abstained ? '식별 불가(기권)' : '오답')} — ${j.reason}`;

  console.log(`  [${run.label}] ${correct ? '✓ 식별' : (j.abstained ? '✗ 식별 불가' : '✗ 오답')} — ${String(j.reason).slice(0, 55)}`);
  if (j.decisive?.length) console.log(`      결정적: ${j.decisive.join(', ')}`);
  if (j.genericTerms?.length) console.log(`      무용: ${j.genericTerms.join(', ')}`);

  const base = resolve(__dir, `runs/glance-${++idx}`);
  await writeFile(`${base}.json`, JSON.stringify({
    label: N(run.label), runAt: new Date().toISOString(), kind: 'glance',
    sourceRun: f, sourceVariant: run.variant || run.kind, model: MODEL,
    identified: j.identified, abstained: j.abstained, score: j.score, max: 2,
    reason: j.reason, decisive: j.decisive, genericTerms: j.genericTerms,
    candidates: order.map((o) => N(o.b.title)), answerIdx, pick: idj.pick,
    view, reading,
  }, null, 2) + '\n', 'utf-8');

  let md = `# ${N(run.label)} — 한눈 이해도(식별 과제)\n\n`;
  md += `- 대상 트리: \`${f}\` (${run.variant || run.kind})\n`;
  md += `- 결과: **${j.identified ? '식별 성공' : (j.abstained ? '식별 불가(기권)' : '오답')}** — ${j.reason}\n`;
  md += `- 후보: ${order.map((o, i) => `${i}. ${N(o.b.title)}${i === answerIdx ? ' ←정답' : ''}`).join(' · ')}\n`;
  if (j.decisive?.length) md += `- 결정적이었던 이름: ${j.decisive.join(' · ')}\n`;
  if (j.genericTerms?.length) md += `- 어느 책에나 해당해 무용했던 이름: ${j.genericTerms.join(' · ')}\n`;
  md += `\n## 보여준 것 (상위 2층 · 제목 가림)\n\n\`\`\`\n${view}\n\`\`\`\n`;
  await writeFile(`${base}.md`, md, 'utf-8');
}
console.log('\n✓ 완료');
