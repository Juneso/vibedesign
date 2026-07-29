// 비문학 동화 모드 (BKT-382) — V10/V11 트리에 메모 1건을 그 자리에서 반영한다.
//
// 문학(litEngine.assimilateLitMemo)에서 성립한 폐쇄형 판정을 승계한다:
// mini 는 attach|new 경계를 추상적으로 못 잡는다(문학 run 68 전부 attach ↔ run 70 전부
// new 진자 실측). 그래서 코드가 임베딩으로 후보를 상위 3개로 좁혀 예시 문장과 함께 주고,
// LLM 은 "이 후보의 예시 문장 옆에 놓으면 이어지는가"라는 구체적 비교 선택만 한다.
// 저신뢰(<0.6)·후보 밖 이름·NEW인데 최근접 ≥0.5 면 4o 에스컬레이션.
//
// 비문학 고유의 두 가지:
// 1) 후보는 **잎 개념**(키워드·관계 키워드)만이다. 핵심 개념·축은 문장을 받지 않는다 —
//    배치 테스트 실측에서 라벨 경로가 배정을 이끄는 힘이므로, 후보에 경로를 함께 보여준다.
// 2) 쌍 관계 축(비교·대조·인과·유추·문답)은 자식이 한 벌로 정해진다. 잎이 아닌 쌍 축은
//    애초에 후보가 아니고, NEW 키워드는 항상 뿌리 직속에 선다 — 다음 정리 이벤트
//    (성장 단계 승격 시 일괄 재정리)가 제자리를 찾아준다.
import { PAIRED_RELATIONS } from './relationVocab.mjs';

const N = (s) => String(s || '').normalize('NFC');
const nrm = (s) => N(s).replace(/\s+/g, '').toLowerCase();
const cos = (a, b) => { let s = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return s / (Math.sqrt(x) * Math.sqrt(y) || 1); };

const nextId = (nodes) => {
  let mx = 0;
  for (const k of nodes.keys()) { const n = Number(String(k).replace(/^n/, '')); if (n > mx) mx = n; }
  return () => `n${++mx}`;
};

// 성장 단계 — hierEngine 4.0 의 문턱(5/10/16)과 같은 값. 증분 쪽에서 승격 감지에 쓴다.
export function growthStageOf(kwCount) {
  return kwCount < 5 ? { name: '씨앗', rank: 0 }
    : kwCount < 10 ? { name: '새싹', rank: 1 }
    : kwCount < 16 ? { name: '자람', rank: 2 }
    : { name: '무성', rank: 3 };
}

// 문장을 받을 수 있는 잎 개념 — 개념 자식이 없는 concept 전부.
// (뿌리 직속 키워드 · 축 아래 키워드 · 관계 키워드(relationLeaf) 가 여기 해당하고,
//  핵심 개념·자식 있는 축은 잎이 아니라서 자연히 빠진다. 잎이어도 쌍 관계 축 자체는
//  키워드가 아니라 관계 서술이므로 relationLeaf 표기가 없으면 제외.)
export function leafKeywords(nodes, rootId) {
  const hasConceptChild = new Set();
  for (const n of nodes.values()) if (n.kind === 'concept') hasConceptChild.add(n.parentId);
  return [...nodes.values()].filter((n) =>
    n.kind === 'concept' && n.id !== rootId && !hasConceptChild.has(n.id)
    && !(n.relation && PAIRED_RELATIONS.has(n.relation) && !n.relationLeaf));
}

// 저장된 트리를 불러오면 emb 가 없다(serializeTree 가 떨군다). 되살리지 않으면 후보가
// 0개가 되어 매 문장이 NEW 가 된다 — 문학 BKT-383 과 같은 함정.
export async function ensureKeywordEmbs(hosts, embedFn) {
  if (!embedFn) return;
  for (const h of hosts.filter((x) => !x.emb)) {
    h.emb = await embedFn(`${h.title}: ${String(h.gloss || '').slice(0, 200)}`);
  }
}

// 잎 개념까지의 경로 라벨 — "성과사회 > 구성 요소 · 분석 > 자기 착취".
// 배치 테스트에서 이 경로만으로 사람이 50~80% 제자리를 찾았다. 판정 LLM 에게도 같은 정보를 준다.
function pathOf(nodes, rootId, n) {
  const out = []; let c = n;
  while (c && c.id !== rootId) { out.unshift(N(c.title)); c = nodes.get(c.parentId); }
  return out.join(' > ');
}

// 새 메모 1개를 기존 비문학 트리에 동화한다. nodes 를 직접 변형.
// 반환: { action:'attach'|'new', keyword, escalated, confidence }
export async function assimilateHierMemo({ nodes, rootId, book, memo, llm, llmEsc, embedFn }) {
  const hosts = leafKeywords(nodes, rootId);
  const sentsOf = (h) => [...nodes.values()].filter((n) => n.kind === 'sentence' && n.parentId === h.id);
  const e = embedFn ? await embedFn(memo.text) : null;
  await ensureKeywordEmbs(hosts, embedFn);
  const ranked = e
    ? hosts.map((h) => ({ h, sim: h.emb ? cos(e, h.emb) : -1 })).sort((a, b) => b.sim - a.sim)
    : hosts.map((h) => ({ h, sim: -1 }));
  const top = ranked.slice(0, 3).filter((r) => r.sim >= 0.2 || !e);
  const candLine = top.map((r, k) =>
    `후보${k + 1} | ${pathOf(nodes, rootId, r.h)}${r.h.gloss ? `\n    뜻: ${String(r.h.gloss).slice(0, 120)}` : ''}\n${sentsOf(r.h).slice(0, 3).map((s) => `    · p${s.sources?.[0] ?? '?'} ${String(s.title).slice(0, 70)}`).join('\n')}`).join('\n');

  const prompt = {
    system: '비문학 독서 메모 1개를 기존 위키의 키워드에 배정하는 편집자다. 책 내용을 아는 척 추론하지 마라 — 근거는 메모 문면뿐. JSON만 출력.',
    user: `책: ${book.title}${book.author ? ` (${book.author})` : ''}

[새 메모] p${memo.p}: ${memo.text}${memo.myThought ? `\n(내 생각: ${memo.myThought})` : ''}

[가까운 기존 키워드 후보 — 위키 경로·예시 문장 포함]
${candLine || '(없음)'}

판정 기준: 이 메모를 각 후보의 **예시 문장들 옆에 놓았을 때** 같은 개념에 대한 이야기의 연속으로 읽히는가? 주제가 이웃인 것으로는 부족하다 — 같은 개념이어야 한다.
- 그런 후보가 있으면 choice=그 후보의 **키워드 이름만** (경로 말고 마지막 이름).
- 어느 후보와도 다른 개념이면 choice="NEW", newName=새 키워드 이름(짧은 명사구 — 책 고유의 용어 우선).
그리고 summary(이 메모가 말하는 바 한 줄 — 위키에 실릴 요약), confidence(0~1).

출력 JSON: {"choice":"키워드 이름 또는 NEW","newName":"...","summary":"...","confidence":0.9}`,
    temperature: 0.1,
  };

  const ask = async (fn) => { try { return JSON.parse(await fn(prompt)); } catch { return null; } };
  let out = await ask(llm); let escalated = false;
  const lastName = (t) => N(t).split('>').pop().trim();
  const findHost = (o) => o && o.choice && nrm(o.choice) !== nrm('NEW')
    ? top.find((r) => nrm(lastName(r.h.title)) === nrm(lastName(o.choice)))?.h
      || hosts.find((h) => nrm(h.title) === nrm(o.choice)) || null
    : null;
  // attach 인데 그 후보와의 임베딩 유사도가 낮으면 의심한다 — run 1 실측: mini 가 18건
  // 전부 attach(new 0)로 기울어 우울증·자기 착취가 문장에 갇혔다(문학 run 68 진자의 재현).
  const simOf = (o) => { const h = findHost(o); return h ? (ranked.find((r) => r.h === h)?.sim ?? 0) : 1; };
  const bad = (o) => !o || !o.choice
    || (nrm(o.choice) !== nrm('NEW') && !findHost(o))
    || (Number(o.confidence ?? 1) < 0.6)
    || (nrm(o.choice) !== nrm('NEW') && simOf(o) < 0.35)
    || (nrm(o.choice) === nrm('NEW') && top.length && top[0].sim >= 0.5);
  if (bad(out) && llmEsc) { out = (await ask(llmEsc)) || out; escalated = true; }

  const id = nextId(nodes);
  let host = findHost(out), action = 'new';
  if (host) action = 'attach';
  else {
    // 이름이 안 왔으면 문장 조각을 이름으로 쓰지 않는다 — 존중정치학 run 6 실측:
    // "현재 미국의 숙명은 신조에 기반을 둔" 이라는 키워드가 생겼다(문학 run 72의 재현).
    // 문학과 같은 이름짓기 콜 폴백을 승계한다.
    let name = String(out?.newName || '').trim();
    if (!name || name.length > 25 || /["'“”,.?!]/.test(name)) {
      try {
        const nj = JSON.parse(await llm({
          system: '비문학 문장 하나의 핵심 개념을 짧은 명사구 하나로 짓는다. 책 고유의 용어 우선. JSON만 출력.',
          user: `책: ${book.title}\n문장: ${String(memo.text).slice(0, 300)}\n출력 JSON: {"name":"짧은 명사구"}`,
          temperature: 0.1,
        }));
        name = String(nj.name || '').trim() || name;
      } catch { /* 원래 값 유지 */ }
      if (!name) name = String(memo.text).slice(0, 20);
    }
    const gloss = String(out?.summary || '').trim();
    host = {
      id: id(), title: name, parentId: rootId, level: 1, kind: 'concept', sources: [],
      emb: embedFn ? await embedFn(`${name}: ${gloss}`) : null, gloss,
    };
    nodes.set(host.id, host);
  }
  const s = {
    id: id(), title: memo.text, parentId: host.id, level: host.level + 1, kind: 'sentence',
    sources: memo.p != null ? [memo.p] : [], emb: null, memoId: memo.id, gloss: out?.summary || '',
  };
  nodes.set(s.id, s);
  if (memo.p != null && !host.sources.includes(memo.p)) host.sources.push(memo.p);
  const hostSents = [...nodes.values()].filter((n) => n.kind === 'sentence' && n.parentId === host.id).length;
  return { action, keyword: host.title, hostId: host.id, hostSents, escalated, confidence: Number(out?.confidence ?? 0) };
}
