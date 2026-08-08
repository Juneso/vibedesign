// salience — 개념 중요도 점수 (BKT-380 · 0808 준서 설계 논의 확정분).
//
// 목표: 룰베이스 문턱 더미(성장 단계·무게 역전·잔가지·2회 승격)를 "점수 낮은 쪽이 높은 쪽
// 밑으로 / 구조는 상위 점수만"이라는 단일 원리로 대체할 기반. 이 파일은 계산기만 — 트리
// 배선은 검산(준서 정답 대조) 통과 후에 한다.
//
// 신호 (전부 lift 원재료에서, 파렌팅·블록 계산 전에):
//  ① 빈도 — 표제어(+별칭) 자구가 전체 메모 문면에 등장하는 횟수. 준서: "빈도가 가장 중요"
//  ② 메모 분포 — 등장하는 서로 다른 메모 수. 한 문단에만 사는 개념은 지엽
//  ③ 역할 피참조 — 다른 주장의 슬롯이 이 개념을 지목할 때, 전개 방식별로 "설명되는
//     대상"에 가중 (0808 논의: 대조에 특권 없음 — 정의·분석·예시는 대상이, 인과는 사슬
//     양끝이, 대조·비교는 양쪽이 고르게 중요)
//  피부정·메타 감점은 기각(0808 준서) — 패턴이 중요도 하락을 보장하지 않는다. 지엽
//  개념(신조어)은 빈도·분포에서 자연 탈락한다.
//
// 별칭(의미 동일 개념)은 인자로 받는다 — aliasGroups: [[대표, 변형...], ...].
// "인쇄술≈인쇄기, 나르시스적 주체≈나르시시스트"를 못 이으면 빈도·피참조가 끊기므로
// 별칭 해석의 품질이 점수 품질의 전제다 (0808 우선순위 판정).

const N = (s) => String(s || '').normalize('NFC');
const nrm = (s) => N(s).replace(/\s+/g, '').toLowerCase();

// 전개 방식별 역할 가중 — "이 슬롯 칸에 지목된 개념은 얼마나 중요해지는가"
const ROLE_W = {
  '정의': { concept: 1.0, elements: 0.3 },
  '분석': { concept: 1.0, parts: 0.3 },
  '분류': { concept: 1.0, kinds: 0.3 },
  '예시': { of: 1.0, cases: 0.1 },          // 사례 자체는 지엽 — 설명되는 대상이 중요
  '대조': { pair: 0.7, axis: 0 },            // 양쪽 고르게 — 대조라서 특별하지는 않다
  '비교': { pair: 0.7, ground: 0 },
  '유추': { target: 0.7, source: 0.2 },      // 빗대어지는 쪽(낯선 것)이 논지 대상
  '인과': { chain: 0.5 },
  '통시': { phases: 0.4 },
  '과정': { steps: 0.4 },
  '묘사': { subject: 0.7, states: 0.1 },
  '인용': { source: 0, point: 0 },           // 인용 인물·문구는 개념 아님
  '문답': { question: 0.3, answer: 0.3 },
  '통념 반박': { belief: 0.3, rebuttal: 0.5 },
};

// lifts: [{memoId, p, claims:[{headword, claim, slots, ...}]}]
// memoTexts: memoId → 원문
// aliasGroups: [[이름...]] — 같은 개념의 표현 변형 묶음 (없으면 자구만)
// aspects: { 측면이름 → 핵심개념 } — "컴퓨터의 행위주체성"→"컴퓨터". 점수는 핵심 개념
// 단위로 합산하고 측면은 순위표에서 제외한다(트리 노드로는 유지). 토픽 토큰 폴백은
// 자식이 부모 빈도를 상속하는 부작용(넥서스 실측)으로 기각, 별칭 판정의 명시 귀속으로 대체.
// richText: 목차·책 소개 원문 — 여기 등장하는 개념은 저자·출판사가 중요하게 다룬 것이라
// 가중(0808 준서: 빈도 뻥튀기 보정의 반대편 신호).
export function computeSalience({ lifts, memoTexts, aliasGroups = [], aspects = {}, richText = '' }) {
  // 대조·비교 쌍 별칭 금지 — 슬롯에서 맞세워진 양쪽은 정의상 다른 개념이다. 별칭 판정이
  // "점토판·인쇄기·라디오≈컴퓨터", "깊은 피로≈분열적 피로"처럼 반대 개념을 병합한 실측
  // (넥서스 lift-2)의 결정적 차단 — 판정 프롬프트가 아니라 코드가 거른다.
  const opposed = new Set();
  const oppKey = (a, b) => [nrm(a), nrm(b)].sort().join('↔');
  for (const l of lifts) for (const cl of l.claims) for (const rel of ['대조', '비교']) {
    const pair = cl.slots?.[rel]?.pair || [];
    for (let i = 0; i < pair.length; i++) for (let j = i + 1; j < pair.length; j++) {
      const a = N(pair[i]).split('—')[0].trim(), b = N(pair[j]).split('—')[0].trim();
      opposed.add(oppKey(a, b));
      // 자기 표제어가 든 변은 자기 쪽이다 — "우울증 ↔ 슬픔"의 우울증 변을 표제어 우울증과
      // 대립으로 등록하면 정당한 병합(우울증≈성과주체의 우울증)까지 기각된다 (0808 실측 6건)
      const h = nrm(cl.headword);
      if (!nrm(a).includes(h) && !h.includes(nrm(a))) opposed.add(oppKey(cl.headword, a));
      if (!nrm(b).includes(h) && !h.includes(nrm(b))) opposed.add(oppKey(cl.headword, b));
    }
  }
  const clash = (g) => {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++)
      if (opposed.has(oppKey(g[i], g[j]))) return `${g[i]}↔${g[j]}`;
    return null;
  };
  aliasGroups = aliasGroups.filter((g) => {
    const c = clash(g);
    if (c) console.log(`  ⛔ 별칭 기각(대조 쌍): ${g.join('≈')} — ${c}`);
    return !c;
  });
  // 개념 목록 = 표제어 묶음 (별칭 그룹으로 병합)
  const aliasOf = new Map(); // nrm(이름) → 대표 nrm
  for (const g of aliasGroups) { const rep = nrm(g[0]); for (const a of g) aliasOf.set(nrm(a), rep); }
  for (const [asp, core] of Object.entries(aspects)) aliasOf.set(nrm(asp), aliasOf.get(nrm(core)) || nrm(core));
  const aspectKeys = new Set(Object.keys(aspects).map(nrm));
  const canon = (name) => aliasOf.get(nrm(name)) || nrm(name);

  const concepts = new Map(); // canonKey → { names:Set, rep, claims: n, memos:Set, refScore, freq }
  const ensure = (name) => {
    const key = canon(name);
    if (!concepts.has(key)) concepts.set(key, { key, rep: N(name).trim(), names: new Set(), claims: 0, memos: new Set(), refScore: 0, freq: 0 });
    const c = concepts.get(key);
    if (!aspectKeys.has(nrm(name))) { c.names.add(nrm(name)); if (aspectKeys.has(nrm(c.rep))) c.rep = N(name).trim(); }
    return c;
  };
  for (const l of lifts) for (const cl of l.claims) {
    const c = ensure(cl.headword);
    c.claims++;
    c.memos.add(l.memoId);
  }
  for (const g of aliasGroups) ensure(g[0]);
  for (const core of Object.values(aspects)) ensure(core);

  // ③ 역할 피참조 — 슬롯 값이 다른 개념(의 이름·별칭)을 담고 있으면 역할 가중만큼 가산.
  // 자기 자신 참조는 제외 (표제어가 자기 슬롯에 들어가는 건 당연하다).
  const findConcept = (text) => {
    const t = nrm(N(text).split('—')[0]);
    if (!t) return null;
    let best = null;
    for (const c of concepts.values()) {
      for (const n of c.names) {
        if (n.length >= 2 && (t === n || (n.length >= 3 && t.includes(n)))) {
          if (!best || n.length > best.n) best = { c, n: n.length };
        }
      }
    }
    return best?.c || null;
  };
  for (const l of lifts) for (const cl of l.claims) {
    const own = canon(cl.headword);
    for (const [rel, slot] of Object.entries(cl.slots || {})) {
      const w = ROLE_W[rel]; if (!w) continue;
      for (const [field, weight] of Object.entries(w)) {
        if (!weight) continue;
        const vals = Array.isArray(slot[field]) ? slot[field] : slot[field] ? [slot[field]] : [];
        for (const v of vals) {
          const hit = findConcept(v);
          if (hit && hit.key !== own) { hit.refScore += weight; hit.memos.add(l.memoId); }
        }
      }
    }
  }

  // ① 빈도 — 배타적 최장 일치: 더 긴 개념명에 덮인 등장은 짧은 이름에 세지 않는다
  // ("부정성" 자구 속의 "부정"이 부정을 1위로 부풀린 피로사회 실측의 수리).
  const allText = nrm([...memoTexts.values()].join(' '));
  const allNames = [...new Set([...concepts.values()].flatMap((c) => [...c.names]))].filter((n) => n.length >= 2)
    .sort((a, b) => b.length - a.length);
  // 수식 구의 핵어 공유 (0808 준서: 배타가 과하면 진짜 개념의 반복이 깎인다) —
  // "깊은 피로"의 피로는 피로 개념의 등장이기도 하다. 원형(rep)에서 공백으로 분리된
  // 핵어(수식 구)는 핵어 개념에도 카운트하고, 어간 융합형(부정+성=부정성)만 배타 유지.
  const sharedHead = new Map(); // 긴 이름 → 함께 카운트할 짧은 핵어 이름
  const repOf = new Map();
  for (const c of concepts.values()) for (const n of c.names) repOf.set(n, N(c.rep));
  for (const long of allNames) {
    const rep = repOf.get(long) || long;
    const head = nrm(N(rep).split(/\s+/).pop());
    if (head && head !== long && allNames.includes(head) && long.endsWith(head)) sharedHead.set(long, head);
  }
  const countExclusive = (text) => {
    const counts = new Map();
    const covered = new Array(text.length).fill(false);
    for (const n of allNames) {
      let i = text.indexOf(n), cnt = 0;
      while (i !== -1) {
        let free = true;
        for (let j = i; j < i + n.length; j++) if (covered[j]) { free = false; break; }
        if (free) {
          cnt++;
          for (let j = i; j < i + n.length; j++) covered[j] = true;
          const h = sharedHead.get(n);
          if (h) counts.set(h, (counts.get(h) || 0) + 1);
        }
        i = text.indexOf(n, i + n.length);
      }
      counts.set(n, (counts.get(n) || 0) + cnt);
    }
    return counts;
  };
  const exCounts = countExclusive(allText);
  const richN = nrm(richText || '');
  for (const c of concepts.values()) {
    c.freq = [...c.names].reduce((s2, n) => s2 + (exCounts.get(n) || 0), 0);
    for (const [mid, text] of memoTexts) if ([...c.names].some((n) => nrm(text).includes(n))) c.memos.add(mid);
    // 목차·책 소개 가중 — 등장하면 저자 공인 핵심 개념
    c.rich = richN && [...c.names].some((n) => richN.includes(n));
  }

  // 합산 — 빈도 최대 가중(준서). 분포는 책 크기로 정규화(소표본 과벌점 수리: 5메모 책에서
  // 메모 1개 개념이 과하게 깎이던 것). 목차 가중은 곱연산(뻥튀기 보정의 반대편 닻).
  const totalMemos = Math.max(memoTexts.size, 2);
  const raw = new Map();
  for (const c of concepts.values()) {
    let v = 1.0 * c.freq + 3.0 * ((c.memos.size - 1) / (totalMemos - 1)) * Math.min(totalMemos, 8) / 2
      + 1.0 * c.refScore + 0.5 * c.claims;
    if (c.rich) v *= 1.5;
    raw.set(c.key, v);
  }
  const max = Math.max(...raw.values(), 1);
  const out = [...concepts.values()].map((c) => ({
    concept: c.rep, key: c.key, score: Math.round((raw.get(c.key) / max) * 100) / 100,
    freq: c.freq, rich: !!c.rich, memos: c.memos.size, refScore: Math.round(c.refScore * 10) / 10, claims: c.claims,
  })).sort((a, b) => b.score - a.score);
  return out;
}

// 별칭 해석 프롬프트 — 폐쇄 판정 1콜. "같은 개념의 표현 변형·사례·지시" 묶기
// (인쇄술≈인쇄기 · 나르시스적 주체≈나르시시스트 · 성과사회의 주민≈성과주체).
export function buildAliasPrompt({ book, names }) {
  return {
    system: `개념 이름 목록에서 **의미적으로 같은 개념을 가리키는 이름들**을 묶는다. 묶는 기준: 표현 변형(나르시스적 주체=나르시시스트), 구체형과 총칭(인쇄기=인쇄술), 지시 표현(성과사회의 주민=성과주체). 주제가 이웃인 것·상하위 개념(우울증≠신경성 질환)은 묶지 않는다. 확신이 없으면 묶지 마라. JSON만 출력.`,
    user: `책: ${book}\n\n[이름 목록]\n${names.map((n, i) => `${i} | ${n}`).join('\n')}\n\n출력 JSON: {"groups":[["대표 이름","같은 개념의 다른 이름"]],"aspects":{"측면 이름":"핵심 개념"}} — aspects 는 "X의 Y"처럼 어떤 핵심 개념의 한 측면·속성을 가리키는 이름(컴퓨터의 행위주체성→컴퓨터, 종교의 기능→종교). 해당 없으면 생략`,
    temperature: 0.1,
  };
}
