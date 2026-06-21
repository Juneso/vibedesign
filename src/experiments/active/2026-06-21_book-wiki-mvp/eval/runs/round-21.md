# Round 21 — 2026-06-06

> Model: `gpt-4o-mini`. 자기평가는 LLM 1차 채점. 🚩 = 사용자 검토 필요.

## 합격률 요약

| 파이프라인 | 합격/전체 | 합격률 | 의심 |
|---|---|---|---|
| A · Ingest | 2/2 | **100%** | 0 |
| B · Profile | 1/1 | **100%** | 0 |
| C · Nudge | 0/2 | **0%** | 0 |

## 의심 케이스 short list

_(없음)_

---

## 파이프라인 A · Ingest

| 케이스 | 합격 | 점수 | 의심 사유 |
|---|---|---|---|
| 돈으로 살 수 없는 것들 | ✅  | A1. 출처 강제 (Source-binding):2 A2. 책 맥락 매핑 — 다양성·깊이:2 A3. 키 개념 추출의 비자명성 (Non-triviality):2 A4. 사용자 사고(myThought) 반영:1 |  |
| 그리스인 조르바 | ✅  | A1 출처 강제 (Source-binding):2 A2 책 맥락 매핑 — 다양성·깊이:2 A3 키 개념 추출의 비자명성 (Non-triviality):2 A4 사용자 사고(myThought) 반영:2 |  |


### A — 돈으로 살 수 없는 것들

- **A1. 출처 강제 (Source-binding)** () — 2/2: 모든 메모의 ID가 sources에 명시되어 있으며, 각 주장의 출처가 명확하게 역추적 가능하다.
- **A2. 책 맥락 매핑 — 다양성·깊이** () — 2/2: 각 메모가 서로 다른 주제와 흐름을 다루고 있어 다양성이 충분히 확보되어 있다.
- **A3. 키 개념 추출의 비자명성 (Non-triviality)** () — 2/2: 각 메모에서 비자명한 핵심 개념이 잘 추출되어 있으며, 단순한 명사 나열이 아니다.
- **A4. 사용자 사고(myThought) 반영** () — 1/2: myThought가 일부 메모에 반영되었으나, 모든 메모에서 명시적으로 통합되지 않았다.

<details><summary>출력 보기</summary>

```json
{
  "analyses": [
    {
      "memoId": "seed-memo-0",
      "thesis": "시장은 재화의 가치를 평가하는 방식이 다른 것보다 기준이 높거나 더 가치 있는지 따지지 않으며, 스스로 만족하는 선택에 대한 판단을 내리지 않는다.",
      "stance": "surface",
      "tocAnchor": "서론: 시장과 도덕",
      "anchorConfidence": "high",
      "keyConcepts": [
        "시장",
        "선택",
        "가치 평가"
      ],
      "bookContextLink": "이 책은 시장의 도덕적 한계와 시장지상주의의 맹점을 논의하며, 시장이 스스로 판단하지 않는다는 점을 강조한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-1",
      "thesis": "시장 가격은 자발적으로 지불하려는 마음과 지불할 수 있는 능력을 반영하며, 이는 재화의 가치를 높게 평가한다는 것을 의미하지 않는다.",
      "stance": "surface",
      "tocAnchor": "1. 새치기",
      "anchorConfidence": "high",
      "keyConcepts": [
        "시장 가격",
        "가치 평가",
        "지불 능력"
      ],
      "bookContextLink": "샌델은 시장 가격이 단순히 가치 평가를 반영하는 것이 아니라, 지불 능력과 자발적인 마음을 포함한다고 설명한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-2",
      "thesis": "줄서기와 같은 비시장적 규범에 시장적 가치 체계가 개입되며, 이는 우리가 가진 가치와 규범을 반영하고 조장한다.",
      "stance": "connect",
      "tocAnchor": "1. 새치기",
      "anchorConfidence": "high",
      "keyConcepts": [
        "줄서기",
        "비시장적 규범",
        "시장적 가치"
      ],
      "bookContextLink": "이 책은 시장이 비시장적 규범에 개입하여 우리의 가치와 규범을 어떻게 변형시키는지를 다룬다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-3",
      "thesis": "벌금과 요금의 적절한 선택은 사회제도의 목적과 도덕적 책임을 먼저 따져야 한다.",
      "stance": "apply",
      "tocAnchor": "2. 인센티브",
      "anchorConfidence": "high",
      "keyConcepts": [
        "벌금",
        "요금",
        "사회제도"
      ],
      "bookContextLink": "샌델은 벌금과 요금의 선택이 사회제도의 목적과 도덕적 책임에 따라 달라져야 한다고 주장한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-4",
      "thesis": "시장 규범이 비시장 규범을 밀어낼 것인지, 그리고 그것이 우려할 만한 상실인지 판단해야 한다.",
      "stance": "critique",
      "tocAnchor": "2. 인센티브",
      "anchorConfidence": "high",
      "keyConcepts": [
        "시장 규범",
        "비시장 규범",
        "상품화"
      ],
      "bookContextLink": "이 책은 시장이 비시장적 규범을 어떻게 밀어내는지를 분석하며, 그로 인해 발생하는 문제를 탐구한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-5",
      "thesis": "시장 가치평가와 교환이 특정 재화와 관행을 변질시킨다는 주장을 통해 시장의 도덕적 한계를 드러낸다.",
      "stance": "critique",
      "tocAnchor": "3. 시장은 어떻게 도덕을 밀어내는가",
      "anchorConfidence": "high",
      "keyConcepts": [
        "시장 가치평가",
        "교환",
        "도덕적 한계"
      ],
      "bookContextLink": "샌델은 시장이 도덕을 밀어내는 방식과 그로 인해 발생하는 부정적 영향을 분석한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-6",
      "thesis": "재정적 인센티브가 공공정신에서 우러난 활동을 보상받기 위한 노동으로 바꾸어 놓았다.",
      "stance": "critique",
      "tocAnchor": "3. 시장은 어떻게 도덕을 밀어내는가",
      "anchorConfidence": "high",
      "keyConcepts": [
        "재정적 인센티브",
        "공공정신",
        "노동"
      ],
      "bookContextLink": "이 책은 재정적 인센티브가 시민의 의무를 어떻게 변질시키는지를 논의한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-7",
      "thesis": "민주주의는 시민들이 서로의 차이를 견뎌내고 협상하며 공공선에 관심을 쏟는 것을 요구한다.",
      "stance": "connect",
      "tocAnchor": "5. 명명권",
      "anchorConfidence": "high",
      "keyConcepts": [
        "민주주의",
        "공동체",
        "차이"
      ],
      "bookContextLink": "이 책은 민주주의와 자본주의 간의 충돌을 다루며, 시민의 역할을 강조한다.",
      "userContextLinks": []
    }
  ],
  "patches": [
    {
      "action": "create",
      "pageId": "market",
      "pageDraft": {
        "title": "시장",
        "type": "concept",
        "body": "시장은 재화와 서비스의 거래가 이루어지는 공간으로, 가격을 통해 자원 배분을 결정하는 메커니즘이다. 이 책은 시장이 도덕적 한계를 지니고 있으며, 시장지상주의가 사회의 다양한 영역에 미치는 영향을 분석한다. 시장이 스스로 판단하지 않으며, 가치 평가에 있어 지불 능력과 자발적인 마음이 포함된다는 점은 논쟁적이다.",
        "sources": [
          {
            "kind": "book-meta",
            "id": "isbn_9788937833663"
          },
          {
            "kind": "memo",
            "id": "seed-memo-0",
            "bookId": "isbn_9788937833663"
          },
          {
            "kind": "memo",
            "id": "seed-memo-1",
            "bookId": "isbn_9788937833663"
          },
          {
            "k
```

</details>


### A — 그리스인 조르바

- **A1 출처 강제 (Source-binding)** () — 2/2: 모든 wiki 페이지의 sources 배열에 메모 ID 또는 book-meta ID가 명시되어 있으며, 페이지 본문의 모든 주장이 sources 중 하나로 역추적 가능하다.
- **A2 책 맥락 매핑 — 다양성·깊이** () — 2/2: 각 메모가 서로 다른 주제를 다루고 있으며, 조르바의 다양한 주제를 통해 인간 존재의 복잡성을 탐구하고 있다.
- **A3 키 개념 추출의 비자명성 (Non-triviality)** () — 2/2: 각 메모에서 비자명한 핵심 개념이 잘 추출되어 있으며, 단순한 단어 나열이 아닌 깊이 있는 분석이 이루어졌다.
- **A4 사용자 사고(myThought) 반영** () — 2/2: N/A — 모든 메모의 myThought 가 비어있음 (자동 만점)

<details><summary>출력 보기</summary>

```json
{
  "analyses": [
    {
      "memoId": "seed-memo-0",
      "thesis": "꽃이 피기 위해서는 씨앗이 필요하다는 점에서, 인간의 본성과 욕망이 서로 연결되어 있음을 질문하고 있다.",
      "stance": "critique",
      "tocAnchor": "미지정",
      "anchorConfidence": "low",
      "keyConcepts": [
        "욕망",
        "인간 본성",
        "자유"
      ],
      "bookContextLink": "조르바는 인간의 본성과 욕망을 탐구하며, 자유를 향한 투쟁을 통해 인간 존재의 복잡성을 드러낸다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-1",
      "thesis": "높은 이상을 위해 자신을 희생하는 것이 과연 진정한 자유인지 의문을 제기하고 있다.",
      "stance": "critique",
      "tocAnchor": "미지정",
      "anchorConfidence": "low",
      "keyConcepts": [
        "자유",
        "희생",
        "노예근성"
      ],
      "bookContextLink": "조르바는 자유와 희생의 관계를 탐구하며, 인간의 진정한 자유가 무엇인지에 대한 질문을 던진다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-2",
      "thesis": "죽음을 생각하며 행동하는 것과 죽음이 없다고 행동하는 것이 본질적으로 유사할 수 있음을 암시하고 있다.",
      "stance": "surface",
      "tocAnchor": "미지정",
      "anchorConfidence": "low",
      "keyConcepts": [
        "죽음",
        "행동",
        "존재"
      ],
      "bookContextLink": "조르바는 인간 존재의 복잡성과 죽음에 대한 인식을 통해 삶의 의미를 탐구한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-3",
      "thesis": "사람들이 현실을 직시하게 되면 불행과 처참함을 마주하게 될 것이라는 두려움을 표현하고 있다.",
      "stance": "critique",
      "tocAnchor": "미지정",
      "anchorConfidence": "low",
      "keyConcepts": [
        "현실",
        "불행",
        "자유"
      ],
      "bookContextLink": "조르바는 현실을 직시하는 것이 가져오는 고통과 그로 인해 얻는 자유의 관계를 탐구한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-4",
      "thesis": "행복은 개인의 몸 크기와 같아, 지속적으로 재조정해야 한다는 점을 강조하고 있다.",
      "stance": "surface",
      "tocAnchor": "미지정",
      "anchorConfidence": "low",
      "keyConcepts": [
        "행복",
        "자아",
        "변화"
      ],
      "bookContextLink": "조르바는 행복의 상대성과 개인의 자아를 탐구하며, 지속적인 자기 인식을 강조한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-5",
      "thesis": "높은 이상에 빠져들 위험과 그로 인해 진정한 발전이 이루어지지 않는 상황을 반성하고 있다.",
      "stance": "critique",
      "tocAnchor": "미지정",
      "anchorConfidence": "low",
      "keyConcepts": [
        "위험",
        "이상",
        "발전"
      ],
      "bookContextLink": "조르바는 높은 이상을 추구하는 것이 인간의 발전에 미치는 영향을 탐구한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-6",
      "thesis": "현실을 추상화하여 필연성으로 환원하는 경향을 비판하고 있다.",
      "stance": "critique",
      "tocAnchor": "미지정",
      "anchorConfidence": "low",
      "keyConcepts": [
        "현실",
        "필연성",
        "추상화"
      ],
      "bookContextLink": "조르바는 현실을 직시하는 것의 중요성을 강조하며, 인간의 사고 방식에 대한 비판을 제기한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-7",
      "thesis": "자유의지에 따른 행동이 인간에게 주어진 구원의 길이라는 점을 강조하고 있다.",
      "stance": "surface",
      "tocAnchor": "미지정",
      "anchorConfidence": "low",
      "keyConcepts": [
        "자유의지",
        "행동",
        "구원"
      ],
      "bookContextLink": "조르바는 인간의 자유의지와 그에 따른 행동이 삶의 의미를 찾는 데 중요한 역할을 한다고 주장한다.",
      "userContextLinks": []
    }
  ],
  "patches": [
    {
      "action": "create",
      "pageId": "freedom",
      "pageDraft": {
        "title": "자유",
        "type": "concept",
        "body": "자유는 개인이 외부의 압력이나 제약 없이 자신의 의지에 따라 행동할 수 있는 상태를 의미한다. '그리스인 조르바'는 자유의 본질과 그것이 인간 존재에 미치는 영향을 탐구하며, 조르바의 행동과 사고를 통해 자유의 복잡성을 드러낸다. 이 개념은 인간의 본성과 욕망, 그리고 사회적 제약과의 관계에서 논의되며, 자유가 진정한 의미에서 무엇인지에 대한 질문을 던진다.",
        "sources": [
          {
            "kind": "book-meta",
            "id": "isbn_9788932909349"
          }
        ],
        "linkedBooks": [
          "isbn_9788932909349"
        ],
        "keyConcepts": [
          "자유",
          "욕망",
          "희생"
        ]
      },
      "append": "",
      "addSources": []
    },
    {
      "action": "create",
      "pageId": "desire",
      "pageDraft": {
        "title": "욕망",
        "type": "concept",
        "body": "욕망은 개인이 원하는 것을 추구하는 내적 동기를 의미하며, 이는 인간 행동의 중요한 원인 중 하나이다. '그리스인 조르바'는 욕망이 인간의 삶에 미치는 영향을 탐구하며, 조르바
```

</details>


---

## 파이프라인 B · Profile

| 케이스 | 합격 | 점수 | 의심 사유 |
|---|---|---|---|
| 사용자 프로필 | ✅  | B1. 3축 매핑 충실도:2 B2. 출처 추적성:2 B3. 직접 용어 누출 방지:2 B4. 추상화 전환 충실도:2 |  |


### B — 사용자 프로필

- **B1. 3축 매핑 충실도** () — 2/2: 모든 축에서 의미 있는 derivedKeywords가 도출되었으며, 각 키워드는 입력 프로필의 다양한 요소에서 파생되었다.
- **B2. 출처 추적성** () — 2/2: 모든 derivedKeyword가 명확하게 어느 입력 필드에서 파생되었는지 추적 가능하다.
- **B3. 직접 용어 누출 방지** () — 2/2: 직접 용어가 포함되지 않고, 사용자의 사고 방식과 행동 패턴이 잘 반영되었다.
- **B4. 추상화 전환 충실도** () — 2/2: 직군의 사고 패턴과 정서가 잘 반영된 키워드들이 도출되어, 일반론이 아닌 개인의 행동 방식이 드러났다.

<details><summary>derivedKeywords</summary>

- **다층적 제약 속 해결책 탐색** (인지, currentConcerns) — currentConcerns 의 '어렵고 복잡한 사용성 문제'에서 파생
- **창의적 문제 해결의 몰입감** (정서, interests) — interests 의 '새로운 아이디어를 만들어 보여줄 때 가장 큰 몰입'에서 파생
- **사용성 개선을 위한 실험적 접근** (실무, currentConcerns) — currentConcerns 의 '어렵고 복잡한 사용성 문제'와 interests 의 '프로토타이핑'에서 파생
- **결정 마비에 대한 두려움** (정서, currentConcerns) — currentConcerns 의 '사소한 부분에서 결정 못 하는 경향'에서 파생
- **협력적 결과 도출의 중요성** (실무, values) — values 의 '협력해서 혼자 못 할 결과를 만드는 뿌듯함'에서 파생
- **의미 중심의 작업 방식** (인지, values) — values 의 '왜인지 명확히 알고 시작'에서 파생
- **디지털 경험의 확장 가능성** (정서, currentConcerns) — currentConcerns 의 '디지털 프로덕트가 일상에 미치는 영향과 임팩트'에서 파생
- **빠른 피드백을 통한 학습** (실무, interests) — interests 의 '새 툴 빠르게 익힘'에서 파생

</details>


---

## 파이프라인 C · Nudge

| 케이스 | 합격 | 점수 | 의심 사유 |
|---|---|---|---|
| 돈으로 살 수 없는 것들 | ❌  | C1. 근거 강제 (Grounding):0 C2. 3종 유형 적합성:0 C3. derivedKeywords 활용 (개인화):0 C4. 연결 자연스러움 (Connection naturalness):0 |  |
| 그리스인 조르바 | ❌  | C1. 근거 강제 (Grounding):0 C2. 3종 유형 적합성:0 C3. derivedKeywords 활용 (개인화):0 C4. 연결 자연스러움 (Connection naturalness):0 |  |


### C — 돈으로 살 수 없는 것들

- **C1. 근거 강제 (Grounding)** () — 0/2: 출력이 null로 제공되어 근거가 전혀 없으므로 0점.
- **C2. 3종 유형 적합성** () — 0/2: 출력이 null로 제공되어 유형 적합성을 평가할 수 없으므로 0점.
- **C3. derivedKeywords 활용 (개인화)** () — 0/2: 출력이 null로 제공되어 derivedKeywords 활용 여부를 평가할 수 없으므로 0점.
- **C4. 연결 자연스러움 (Connection naturalness)** () — 0/2: 출력이 null로 제공되어 연결 자연스러움을 평가할 수 없으므로 0점.

> _(질문 없음)_

- type: `-`
- sourcePageIds: _(없음)_
- usedDerivedKeywords: _(없음)_


### C — 그리스인 조르바

- **C1. 근거 강제 (Grounding)** () — 0/2: 출력이 null로 제공되어 근거가 전혀 없으므로 0점.
- **C2. 3종 유형 적합성** () — 0/2: 출력이 null로 제공되어 유형 분류가 불가능하므로 0점.
- **C3. derivedKeywords 활용 (개인화)** () — 0/2: 출력이 null로 제공되어 derivedKeywords가 질문 표현에 반영되지 않았으므로 0점.
- **C4. 연결 자연스러움 (Connection naturalness)** () — 0/2: 출력이 null로 제공되어 연결이 전혀 없으므로 0점.

> _(질문 없음)_

- type: `-`
- sourcePageIds: _(없음)_
- usedDerivedKeywords: _(없음)_


---

## 다음 튜닝 액션 제안 (DES-198)

- C 합격률 0% — Nudge 프롬프트 라운드 (DES-203). 실패 축: C1. 근거 강제 (Grounding)
