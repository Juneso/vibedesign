// 저장했다 불러온 트리에 동화가 되는지 — 회귀 테스트 (BKT-383)
//
// **무엇을 막는가.** serializeTree 는 용량 때문에 emb 를 빼고 저장한다. 불러온 뒤
// 되살리지 않으면 모든 유사도가 -1 이 되고, 후보 하한(0.2)에 전부 걸려 후보 목록이
// 비고, 모델은 NEW 밖에 못 고른다 — 넣는 문장마다 새 축이 생겨 위계가 평평해진다.
//
// **왜 지금까지 안 드러났나.** eval 은 부트→증분이 한 프로세스라 emb 가 메모리에 살아
// 있다. 앱은 문장 추가가 세션을 넘나들므로 매번 이 경로를 탄다.
//
// **API 를 부르지 않는다.** llm·embedFn 을 스텁으로 넣어 결정적으로 돌린다 —
// 돈이 들거나 키가 필요한 테스트는 아무도 돌리지 않는다.
//
// 실행: node scripts/assimilateRestore.test.mjs

import { serializeTree } from '../lib/hierEngine.mjs';
import { assimilateLitMemo } from '../lib/litEngine.mjs';

// ─── 스텁 ────────────────────────────────────────────────────
// 글자 분포로 만드는 결정적 벡터. 같은 문자열 → 같은 벡터, 겹치는 글자 → 높은 코사인.
// 성분이 전부 0 이상이라 코사인이 음수가 될 수 없다 — 하한(0.2) 판정이 안정적이다.
const fakeEmbed = async (text) => {
  const v = new Array(64).fill(0);
  for (const ch of String(text)) v[ch.codePointAt(0) % 64] += 1;
  return v;
};

// 프롬프트를 붙잡아 두고 항상 첫 후보를 고른다. 실제 판정 품질은 이 테스트의 관심사가
// 아니다 — 관심사는 **후보가 모델에게 전달되었는가**다.
const captured = [];
const fakeLLM = async (prompt) => {
  captured.push(prompt);
  const m = prompt.user.match(/후보1 \| ([^\n—]+?)(?: —|\n)/);
  return JSON.stringify({
    choice: m ? m[1].trim() : 'NEW',
    newName: '새 축',
    speaker: '서술자', emotion: '고독', resonance: '테스트', confidence: 0.9,
  });
};

// ─── 트리 만들기 ─────────────────────────────────────────────
async function buildTree() {
  const nodes = new Map();
  const root = { id: 'n1', title: '데미안', parentId: null, level: 0, kind: 'root', sources: [], emb: null };
  nodes.set(root.id, root);

  let seq = 1;
  const addMotif = async (title, gloss) => {
    const n = {
      id: `n${++seq}`, title, parentId: root.id, level: 1, kind: 'concept',
      sources: [], gloss, emb: await fakeEmbed(`${title}: ${gloss}`),
    };
    nodes.set(n.id, n);
    return n;
  };
  const addSentence = (parent, text, p) => {
    const n = {
      id: `n${++seq}`, title: text, parentId: parent.id, level: 2, kind: 'sentence',
      sources: [p], emb: null, memoId: `m${p}`, gloss: '',
    };
    nodes.set(n.id, n);
    parent.sources.push(p);
    return n;
  };

  const a = await addMotif('알을 깨는 일', '기존 세계를 부수고 나오는 성장의 심상');
  addSentence(a, '새는 알에서 나오려고 투쟁한다.', 62);
  const b = await addMotif('유년의 붕괴', '밝은 세계와 어두운 세계가 갈라지는 순간');
  addSentence(b, '두 세계가 있었다. 밝음과 어둠.', 27);

  return { nodes, rootId: root.id };
}

// 저장 → 로드. 앱이 매 세션 겪는 왕복을 그대로 흉내낸다.
function roundTrip({ nodes, rootId }) {
  const json = JSON.parse(JSON.stringify(serializeTree(nodes, rootId)));
  const restored = new Map();
  for (const n of json.nodes) restored.set(n.id, n);
  return { nodes: restored, rootId: json.rootId };
}

// ─── 테스트 ──────────────────────────────────────────────────
let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : `\n      ${detail}`}`);
  if (!ok) failed++;
};

const built = await buildTree();

console.log('저장 → 로드');
const loaded = roundTrip(built);
const motifsOf = (t) => [...t.nodes.values()].filter((n) => n.kind === 'concept' && n.parentId === t.rootId);

check('emb 가 저장에서 빠진다 (의도된 동작)',
  motifsOf(loaded).every((m) => !m.emb));
check('구조는 온전하다',
  loaded.nodes.size === built.nodes.size && motifsOf(loaded).length === 2);

console.log('\n불러온 트리에 문장 1건 동화');
const result = await assimilateLitMemo({
  nodes: loaded.nodes,
  rootId: loaded.rootId,
  book: { title: '데미안', author: '헤르만 헤세' },
  memo: { p: 65, text: '알을 깨고 나오려는 새처럼, 나도 내 세계를 부숴야 했다.' },
  llm: fakeLLM,
  embedFn: fakeEmbed,
});

const prompt = captured.at(-1)?.user ?? '';
check('후보가 모델에게 전달된다',
  prompt.includes('후보1 |'),
  `후보 자리에 들어간 것: ${prompt.includes('(없음)') ? '(없음) ← emb 복원 실패' : '?'}`);
check('기존 축에 붙는다 (NEW 가 아님)',
  result.action === 'attach',
  `action=${result.action} motif=${result.motif?.title}`);
check('되살린 emb 가 노드에 캐시된다',
  motifsOf(loaded).every((m) => Array.isArray(m.emb)));

console.log('\n같은 트리에 두 번째 문장 — 재임베딩이 반복되지 않는다');
let embedCalls = 0;
const countingEmbed = async (t) => { embedCalls++; return fakeEmbed(t); };
await assimilateLitMemo({
  nodes: loaded.nodes,
  rootId: loaded.rootId,
  book: { title: '데미안' },
  memo: { p: 70, text: '두 세계 사이에서 나는 흔들렸다.' },
  llm: fakeLLM,
  embedFn: countingEmbed,
});
check('메모 1건만 임베딩한다 (축은 캐시 사용)',
  embedCalls === 1,
  `embedFn 호출 ${embedCalls}회`);

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}건 실패`);
process.exit(failed === 0 ? 0 : 1);
