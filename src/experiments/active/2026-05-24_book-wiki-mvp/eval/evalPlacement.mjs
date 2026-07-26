// 배치 테스트(placement) — "라벨만 보고 메모를 제자리에 놓을 수 있는가"
//
// 축은 내용을 담는 그릇이 아니라 **관계 라벨**이다(확정된 설계 의도). 그러니 축을
// "책을 알아볼 수 있는 정보를 담았는가"로 재는 건 애초에 틀린 시험이다(식별 과제는
// 세 번 연속 포화됐다). 축이 할 일은 유저 대신 내용을 조직해 주는 것이므로,
// 물어야 할 것은 **"처음 보는 사람이 이 라벨만 보고 메모를 제자리에 놓는가"** 다.
//
// 핵심은 기준선 비교다:
//   - 랜덤 배치 = 바닥
//   - **임베딩 최근접 배치** = 진짜 기준선. 라벨 없이 문장↔키워드 유사도만으로 놓는다.
//     우리 구조가 이걸 못 이기면 관계 라벨은 값을 못 하는 것이다.
//
// 사용: node eval/evalPlacement.mjs runs/hier-auto-45.json [...]
// 결과: runs/placement-{N}.json + .md (시리즈 placement)
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);

const N = (s) => String(s || '').normalize('NFC');
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
const KEY = process.env.OPENAI_API_KEY;
const llm = openaiNodeTransport({ model: MODEL });
const SAMPLE = +(process.env.SAMPLE || 20); // 책당 검사할 문장 수

async function embed(texts) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || 'embed fail');
  return d.data.map((x) => x.embedding);
}
const cos = (a, b) => { let s = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return s / (Math.sqrt(x) * Math.sqrt(y) || 1); };

// 후보 = 문장을 받을 수 있는 자리(키워드). 각 자리는 조상 경로를 함께 보여준다 —
// 라벨의 값어치는 경로 전체("성과사회 > 구성 요소·분석 > 자기 착취")에서 나온다.
function slots(tree) {
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const path = (n) => { const out = []; let c = n; while (c && c.kind !== 'root') { out.unshift(N(c.title)); c = byId.get(c.parentId); } return out.join(' > '); };
  return tree.nodes
    .filter((n) => n.kind === 'concept' && !tree.nodes.some((x) => x.parentId === n.id && x.kind === 'concept'))
    .map((n) => ({ id: n.id, label: path(n), title: N(n.title) }));
}

const files = process.argv.slice(2);
if (!files.length) { console.error('런 파일 경로를 인자로 주세요 (예: runs/hier-auto-45.json)'); process.exit(1); }

const existing = (await readdir(resolve(__dir, 'runs'))).map((f) => f.match(/^placement-(\d+)\.json$/)).filter(Boolean).map((m) => +m[1]);
let idxN = existing.length ? Math.max(...existing) : 0;

console.log(`[PLACEMENT] 배치 모델 ${MODEL} · 대상 ${files.length}개 런 · 문장 ${SAMPLE}개/책`);

for (const f of files) {
  const run = JSON.parse(await readFile(resolve(__dir, f), 'utf-8'));
  const tree = run.tree;
  const sl = slots(tree);
  if (sl.length < 3) { console.log(`  ⚠ ${N(run.label)} — 자리가 ${sl.length}개뿐이라 건너뜀`); continue; }

  // 정답 = 파이프라인이 실제로 놓은 자리. 문장의 부모가 후보 자리 중 하나여야 한다.
  const slotIds = new Set(sl.map((s) => s.id));
  const items = tree.nodes.filter((n) => n.kind === 'sentence' && slotIds.has(n.parentId));
  if (items.length < 3) { console.log(`  ⚠ ${N(run.label)} — 채점 가능한 문장이 ${items.length}개뿐이라 건너뜀`); continue; }
  // 결정적 표본 — 런마다 문장이 달라지면 비교가 안 된다.
  const h = [...N(run.label)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const pick = items.map((n, i) => ({ n, k: (h + i * 2654435761) >>> 0 })).sort((a, b) => a.k - b.k).slice(0, SAMPLE).map((x) => x.n);

  // ── 기준선: 임베딩 최근접 ──
  // 자리를 그 자리에 이미 놓인 문장들로 대표시킨다. 단, 정답 자리에는 검사 문장 자신이
  // 들어 있어서 그대로 재면 자기 자신과의 유사도를 재는 셈이 된다 — 기준선이 부당하게
  // 유리해진다. 그래서 문장 단위로 임베딩해 두고, 채점할 때 자기 자신만 빼고 비교한다.
  const allSents = tree.nodes.filter((n) => n.kind === 'sentence' && slotIds.has(n.parentId));
  const sentVec = new Map();
  for (let i = 0; i < allSents.length; i += 96) {
    const chunk = allSents.slice(i, i + 96);
    const vs = await embed(chunk.map((n) => N(n.title).slice(0, 500)));
    chunk.forEach((n, k) => sentVec.set(n.id, vs[k]));
  }
  // 문장이 하나도 없는 자리는 이름으로 대표한다(그마저 없으면 후보에서 빠진다).
  const emptySlots = sl.filter((s) => !allSents.some((n) => n.parentId === s.id));
  const emptyVec = new Map();
  if (emptySlots.length) {
    const vs = await embed(emptySlots.map((s) => s.title));
    emptySlots.forEach((s, k) => emptyVec.set(s.id, vs[k]));
  }
  let baseHit = 0, baseDone = 0;
  for (const n of pick) {
    const q = sentVec.get(n.id);
    let best = null;
    for (const s of sl) {
      const mem = allSents.filter((x) => x.parentId === s.id && x.id !== n.id);
      // 자리 점수 = 그 자리 문장들과의 최대 유사도 (자기 자신 제외)
      const sc = mem.length ? Math.max(...mem.map((x) => cos(q, sentVec.get(x.id))))
        : emptyVec.has(s.id) ? cos(q, emptyVec.get(s.id)) : -1;
      if (!best || sc > best.sc) best = { id: s.id, sc };
    }
    baseDone++;
    if (best.id === n.parentId) baseHit++;
  }

  // ── 본 시험: 라벨 경로만 보고 배치 ──
  const menu = sl.map((s, i) => `${i} | ${s.label}`).join('\n');
  const raw = await llm({
    system: '독서 위키의 자리 목록(경로)만 보고, 주어진 메모 문장을 어느 자리에 놓아야 할지 고른다. 자리에 실제로 들어 있는 내용은 보이지 않는다 — **이름만으로** 판단하라. 이름이 뭉뚱그려져 어디에 놓을지 정할 수 없으면 -1 을 쓴다(찍는 것보다 낫다). JSON만 출력.',
    user: `[자리 목록]\n${menu}\n\n[놓을 문장]\n${pick.map((n, i) => `${i}. ${N(n.title).slice(0, 160)}`).join('\n')}\n\n출력 JSON: {"place":[{"i":0,"slot":3}]}`,
    temperature: 0,
  });
  let j = { place: [] };
  try { j = JSON.parse(raw); } catch { /* noop */ }
  const got = new Map((Array.isArray(j.place) ? j.place : []).map((p) => [Number(p.i), Number(p.slot)]));

  let hit = 0, abstain = 0, miss = [];
  pick.forEach((n, i) => {
    const s = got.has(i) ? got.get(i) : -1;
    if (s === -1 || !sl[s]) { abstain++; return; }
    if (sl[s].id === n.parentId) hit++;
    else miss.push({ text: N(n.title).slice(0, 70), put: sl[s].label, should: sl.find((x) => x.id === n.parentId)?.label || '?' });
  });
  const n = pick.length;
  const rate = hit / n, baseRate = baseHit / (baseDone || 1), rnd = 1 / sl.length;

  const verdict = rate > baseRate + 0.05 ? '라벨이 임베딩보다 낫다'
    : rate < baseRate - 0.05 ? '라벨이 임베딩보다 못하다 — 관계 라벨이 값을 못 하고 있다'
    : '임베딩과 사실상 같다 — 라벨의 추가 기여가 확인되지 않는다';

  console.log(`  [${N(run.label)}] 자리 ${sl.length}개 · 문장 ${n}개`);
  console.log(`      라벨 배치 ${(rate * 100).toFixed(0)}% (기권 ${abstain}) vs 임베딩 ${(baseRate * 100).toFixed(0)}% vs 랜덤 ${(rnd * 100).toFixed(0)}% → ${verdict}`);

  const base = resolve(__dir, `runs/placement-${++idxN}`);
  await writeFile(`${base}.json`, JSON.stringify({
    label: N(run.label), runAt: new Date().toISOString(), kind: 'placement',
    sourceRun: f, sourceVariant: run.variant || run.kind, model: MODEL,
    nSlots: sl.length, nSentences: n,
    labelRate: +rate.toFixed(3), embedRate: +baseRate.toFixed(3), randomRate: +rnd.toFixed(3),
    hits: hit, abstained: abstain, verdict, misses: miss,
    reading: `라벨 ${(rate * 100).toFixed(0)}% · 임베딩 기준선 ${(baseRate * 100).toFixed(0)}% · 랜덤 ${(rnd * 100).toFixed(0)}% — ${verdict}`,
  }, null, 2) + '\n', 'utf-8');

  let md = `# ${N(run.label)} — 배치 테스트\n\n`;
  md += `- 대상 트리: \`${f}\` (${run.variant || run.kind}) · 자리 ${sl.length}개 · 문장 ${n}개\n`;
  md += `- **라벨 배치 ${(rate * 100).toFixed(0)}%** · 임베딩 기준선 ${(baseRate * 100).toFixed(0)}% · 랜덤 ${(rnd * 100).toFixed(0)}%\n`;
  md += `- 기권 ${abstain}건 (라벨이 모호해 놓을 데를 못 정한 경우)\n`;
  md += `- 판정: **${verdict}**\n`;
  if (miss.length) {
    md += `\n## 어긋난 배치\n\n라벨이 오해를 부르거나, 파이프라인이 잘못 놓았거나 — 어느 쪽이든 고칠 거리다.\n\n`;
    for (const m of miss) md += `- "${m.text}"\n  - 라벨만 보고 놓은 곳: ${m.put}\n  - 실제로 놓여 있는 곳: ${m.should}\n`;
  }
  await writeFile(`${base}.md`, md, 'utf-8');
}
console.log('\n✓ 완료');
