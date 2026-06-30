// 위계 인제스트 프로토타입 v2 — 목차=숨은 척추, 병합 우선(kNN), 1개념/문장, 재정리 위생
// 실행: node eval/protoHierIngestV2.mjs
// BKT-342. v1 대비 변경:
//  - 목차를 노드로 만들지 않는다(숨은 척추, 프롬프트 참고용). 보이는 노드 = 문장에서 나온 키워드뿐.
//  - 부착 전 임베딩 kNN으로 "같은 개념 후보"를 LLM에 제시 → 병합 우선.
//  - 문장당 핵심 1개념(정말 다르면 2개). 재정리 시 중간개념 이름이 자식과 겹치지 않게.

import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

await loadDotEnvLocal(process.cwd());
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
const KEY = process.env.OPENAI_API_KEY;
const llm = openaiNodeTransport({ model: MODEL });

async function embed(text) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || 'embed fail');
  return d.data[0].embedding;
}
const cos = (a, b) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return s / (Math.sqrt(na) * Math.sqrt(nb)); };

// ─── 책 (toc = 숨은 척추, 노드로 만들지 않음) ───────────────────
const book = {
  title: '디자인의 디자인', author: '하라 켄야', category: '예술/디자인 > 디자인 이론',
  toc: ['디자인이라는 것의 발견', 'RE-DESIGN: 21세기의 일상', '정보의 건축이라는 사고', 'HAPTIC: 감각의 깨어남', '무인양품의 비전', '엑스포메이션 — 미지화'],
};
const memos = [
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

// ─── 트리 (root = 책 1개. 나머지는 전부 문장 키워드) ───────────
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

const SYS = '너는 독서 메모를 "책별 개념 위계 트리"에 점진적으로 끼워넣는 사서다. 보이는 노드는 오직 문장에서 나온 개념뿐 — 책 목차는 위계를 잡는 참고용 숨은 척추일 뿐 절대 노드로 만들지 않는다. 같은 개념은 반드시 병합하고, 새 상위개념을 남발하지 않는다. JSON만 출력.';

// 1) 개념 추출 (문장당 핵심 1개, 정말 다르면 2개)
async function extract(memo) {
  const prompt = `[문장] ${memo.text}\n[내 생각] ${memo.my || '(없음)'}\n\n이 메모의 핵심 개념을 뽑아라. 기본 1개. 정말로 별개의 두 개념이 섞였을 때만 2개. 한 개념을 측면별로 쪼개지 마라(예: "질감"과 "기억"은 하나).\n⚠ "디자인"·"책"·"개념"·"정보"처럼 너무 일반적인 단어 금지 — 이 문장만의 구체적 키워드로(예: "재발견으로서의 디자인", "촉각 정보", "여백의 그릇").\n출력 JSON: {"concepts":[{"name":"짧은 명사구","gloss":"한 줄 설명"}]}`;
  const raw = await llm({ system: SYS, user: prompt, temperature: 0.1 });
  try { return (JSON.parse(raw).concepts || []).slice(0, 2); } catch { return []; }
}

// 2) 배치 결정 (kNN 병합 후보 + 숨은 척추 참고)
async function place(memo, c, cand) {
  const existing = concepts().map((n) => `${n.id} | ${ancestry(n)} › ${n.title}`).join('\n') || '(아직 없음)';
  const prompt = `[숨은 척추 — 참고만, 노드로 만들지 마라]
책: ${book.title} (${book.category})
목차 흐름: ${book.toc.join(' · ')}

[새 개념] ${c.name} — ${c.gloss}
(출처 문장: ${memo.text})

[같은 개념 후보 (임베딩 유사도 상위)]
${cand.length ? cand.map((x) => `${x.id} | ${ancestry(x.node)} › ${x.node.title} (유사도 ${x.sim.toFixed(2)})`).join('\n') : '(없음)'}

[현재 트리의 모든 개념]
${existing}

판단 (병합은 엄격하게):
1) op="merge" 는 후보가 **같은 한 단어로 부를 같은 개념**(동의어·바꿔말하기)일 때만. 단지 관련/인접/같은 테마면 절대 병합하지 마라 — 그건 attach. 확신 없으면 attach.
2) op="attach": 새 leaf 노드를 만든다. 이 단계에선 위계를 만들지 않는다 → targetId 항상 "${root.id}"(책 루트). 상위개념 묶기는 나중 재정리가 한다. 목차 제목을 노드로 만들지 마라.
출력 JSON: {"op":"merge|attach","targetId":"n?","reason":"한 줄"}`;
  const raw = await llm({ system: SYS, user: prompt, temperature: 0.1 });
  try { return JSON.parse(raw); } catch { return { op: 'attach', targetId: root.id, reason: 'parse-fail' }; }
}

// ─── Phase 1: 추출 → kNN → 배치 ────────────────────────────────
log.push('[Phase0] 목차는 숨은 척추(노드 없음). root = 책 1개.');
for (const memo of memos) {
  for (const c of await extract(memo)) {
    const emb = await embed(`${c.name}: ${c.gloss}`);
    const cand = concepts().map((n) => ({ id: n.id, node: n, sim: cos(emb, n.emb) })).sort((a, b) => b.sim - a.sim).slice(0, 3).filter((x) => x.sim > 0.3);
    const d = await place(memo, c, cand);
    if (d.op === 'merge' && nodes.get(d.targetId)?.kind === 'concept') {
      nodes.get(d.targetId).sources.push(memo.p);
      log.push(`[부착] p${memo.p} · "${c.name}" → 병합 → ${d.targetId} ${nodes.get(d.targetId).title}  (${d.reason})`);
    } else {
      const parent = nodes.has(d.targetId) ? d.targetId : root.id;
      const n = addConcept(c.name, parent, emb, c.gloss);
      n.sources.push(memo.p);
      log.push(`[부착] p${memo.p} · "${c.name}" → 신규 ${n.id} (부모: ${nodes.get(parent).title})  (${d.reason})`);
    }
  }
}

// ─── Phase 2: 재정리 = 구조 담당 (다회전, 큰 그룹 재귀, 숨은 목차 참고) ──
const FANOUT = 3;
async function reorg(node) {
  const kids = childrenOf(node.id);
  if (kids.length <= FANOUT) return false;
  const prompt = `[숨은 척추 — 참고만, 이 제목을 노드로 쓰지 마라] 책 "${book.title}" 목차 흐름: ${book.toc.join(' · ')}

부모 "${node.title === book.title ? '(책 전체)' : node.title}" 밑 개념들을 비슷한 것끼리 2~3개의 상위개념으로 묶어라.
- 상위개념 이름은 개념들을 아우르는 **발생적 이름**(목차 제목 복붙 금지, 자식 이름과 동일 금지).
- 명백히 안 어울리는 건 묶지 말고 그대로 둬라(모두 묶을 필요 없음).
개념: ${kids.map((k) => `${k.id}:${k.title}`).join(' / ')}
출력 JSON: {"groups":[{"newParent":"상위개념명","childIds":["n?","n?"]}]}`;
  const raw = await llm({ system: SYS, user: prompt, temperature: 0.1 });
  let out; try { out = JSON.parse(raw); } catch { return false; }
  let changed = false;
  for (const g of out.groups || []) {
    if (!g.childIds || g.childIds.length < 2) continue;
    if (kids.some((k) => k.title === g.newParent)) g.newParent += ' (상위)';
    const mid = addConcept(g.newParent, node.id, null, '재정리 상위개념');
    for (const cid of g.childIds) if (nodes.has(cid) && nodes.get(cid).parentId === node.id) { nodes.get(cid).parentId = mid.id; nodes.get(cid).level = mid.level + 1; }
    log.push(`[재정리] "${node.title}" 밑 ${g.childIds.length}개 → 상위개념 "${g.newParent}"(${mid.id})`);
    changed = true;
  }
  return changed;
}
for (let round = 0; round < 3; round++) {
  let any = false;
  for (const node of [...nodes.values()]) if (node.kind !== 'concept' || childrenOf(node.id).length) if (await reorg(node)) any = true;
  if (!any) break;
}

// ─── 출력 ──────────────────────────────────────────────────────
function render(pid = root.id, depth = 0) {
  const n = nodes.get(pid);
  const tag = n.kind === 'root' ? '■' : '•';
  const src = n.sources.length ? `  ·p${n.sources.join(',p')}` : '';
  console.log(`${'  '.repeat(depth)}${tag} ${n.title}${src}`);
  for (const k of childrenOf(pid)) render(k.id, depth + 1);
}
console.log('\n================ v2 결과 트리 (목차 비가시) ================\n');
render();
const maxDepth = Math.max(...[...nodes.values()].map((n) => n.level));
const merges = log.filter((l) => l.includes('병합')).length;
console.log(`\n개념 노드 ${concepts().length} | 최대 깊이 L${maxDepth} | 병합 ${merges}회 | 메모 ${memos.length}개`);
console.log('\n================ 로그 ================\n' + log.join('\n'));
