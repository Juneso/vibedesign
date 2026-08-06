// lift v12 — 사서(planIngest) 단계 교체 (BKT-342 · docs/hier-v12-lift-design.md A절).
//
// 반전: 현행 "요약 먼저(메모당 1문장) → 구조 나중(축 판정)"을
// "구조 먼저(14종 전개 방식 판정 + 슬롯 채우기) → 요약은 그 결과"로 뒤집는다.
// 요약을 먼저 뽑으면 다개념 메모의 나머지 개념이 증발하고(m95 실측: 나르시스·슬픔·리비도),
// 트리 꼭대기에서야 관계를 판정하니 재료가 이미 뭉개져 축 40~60%가 억지가 된다.
//
// 어휘·정의·오용 금지는 relationVocab.mjs 에서 주입한다 — 새 어휘 금지,
// 축 판정(hierEngine)과 기준 단일 소스.

import { RELATION_NAMES, relationGuide, MEMBER_SPEC } from './relationVocab.mjs';

// 프롬프트 버전 — 모델·프롬프트 조합 추적용. 스키마나 프롬프트 문구가 바뀌면 올린다.
// v12.1: haiku 배치 실측(총점 79) 대응 — 과분할(골든 40주장→69주장), 다개념 문단의
// 표제어 일반화(m18 나르시스 증발), JSON 이탈(마크다운 응답 1건)을 겨냥해 조임.
// v12.2: v12.1 이 과병합으로 반동(28주장·m18 여전히 증발) — 분할 기준을 숫자 감각이
// 아니라 슬롯 신호로 재정의하고, 표제어를 "책의 반복 명사구 자구"로 못박음.
export const LIFT_PROMPT_VERSION = 'lift-v12.2';

// 쌍 관계의 최소 개수는 relationVocab.MEMBER_SPEC 과 단일 소스
const minOf = (rel) => MEMBER_SPEC[rel]?.min ?? 1;

// 방식별 슬롯 구조 — "판정한 방식의 MEMBER_SPEC 구조를 채운다" (설계 A-2).
// 슬롯을 채우는 행위가 곧 주장 목록을 낳는다 (준서 요약 3줄과 동형이 되도록 강제).
// kind: 'str'|'list'. list 의 min 은 그 관계가 성립하는 최소 항목 수.
// optional 은 문단이 그 방식을 쓰면서도 비워둘 수 있는 칸(물음만 던지는 문답 등).
export const LIFT_SLOTS = {
  '정의':  { fields: { concept: { kind: 'str', doc: '규정되는 개념' }, elements: { kind: 'list', min: minOf('정의'), doc: '뜻을 이루는 요소' } } },
  '분석':  { fields: { concept: { kind: 'str', doc: '해부되는 대상' }, parts: { kind: 'list', min: minOf('분석'), doc: '구성 요소·측면' } } },
  '분류':  { fields: { concept: { kind: 'str', doc: '나뉘는 대상' }, kinds: { kind: 'list', min: minOf('분류'), doc: '나뉜 갈래·종류' } } },
  '비교':  { fields: { pair: { kind: 'list', min: minOf('비교'), doc: '견주어지는 대상들' }, ground: { kind: 'str', doc: '견줌의 공통 기준' } } },
  '대조':  { fields: { pair: { kind: 'list', min: minOf('대조'), doc: '맞세워지는 양쪽' }, axis: { kind: 'str', doc: '무엇의 축인가' } } },
  '유추':  { fields: { source: { kind: 'str', doc: '빗대는 쪽(익숙한 것)' }, target: { kind: 'str', doc: '빗대어지는 쪽(낯선 것)' } } },
  '예시':  { fields: { of: { kind: 'str', doc: '무엇의 사례인가' }, cases: { kind: 'list', min: minOf('예시'), doc: '구체적 사례·사건·인물' } } },
  '묘사':  { fields: { subject: { kind: 'str', doc: '묘사되는 대상' }, states: { kind: 'list', min: minOf('묘사'), doc: '그려지는 상태·국면' } } },
  '통시':  { fields: { phases: { kind: 'list', min: minOf('통시'), doc: '시간 순 시기·국면 — 순서 보존' } } },
  '과정':  { fields: { steps: { kind: 'list', min: minOf('과정'), doc: '순서를 이루는 단계 — 순서 보존' } } },
  '인과':  { fields: { chain: { kind: 'list', min: minOf('인과'), doc: '원인 → 결과 사슬 — 앞이 원인' } } },
  '인용':  { fields: { source: { kind: 'str', doc: '끌어온 텍스트·인물·권위' }, point: { kind: 'str', doc: '인용이 뒷받침하는 바' } } },
  '문답':  { fields: { question: { kind: 'str', doc: '던져진 물음' }, answer: { kind: 'str', doc: '그에 대한 답', optional: true } } },
  '통념 반박': { fields: { belief: { kind: 'str', doc: '반박 대상인 통념' }, rebuttal: { kind: 'str', doc: '통념을 뒤집는 근거' } } },
};

// 프롬프트 삽입용 — 방식별 슬롯 구조 한 줄씩
export function slotGuide() {
  return Object.entries(LIFT_SLOTS).map(([rel, spec]) => {
    const parts = Object.entries(spec.fields).map(([k, f]) =>
      f.kind === 'list' ? `"${k}": [${f.doc}, 최소 ${f.min}개]` : `"${k}": "${f.doc}${f.optional ? ' — 문단에 없으면 생략' : ''}"`);
    return `- ${rel}: { ${parts.join(', ')} }`;
  }).join('\n');
}

// transport 계약({system,user}→응답 텍스트)에 그대로 넣는 프롬프트.
// 증분 동화에 단건 연산으로 들어가므로 메모 1건 단위다.
export function buildLiftPrompt({ book, memo }) {
  const system = `너는 독서 메모를 위키 지도의 재료로 변환하는 사서다. 발췌 문단 1건을 "구조 먼저"로 분해한다.
요약을 먼저 쓰지 마라. 이 문단이 논지를 어떤 방식으로 전개하는지부터 판정하고, 그 방식의 슬롯을 채워라.
주장(claim)은 슬롯을 채운 결과로 나온다.

절차 (주장마다):
1. 전개 방식 판정 — 아래 14종 중 이 문단이 실제로 쓰는 방식. 복수 가능. 목록 밖 어휘 금지.
2. 슬롯 채우기 — 판정한 방식마다 지정된 구조를 문단의 자구로 채운다. 슬롯을 채울 수 없으면 그 방식으로 판정하지 마라.
3. 증거 매달기 — 구체적 디테일(사물·인물·일화·인용문)은 주장의 evidence로 붙인다. 디테일을 독립 주장으로 승격하지 마라.
4. 표제어(headword) — 2~10자 명사구. 반드시 문단의 자구에서 뽑되, 구체물로 일반 명제를 서술하는 예시 구조에서는 문단이 가리키는 일반 개념으로 승격한다. "A와 B" 같은 합성 금지.

주장의 개수는 세지 말고 **슬롯이 정한다**:
- 한 전개 방식의 슬롯으로 묶이는 내용은 주장 하나다. 대조의 양쪽, 인과 사슬의 단계들을 따로 주장으로 쪼개지 마라.
- 반대로, 슬롯을 채우다 보면 **주어가 다른 개념**이 나온다 — "A는 ~다"와 "B는 ~다"가 한 슬롯에 안 들어가면 그것은 별개의 주장이다. 문단이 개념 A를 말하다가 B로, B에서 C로 넘어가면 개념마다 주장을 나눠라. 병렬된 개념들을 하나의 추상 어휘로 흡수하는 것이 최악이다 — 개념 하나가 통째로 증발한다.
- 표제어는 그 주장의 **주어가 되는 책의 명사구 자구**다. 문단에 실제로 등장하는 구체 명사구(고유 개념)를 두고 그것의 상위 개념이나 바꿔 말한 추상어를 만들지 마라.
문단에 없는 내용 추가 금지. 출력은 JSON 하나뿐이다 — 첫 문자는 반드시 { 이고, 코드 펜스·설명 문장·이모지를 붙이지 마라.

[14종 전개 방식 — 정의와 오용 주의]
${relationGuide()}

[방식별 슬롯 구조]
${slotGuide()}

출력 JSON:
{"claims":[{"id":"c1","claim":"한 문장 주장","devices":["대조"],"slots":{"대조":{"pair":["...","..."],"axis":"..."}},"evidence":["원문 속 디테일"],"headword":"표제어","confidence":"high|med|low"}]}
- slots 의 키는 devices 로 판정한 방식과 정확히 일치해야 한다.
- confidence 는 판정 확신도다. low 는 상위 모델 재판정(에스컬레이션) 대상이 된다.`;

  const user = `책: ${book.title}${book.author ? ` (${book.author})` : ''}${book.summary ? `\n책 소개: ${book.summary}` : ''}

발췌 (p.${memo.p}):
${memo.text}${memo.my ? `\n\n독자 메모: ${memo.my}` : ''}`;

  return { system, user };
}

// LLM 응답(또는 수동 골든)을 Lift 스키마로 정규화·검증한다.
// 실패를 던지지 않고 warnings 로 모은다 — 골든은 warnings 0개가 통과 기준,
// 런타임은 warnings 를 로그로 남기고 confidence 를 low 로 강등해 에스컬레이션 대상에 넣는다.
export function normalizeLift(raw, { memoId } = {}) {
  const warnings = [];
  const claims = [];
  const rawClaims = Array.isArray(raw?.claims) ? raw.claims : [];
  if (!rawClaims.length) warnings.push(`${memoId}: claims 가 비었다`);

  rawClaims.forEach((c, i) => {
    const cid = c.id || `c${i + 1}`;
    const where = `${memoId}#${cid}`;

    const devices = (Array.isArray(c.devices) ? c.devices : [])
      .map((d) => String(d).trim())
      .filter((d) => {
        if (RELATION_NAMES.includes(d)) return true;
        warnings.push(`${where}: 어휘 밖 전개 방식 "${d}" — 제거`);
        return false;
      });
    if (!devices.length) warnings.push(`${where}: 판정된 전개 방식이 없다`);

    // 슬롯: 판정한 방식만 남기고, 방식마다 필수 칸·최소 개수를 검사한다
    const slots = {};
    for (const rel of devices) {
      const spec = LIFT_SLOTS[rel];
      const s = c.slots?.[rel];
      if (!s) { warnings.push(`${where}: "${rel}" 판정했으나 슬롯이 비었다`); continue; }
      const clean = {};
      for (const [k, f] of Object.entries(spec.fields)) {
        if (f.kind === 'list') {
          const v = (Array.isArray(s[k]) ? s[k] : []).map((x) => String(x).trim()).filter(Boolean);
          if (v.length < f.min) warnings.push(`${where}: ${rel}.${k} 최소 ${f.min}개 필요 (현재 ${v.length})`);
          clean[k] = v;
        } else {
          const v = String(s[k] ?? '').trim();
          if (!v && !f.optional) warnings.push(`${where}: ${rel}.${k} 가 비었다`);
          if (v || !f.optional) clean[k] = v;
        }
      }
      slots[rel] = clean;
    }
    for (const rel of Object.keys(c.slots || {})) {
      if (!devices.includes(rel)) warnings.push(`${where}: 판정 안 한 방식 "${rel}"의 슬롯 — 제거`);
    }

    const headword = String(c.headword || '').trim();
    if (!headword) warnings.push(`${where}: headword 가 비었다`);
    else if (headword.length > 12) warnings.push(`${where}: headword "${headword}" 가 너무 길다 (2~10자 명사구)`);

    const confidence = ['high', 'med', 'low'].includes(c.confidence) ? c.confidence : 'low';
    if (confidence !== c.confidence) warnings.push(`${where}: confidence "${c.confidence}" 비정상 — low 로 강등`);

    claims.push({
      id: cid,
      claim: String(c.claim || '').trim(),
      devices,
      slots,
      evidence: (Array.isArray(c.evidence) ? c.evidence : []).map((e) => String(e).trim()).filter(Boolean),
      headword,
      confidence,
    });
  });

  return { lift: { memoId, claims, promptVersion: LIFT_PROMPT_VERSION }, warnings };
}
