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
export function computeSalience({ lifts, memoTexts, aliasGroups = [] }) {
  // 개념 목록 = 표제어 묶음 (별칭 그룹으로 병합)
  const aliasOf = new Map(); // nrm(이름) → 대표 nrm
  for (const g of aliasGroups) { const rep = nrm(g[0]); for (const a of g) aliasOf.set(nrm(a), rep); }
  const canon = (name) => aliasOf.get(nrm(name)) || nrm(name);

  const concepts = new Map(); // canonKey → { names:Set, rep, claims: n, memos:Set, refScore, freq }
  const ensure = (name) => {
    const key = canon(name);
    if (!concepts.has(key)) concepts.set(key, { key, rep: N(name).trim(), names: new Set(), claims: 0, memos: new Set(), refScore: 0, freq: 0 });
    const c = concepts.get(key);
    c.names.add(nrm(name));
    return c;
  };
  for (const l of lifts) for (const cl of l.claims) {
    const c = ensure(cl.headword);
    c.claims++;
    c.memos.add(l.memoId);
  }

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

  // ① 빈도 — 전체 메모 문면에서 이름·별칭 자구 등장 횟수 (겹치는 별칭은 최장 우선 중복 방지 없이 단순 합)
  const allText = nrm([...memoTexts.values()].join(' '));
  for (const c of concepts.values()) {
    let f = 0;
    for (const n of c.names) if (n.length >= 2) f += allText.split(n).length - 1;
    // 합성 표제어 폴백 — "종교의 기능"처럼 관형 구 표제어는 자구가 원문에 없어 빈도가
    // 0이 된다(넥서스 검산 실측: 종교 0.04). 전체 자구가 없을 때만 토픽 토큰(관형 구의
    // 머리, "종교의 기능"→종교)으로 재고, 폴백 사용을 표시한다.
    if (f === 0) {
      const head = nrm(N(c.rep).split(/의\s|\s/)[0]);
      if (head.length >= 2 && head !== c.key) {
        f = allText.split(head).length - 1;
        if (f > 0) c.topicFallback = head;
      }
    }
    c.freq = f;
    // 분포도 문면 기준으로 보강 — 표제어로 안 잡힌 메모에 자구로 등장하면 분포에 포함
    for (const [mid, text] of memoTexts) if ([...c.names].some((n) => nrm(text).includes(n))) c.memos.add(mid);
  }

  // 합산 — 빈도 최대 가중(준서), 분포·피참조 보조. 책 크기 무관하게 0~1 최대 정규화.
  const raw = new Map();
  for (const c of concepts.values())
    raw.set(c.key, 1.0 * c.freq + 1.5 * (c.memos.size - 1) + 1.0 * c.refScore + 0.5 * c.claims);
  const max = Math.max(...raw.values(), 1);
  const out = [...concepts.values()].map((c) => ({
    concept: c.rep, key: c.key, score: Math.round((raw.get(c.key) / max) * 100) / 100,
    freq: c.freq, topicFallback: c.topicFallback || null, memos: c.memos.size, refScore: Math.round(c.refScore * 10) / 10, claims: c.claims,
  })).sort((a, b) => b.score - a.score);
  return out;
}

// 별칭 해석 프롬프트 — 폐쇄 판정 1콜. "같은 개념의 표현 변형·사례·지시" 묶기
// (인쇄술≈인쇄기 · 나르시스적 주체≈나르시시스트 · 성과사회의 주민≈성과주체).
export function buildAliasPrompt({ book, names }) {
  return {
    system: `개념 이름 목록에서 **의미적으로 같은 개념을 가리키는 이름들**을 묶는다. 묶는 기준: 표현 변형(나르시스적 주체=나르시시스트), 구체형과 총칭(인쇄기=인쇄술), 지시 표현(성과사회의 주민=성과주체). 주제가 이웃인 것·상하위 개념(우울증≠신경성 질환)은 묶지 않는다. 확신이 없으면 묶지 마라. JSON만 출력.`,
    user: `책: ${book}\n\n[이름 목록]\n${names.map((n, i) => `${i} | ${n}`).join('\n')}\n\n출력 JSON: {"groups":[["대표 이름","같은 개념의 다른 이름"]]} — 묶이지 않는 이름은 생략`,
    temperature: 0.1,
  };
}
