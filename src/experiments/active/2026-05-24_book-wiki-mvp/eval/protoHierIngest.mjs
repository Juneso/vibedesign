// 위계 인제스트 프로토타입 — 골격 seed → 문장당 점진 부착 → fan-out 재정리
// 실행: node eval/protoHierIngest.mjs
// 목적: BKT-342 "개념 위계 구조화" 로직을 실제 LLM으로 검증.
// 주의: 아래 memos 는 "디자인의 디자인"(하라 켄야) 주제를 패러프레이즈한 *테스트 픽스처*.
//       golden seed 아님 (AI 보조 입력). 로직 검증용.

import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

await loadDotEnvLocal(process.cwd());
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
const llm = openaiNodeTransport({ model: MODEL });

// ─── 책 골격 (toc·카테고리·소개) ───────────────────────────────
const book = {
  title: '디자인의 디자인',
  author: '하라 켄야',
  category: '예술/디자인 > 디자인 이론',
  summary:
    '디자인을 "새로운 것을 만드는 일"이 아니라 "이미 아는 것을 낯설게 되돌아보게 하는 일"로 다시 정의한다. 리디자인·정보의 건축·오감·여백(엠프티니스)·무인양품을 통해 디자인의 본질을 탐구.',
  toc: [
    '디자인이라는 것의 발견',
    'RE-DESIGN: 21세기의 일상',
    '정보의 건축이라는 사고',
    'HAPTIC: 감각의 깨어남',
    '무인양품의 비전',
    '엑스포메이션 — 미지화',
  ],
};

// ─── 수집 문장 (테스트 픽스처) ─────────────────────────────────
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

// ─── 트리 상태 ─────────────────────────────────────────────────
let SEQ = 0;
const id = (pre) => `${pre}${++SEQ}`;
const nodes = new Map(); // id -> {id, title, parentId, level, kind, sources[]}
const log = [];
const add = (title, parentId, kind) => {
  const level = parentId ? (nodes.get(parentId).level + 1) : 0;
  const n = { id: id('n'), title, parentId, level, kind, sources: [] };
  nodes.set(n.id, n);
  return n;
};
const childrenOf = (pid) => [...nodes.values()].filter((n) => n.parentId === pid);
const treeText = () =>
  [...nodes.values()]
    .map((n) => `${n.id} | L${n.level} | parent=${n.parentId || '-'} | ${n.title}${n.sources.length ? ` (출처 ${n.sources.length})` : ''}`)
    .join('\n');

// ─── Phase 0: 골격 seed (root + toc 테마) ──────────────────────
const root = add(book.title, null, 'skeleton');
for (const t of book.toc) add(t, root.id, 'skeleton');
log.push(`[Phase0] 골격 seed: root + toc ${book.toc.length}개 테마`);

// ─── Phase 1: 문장당 점진 부착 ─────────────────────────────────
const SYS = '너는 독서 메모를 책별 "개념 위계 트리"에 점진적으로 끼워넣는 사서다. 트리는 안정적이어야 한다 — 기존 노드를 함부로 흔들지 말고, 새 개념은 가장 알맞은 부모 밑에 붙이거나(같은 개념이면) 병합한다. 새 상위개념을 남발하지 말 것. JSON만 출력.';

function placePrompt(memo) {
  return `[책 골격]
제목: ${book.title} / 분류: ${book.category}
목차: ${book.toc.join(' · ')}

[현재 트리]
${treeText()}

[새 메모]
문장: ${memo.text}
내 생각: ${memo.my || '(없음)'}

이 메모가 담은 핵심 개념을 1~2개만 뽑아 트리에 배치하라.
각 개념마다:
- op="merge": 이미 같은 개념 노드가 있으면 그 노드에 출처만 추가. targetId=병합할 기존 노드 id.
- op="attach": 새 개념 노드를 만들어 가장 알맞은 기존 노드(보통 toc 테마 또는 상위개념) 밑에 붙임. targetId=부모 id, title=새 개념명(짧은 명사구).
규칙: 적절한 상위개념이 이미 트리에 있으면 toc 테마가 아니라 그 상위개념 밑에 붙여라(위계를 키워라). 확신 없으면 가장 가까운 toc 테마 밑에.
출력 JSON: {"placements":[{"concept":"...","op":"merge|attach","targetId":"n?","title":"...","reason":"한 줄"}]}`;
}

for (const memo of memos) {
  const raw = await llm({ system: SYS, user: placePrompt(memo), temperature: 0.2 });
  let out;
  try { out = JSON.parse(raw); } catch { log.push(`[부착] p${memo.p} 파싱 실패: ${raw.slice(0, 80)}`); continue; }
  for (const pl of out.placements || []) {
    if (pl.op === 'merge' && nodes.has(pl.targetId)) {
      nodes.get(pl.targetId).sources.push(memo.p);
      log.push(`[부착] p${memo.p} · "${pl.concept}" → 병합 → ${pl.targetId} ${nodes.get(pl.targetId).title}`);
    } else {
      const parent = nodes.has(pl.targetId) ? pl.targetId : root.id;
      const n = add(pl.title || pl.concept, parent, 'concept');
      n.sources.push(memo.p);
      log.push(`[부착] p${memo.p} · "${pl.concept}" → 신규 ${n.id} (부모 ${parent} ${nodes.get(parent).title}) — ${pl.reason || ''}`);
    }
  }
}

// ─── Phase 2: fan-out 재정리 (자식 과다 → 중간개념 그룹) ────────
const FANOUT = 4;
for (const node of [...nodes.values()]) {
  const kids = childrenOf(node.id).filter((k) => k.kind === 'concept');
  if (kids.length <= FANOUT) continue;
  const prompt = `부모 노드 "${node.title}" 밑에 다음 개념들이 너무 많이 직접 붙어 있다(${kids.length}개). 비슷한 것끼리 2~3개의 중간 상위개념으로 묶어라. 묶을 필요 없는 건 그대로 둬도 된다.
개념들:
${kids.map((k) => `- ${k.id}: ${k.title}`).join('\n')}
출력 JSON: {"groups":[{"newParent":"중간개념명","childIds":["n?","n?"]}]}`;
  const raw = await llm({ system: SYS, user: prompt, temperature: 0.2 });
  let out; try { out = JSON.parse(raw); } catch { continue; }
  for (const g of out.groups || []) {
    if (!g.childIds || g.childIds.length < 2) continue;
    const mid = add(g.newParent, node.id, 'concept');
    for (const cid of g.childIds) if (nodes.has(cid)) { nodes.get(cid).parentId = mid.id; nodes.get(cid).level = mid.level + 1; }
    log.push(`[재정리] "${node.title}" 밑 ${g.childIds.length}개 → 중간개념 "${g.newParent}"(${mid.id})로 묶음`);
  }
}

// ─── 출력 ──────────────────────────────────────────────────────
function render(pid = root.id, depth = 0) {
  const n = nodes.get(pid);
  const tag = n.kind === 'skeleton' ? '◇' : '•';
  const src = n.sources.length ? `  ·출처 p${n.sources.join(',p')}` : '';
  console.log(`${'  '.repeat(depth)}${tag} ${n.title}${src}`);
  for (const k of childrenOf(pid)) render(k.id, depth + 1);
}

console.log('\n================ 결과 트리 (◇=골격, •=개념) ================\n');
render();
const concepts = [...nodes.values()].filter((n) => n.kind === 'concept');
const maxDepth = Math.max(...[...nodes.values()].map((n) => n.level));
console.log(`\n노드: 골격 ${[...nodes.values()].filter((n)=>n.kind==='skeleton').length} + 개념 ${concepts.length} | 최대 깊이 L${maxDepth} | 메모 ${memos.length}개`);
console.log('\n================ 인제스트 로그 ================\n');
console.log(log.join('\n'));
