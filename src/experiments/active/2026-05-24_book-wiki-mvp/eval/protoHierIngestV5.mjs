// 위계 인제스트 프로토타입 v5 — 위계 생성 이원화 (BKT-342)
// 실행: node eval/protoHierIngestV5.mjs
// v4 대비 변경 (핵심):
//  - place 가 위계를 만든다: op ∈ {merge | child | parent | attach}
//     · merge  = 동의어 → 소스만 추가
//     · child  = 새 개념이 후보보다 좁음 → 후보 아래 자식으로
//     · parent = 새 개념이 후보(들)보다 넓음 → 새 노드 만들고 후보를 그 아래로 승격/재부모(adopt)
//     · attach = 무관 → root 직속 leaf
//  - cluster(Phase 2)는 "존중형": place가 만든 위계는 그대로 두고,
//     root 직속 & 자식 없는 고아 개념만 테마로 묶는다(기존 테마에 편입 허용).

import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

await loadDotEnvLocal(process.cwd());
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
const KEY = process.env.OPENAI_API_KEY;
const llm = openaiNodeTransport({ model: MODEL });
const MAX_LEVEL = 3; // 개념 위계 최대 깊이 (root=0 제외, 개념 L1~L3)

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

// ─── 책 (toc = 숨은 척추) ───────────────────────────────────────
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

// ─── 트리 ──────────────────────────────────────────────────────
let SEQ = 0; const id = () => `n${++SEQ}`;
const nodes = new Map(); const log = [];
const root = { id: id(), title: book.title, parentId: null, level: 0, kind: 'root', sources: [], emb: null };
nodes.set(root.id, root);
const concepts = () => [...nodes.values()].filter((n) => n.kind === 'concept');
const childrenOf = (pid) => [...nodes.values()].filter((n) => n.parentId === pid);
const ancestry = (n) => { const path = []; let c = n; while (c && c.parentId) { c = nodes.get(c.parentId); if (c && c.kind === 'concept') path.unshift(c.title); } return path.join(' › ') || '(최상위)'; };
const isAncestor = (aId, bId) => { let c = nodes.get(bId); while (c && c.parentId) { if (c.parentId === aId) return true; c = nodes.get(c.parentId); } return false; };
function addConcept(title, parentId, emb, gloss) {
  const lvl = nodes.get(parentId).level + 1;
  const n = { id: id(), title, parentId, level: lvl, kind: 'concept', sources: [], emb, gloss };
  nodes.set(n.id, n); return n;
}
// 서브트리 재부모 + 레벨 재계산
function reparent(nodeId, newParentId) {
  nodes.get(nodeId).parentId = newParentId;
  const relevel = (nid) => { const x = nodes.get(nid); x.level = nodes.get(x.parentId).level + 1; childrenOf(nid).forEach((k) => relevel(k.id)); };
  relevel(nodeId);
}
const subtreeDepth = (nid) => { const kids = childrenOf(nid); return kids.length ? 1 + Math.max(...kids.map((k) => subtreeDepth(k.id))) : 0; };
// 깊이 상한을 지키는 재부모 — 넘으면 옮기지 않고 false
function safeReparent(nodeId, newParentId) {
  const newLvl = nodes.get(newParentId).level + 1;
  if (newLvl + subtreeDepth(nodeId) > MAX_LEVEL) return false;
  reparent(nodeId, newParentId); return true;
}

const SYS = '너는 독서 메모를 "책별 개념 위계 트리"에 점진적으로 끼워넣는 사서다. 보이는 노드는 오직 메모에서 나온 개념뿐 — 책 목차는 위계를 잡는 참고용 숨은 척추일 뿐 절대 노드로 만들지 않는다. 같은 개념은 반드시 병합하고, 위계는 진짜 포함관계(상위=넓음, 하위=좁음)일 때만 만든다. JSON만 출력.';

// 1) 개념 추출 (문장당 핵심 1개, 정말 다르면 2개)
async function extract(memo) {
  const prompt = `[문장] ${memo.text}\n[내 생각] ${memo.my || '(없음)'}\n\n이 메모의 핵심 개념을 뽑아라. 기본 1개. 정말로 별개의 두 개념이 섞였을 때만 2개. 한 개념을 측면별로 쪼개지 마라(예: "질감"과 "기억"은 하나).\n⚠ "디자인"·"책"·"개념"·"정보"처럼 너무 일반적인 단어 금지 — 이 문장만의 구체적 키워드로(예: "재발견으로서의 디자인", "촉각 정보", "여백의 그릇").\n출력 JSON: {"concepts":[{"name":"짧은 명사구","gloss":"한 줄 설명"}]}`;
  const raw = await llm({ system: SYS, user: prompt, temperature: 0.1 });
  try { return (JSON.parse(raw).concepts || []).slice(0, 2); } catch { return []; }
}

// 2) 배치 결정 — 위계까지 판단 (merge | child | parent | attach)
async function place(memo, c, cand) {
  const existing = concepts().map((n) => `${n.id} | ${ancestry(n)} › ${n.title}`).join('\n') || '(아직 없음)';
  const prompt = `[숨은 척추 — 참고만, 노드로 만들지 마라]
책: ${book.title} (${book.category})
목차 흐름: ${book.toc.join(' · ')}

[새 개념] ${c.name} — ${c.gloss}
(출처 문장: ${memo.text})

[관련 후보 (임베딩 유사도 상위)]
${cand.length ? cand.map((x) => `${x.id} | ${ancestry(x.node)} › ${x.node.title} (유사도 ${x.sim.toFixed(2)})`).join('\n') : '(없음)'}

[현재 트리의 모든 개념]
${existing}

이 새 개념을 트리에 어떻게 꽂을지 판단하라. 위계는 **진짜 포함관계**일 때만 만든다:
- op="merge": 후보가 **같은 한 단어로 부를 같은 개념**(동의어·바꿔말하기)일 때만. targetId=그 후보. 관련·인접일 뿐이면 절대 merge 아님.
- op="child": 새 개념이 후보보다 **좁은 하위 개념**일 때. targetId=상위가 될 후보. (새 개념이 후보의 한 종류/사례/부분)
- op="parent": 새 개념이 후보(들)보다 **넓은 상위 개념**일 때. targetId=대표 후보, adoptIds=이 새 상위 아래로 함께 넣을 다른 기존 개념 id들(없으면 []). 남발 금지 — 명백히 상위일 때만.
- op="attach": 위 어디에도 안 맞으면 root 직속 leaf. targetId="${root.id}".
확신 없으면 attach. 위계는 최대 ${MAX_LEVEL}단까지만.
출력 JSON: {"op":"merge|child|parent|attach","targetId":"n?","adoptIds":["n?"],"reason":"한 줄"}`;
  const raw = await llm({ system: SYS, user: prompt, temperature: 0.1 });
  try { return JSON.parse(raw); } catch { return { op: 'attach', targetId: root.id, reason: 'parse-fail' }; }
}

// ─── Phase 1: 추출 → kNN → 위계 배치 ───────────────────────────
log.push(`[Phase0] 목차=숨은 척추(노드 없음). root=책 1개. 위계 이원화(place+cluster), 최대 ${MAX_LEVEL}단.`);
for (const memo of memos) {
  for (const c of await extract(memo)) {
    const emb = await embed(`${c.name}: ${c.gloss}`);
    const cand = concepts().map((n) => ({ id: n.id, node: n, sim: cos(emb, n.emb) })).filter((x) => x.node.emb).sort((a, b) => b.sim - a.sim).slice(0, 4).filter((x) => x.sim > 0.3);
    const d = await place(memo, c, cand);
    const tgt = nodes.get(d.targetId);
    const validConcept = tgt && tgt.kind === 'concept';

    if (d.op === 'merge' && validConcept) {
      tgt.sources.push(memo.p);
      log.push(`[merge]  p${memo.p} · "${c.name}" → ${tgt.id} ${tgt.title}  (${d.reason})`);

    } else if (d.op === 'child' && validConcept && tgt.level < MAX_LEVEL) {
      const n = addConcept(c.name, tgt.id, emb, c.gloss); n.sources.push(memo.p);
      log.push(`[child]  p${memo.p} · "${c.name}" → ${n.id} ⊂ ${tgt.title} (L${n.level})  (${d.reason})`);

    } else if (d.op === 'parent' && validConcept) {
      // 새 개념을 후보의 현재 부모 아래에 만들고, 후보(+adopt)를 그 아래로 승격
      const grand = nodes.get(tgt.parentId) || root;
      if (grand.level + 1 > MAX_LEVEL) { // 너무 깊어지면 그냥 root leaf
        const n = addConcept(c.name, root.id, emb, c.gloss); n.sources.push(memo.p);
        log.push(`[attach*] p${memo.p} · "${c.name}" → ${n.id} (parent 승격이 깊이 초과 → root)  (${d.reason})`);
      } else {
        const n = addConcept(c.name, grand.id, emb, c.gloss); n.sources.push(memo.p);
        const adopt = [d.targetId, ...(d.adoptIds || [])]
          .filter((aid, i, arr) => arr.indexOf(aid) === i)
          .map((aid) => nodes.get(aid))
          .filter((x) => x && x.kind === 'concept' && x.id !== n.id && x.id !== n.parentId && !isAncestor(x.id, n.id));
        for (const a of adopt) if (n.level + 1 + subtreeDepth(a.id) <= MAX_LEVEL) reparent(a.id, n.id);
        log.push(`[parent] p${memo.p} · "${c.name}"(${n.id},L${n.level}) ⊃ [${adopt.map((a) => a.title).join(', ')}]  (${d.reason})`);
      }

    } else {
      const n = addConcept(c.name, root.id, emb, c.gloss); n.sources.push(memo.p);
      log.push(`[attach] p${memo.p} · "${c.name}" → ${n.id} (root)  (${d.reason})`);
    }
  }
}

// ─── Phase 1.5: 동의어 병합 패스 — greedy place가 놓친 동의어를 임베딩쌍으로 잡는다 ──
{
  const cs = concepts().filter((n) => n.emb);
  const pairs = [];
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const sim = cos(cs[i].emb, cs[j].emb);
    if (sim > 0.55) pairs.push({ a: cs[i], b: cs[j], sim });
  }
  pairs.sort((x, y) => y.sim - x.sim);
  const dead = new Set(); // 이미 병합돼 사라진 노드
  for (const { a, b, sim } of pairs) {
    if (dead.has(a.id) || dead.has(b.id)) continue;
    if (isAncestor(a.id, b.id) || isAncestor(b.id, a.id)) continue; // 위계관계면 병합 아님
    const prompt = `책 "${book.title}"에서 나온 두 개념이 **같은 한 단어로 부를 같은 개념**(동의어·바꿔말하기)인가, 아니면 관련될 뿐 다른 개념인가?\n관련·인접·같은 테마일 뿐이면 "다름"이다. 확신 없으면 "다름".\nA: ${a.title} — ${a.gloss || ''}\nB: ${b.title} — ${b.gloss || ''}\n출력 JSON: {"same":true|false,"keep":"A|B","reason":"한 줄"}`;
    const raw = await llm({ system: SYS, user: prompt, temperature: 0 });
    let d; try { d = JSON.parse(raw); } catch { continue; }
    if (!d.same) continue;
    const keep = d.keep === 'B' ? b : a; const drop = keep === a ? b : a;
    // drop의 자식을 keep으로 이관, 소스 합치기, drop 제거
    for (const k of childrenOf(drop.id)) reparent(k.id, keep.id);
    keep.sources.push(...drop.sources);
    nodes.delete(drop.id); dead.add(drop.id);
    log.push(`[merge*] "${drop.title}" → "${keep.title}" (sim ${sim.toFixed(2)}, ${d.reason})`);
  }
}

// ─── Phase 2: 존중형 군집화 — root 직속 & 자식 없는 고아만 묶는다 ──
{
  const orphans = concepts().filter((n) => n.parentId === root.id && childrenOf(n.id).length === 0);
  const existingThemes = concepts().filter((n) => n.parentId === root.id && childrenOf(n.id).length > 0);
  if (orphans.length) {
    const prompt = `[숨은 척추 — 참고만, 제목을 노드로 복붙 금지] 책 "${book.title}" 목차 흐름: ${book.toc.join(' · ')}

place 단계가 이미 만든 위계는 건드리지 않는다. 아래 [고아 개념]들만 상위 테마로 묶어라.
⚠ 무리한 편입 절대 금지 — 대부분의 고아는 최상위에 그대로 남는 게 정상이다. 억지로 다 묶지 마라.
- 편입은 그 고아가 기존 테마의 **명백한 하위 구성원**일 때만(themeId). 단지 관련·인접이면 편입하지 마라.
- 여러 고아(≥2)가 **하나의 자명한 상위 개념**으로 자연히 묶일 때만 새 테마 생성(newTheme). 테마명은 자식 이름과 달라야 하고 목차 복붙 금지.
- 확신이 조금이라도 없으면 둘 다 비워 최상위에 남겨라.

[기존 상위 테마]
${existingThemes.length ? existingThemes.map((n) => `${n.id} | ${n.title} — 자식: ${childrenOf(n.id).map((k) => k.title).join(', ')}`).join('\n') : '(없음)'}

[고아 개념]
${orphans.map((k) => `${k.id}: ${k.title} — ${k.gloss || ''}`).join('\n')}

출력 JSON: {"assign":[{"id":"고아 id","themeId":"기존 테마 id 또는 빈문자열","newTheme":"새 테마명 또는 빈문자열"}]}`;
    const raw = await llm({ system: SYS, user: prompt, temperature: 0.1 });
    let out; try { out = JSON.parse(raw); } catch { out = { assign: [] }; }
    const assigns = (out.assign || []).filter((a) => nodes.get(a.id)?.parentId === root.id);
    // 1) 기존 테마 편입은 즉시
    for (const a of assigns) {
      const leaf = nodes.get(a.id);
      if (a.themeId && nodes.get(a.themeId)?.kind === 'concept' && a.themeId !== leaf.id) {
        if (safeReparent(leaf.id, a.themeId)) log.push(`[cluster] "${leaf.title}" → 기존 테마 ${nodes.get(a.themeId).title}`);
        else log.push(`[cluster] "${leaf.title}" 편입 스킵(깊이 초과)`);
      }
    }
    // 2) 새 테마는 고아 ≥2개 & 이름이 자식과 다를 때만 생성 (1개짜리 동명 중첩 방지)
    const groups = new Map();
    for (const a of assigns) {
      const leaf = nodes.get(a.id); if (leaf.parentId !== root.id) continue; // 이미 편입됨
      const key = (a.newTheme || '').trim();
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(leaf);
    }
    for (const [key, members] of groups) {
      const meaningful = members.filter((m) => m.title.trim() !== key);
      if (meaningful.length < 2) { log.push(`[cluster] 테마 "${key}" 스킵(고아 ${meaningful.length}개 → 최상위 유지)`); continue; }
      const t = addConcept(key, root.id, null, '테마');
      log.push(`[cluster] 새 테마 "${key}"(${t.id}) ← ${meaningful.map((m) => m.title).join(', ')}`);
      for (const m of meaningful) safeReparent(m.id, t.id);
    }
  }
}

// ─── 출력 ──────────────────────────────────────────────────────
function render(pid = root.id, depth = 0) {
  const n = nodes.get(pid);
  const src = n.sources.length ? `  ·p${n.sources.join(',p')}` : '';
  console.log(`${'  '.repeat(depth)}${n.kind === 'root' ? '■' : '•'} ${n.title}${src}`);
  for (const k of childrenOf(pid)) render(k.id, depth + 1);
}
console.log('\n================ v5 결과 트리 (위계 이원화) ================\n');
render();
const maxDepth = Math.max(...[...nodes.values()].map((n) => n.level));
const cnt = (t) => log.filter((l) => l.startsWith(`[${t}]`)).length;
console.log(`\n개념 ${concepts().length} | 최대 깊이 L${maxDepth} | merge ${cnt('merge')} · child ${cnt('child')} · parent ${cnt('parent')} · attach ${cnt('attach')} · cluster ${cnt('cluster')} | 메모 ${memos.length}`);
console.log('\n================ 로그 ================\n' + log.join('\n'));
