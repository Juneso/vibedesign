# Round 20 — 2026-06-06

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

- **A1. 출처 강제 (Source-binding)** () — 2/2: 모든 메모의 sources 배열에 book-meta ID가 명시되어 있으며, 각 메모의 주장은 이 출처로 역추적 가능하다.
- **A2. 책 맥락 매핑 — 다양성·깊이** () — 2/2: 각 메모가 서로 다른 주제와 흐름을 다루고 있어, 책의 다양한 측면을 충분히 반영하고 있다.
- **A3. 키 개념 추출의 비자명성 (Non-triviality)** () — 2/2: 각 메모에서 제시된 핵심 개념들이 비자명하게 표현되어 있으며, 단순한 키워드가 아닌 메모의 맥락에서 어떻게 사용되는지를 잘 드러내고 있다.
- **A4. 사용자 사고(myThought) 반영** () — 1/2: myThought가 포함된 메모가 있지만, 일부 메모는 myThought의 관점이 충분히 반영되지 않았다.

<details><summary>출력 보기</summary>

```json
{
  "analyses": [
    {
      "memoId": "seed-memo-0",
      "thesis": "시장은 스스로 만족하는 선택에 대한 판단을 내리지 않으며, 거래하는 쌍방은 교환 대상의 가치를 스스로 판단한다.",
      "stance": "surface",
      "tocAnchor": "서론: 시장과 도덕",
      "anchorConfidence": "high",
      "keyConcepts": [
        "시장",
        "가치 평가",
        "선택"
      ],
      "bookContextLink": "이 책은 시장이 도덕적 판단을 배제하고, 개인의 선택에 의존하는 방식을 비판하며, 시장의 가치 평가가 사회적 규범에 미치는 영향을 탐구한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-1",
      "thesis": "시장 가격은 재화의 가치를 높게 평가하는 것뿐만 아니라 지불할 수 있는 능력도 반영한다.",
      "stance": "surface",
      "tocAnchor": "1장 새치기",
      "anchorConfidence": "high",
      "keyConcepts": [
        "시장 가격",
        "지불 능력",
        "가치 평가"
      ],
      "bookContextLink": "샌델은 시장 가격이 단순히 재화의 가치만을 반영하는 것이 아니라, 경제적 능력에 따라 달라지는 복잡한 구조를 설명하며, 이로 인해 발생하는 윤리적 문제를 논의한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-2",
      "thesis": "줄서기와 같은 비시장적 규범에 시장적 가치 체계가 개입됨으로써 우리의 가치와 규범이 변질될 수 있다.",
      "stance": "critique",
      "tocAnchor": "1장 새치기",
      "anchorConfidence": "high",
      "keyConcepts": [
        "줄서기",
        "비시장적 규범",
        "시장적 가치"
      ],
      "bookContextLink": "이 책은 시장이 비시장적 규범을 어떻게 변질시키는지를 탐구하며, 줄서기와 같은 사회적 규범이 시장의 개입으로 인해 어떻게 영향을 받는지를 논의한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-3",
      "thesis": "벌금과 요금의 적절성을 결정하기 위해서는 사회제도의 목적과 도덕적 책임을 고려해야 한다.",
      "stance": "apply",
      "tocAnchor": "2장 인센티브",
      "anchorConfidence": "high",
      "keyConcepts": [
        "벌금",
        "요금",
        "사회제도"
      ],
      "bookContextLink": "샌델은 벌금과 요금의 선택이 단순한 경제적 고려를 넘어, 사회제도의 목적과 도덕적 책임을 반영해야 한다고 주장하며, 시장의 도덕적 한계를 탐구한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-4",
      "thesis": "시장 규범이 비시장 규범을 밀어낼 가능성을 고려해야 하며, 이는 사회적 가치의 상실로 이어질 수 있다.",
      "stance": "critique",
      "tocAnchor": "2장 인센티브",
      "anchorConfidence": "high",
      "keyConcepts": [
        "시장 규범",
        "비시장 규범",
        "사회적 가치"
      ],
      "bookContextLink": "이 책은 시장 규범이 비시장적 규범을 어떻게 압도하는지를 분석하며, 이러한 변화가 사회적 가치에 미치는 영향을 깊이 있게 논의한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-5",
      "thesis": "시장에서의 가치평가와 교환이 특정 재화와 관행을 변질시킬 수 있다는 점을 지적한다.",
      "stance": "critique",
      "tocAnchor": "3장 시장은 어떻게 도덕을 밀어내는가",
      "anchorConfidence": "high",
      "keyConcepts": [
        "가치평가",
        "교환",
        "변질"
      ],
      "bookContextLink": "샌델은 시장의 작동 방식이 도덕적 가치와 사회적 관행을 어떻게 변질시키는지를 탐구하며, 시장의 도덕적 한계를 비판적으로 분석한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-6",
      "thesis": "재정적 인센티브가 공공정신을 개인의 노동으로 변질시킬 수 있으며, 이는 공동체 의식을 약화시킬 수 있다.",
      "stance": "critique",
      "tocAnchor": "3장 시장은 어떻게 도덕을 밀어내는가",
      "anchorConfidence": "high",
      "keyConcepts": [
        "재정적 인센티브",
        "공공정신",
        "공동체 의식"
      ],
      "bookContextLink": "이 책은 재정적 인센티브가 어떻게 시민의 의무를 개인의 노동으로 변질시키는지를 분석하며, 공동체 의식의 중요성을 강조한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-7",
      "thesis": "민주주의는 시민들이 서로의 차이를 이해하고 협상하는 과정을 요구하며, 이는 자본주의와의 충돌을 내포한다.",
      "stance": "connect",
      "tocAnchor": "5장 명명권",
      "anchorConfidence": "high",
      "keyConcepts": [
        "민주주의",
        "자본주의",
        "공동체"
      ],
      "bookContextLink": "샌델은 민주주의와 자본주의 간의 긴장을 탐구하며, 시민들이 서로의 차이를 이해하고 협상하는 과정이 민주주의의 본질임을 강조한다.",
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
        "body": "시장은 재화와 서비스의 거래가 이루어지는 시스템으로, 개인의 선택에 따라 가치가 평가된다. 마이클 샌델은 이 책에서 시장이 도덕적 판단을 배제하고 개인의 선택에 의존하는 방식을 비판하며, 시장의 가치 평가가 사회적 규범에 미치는 영향을 탐구한다. 시장의 작동 방식은 단순한 경제적 거래를 넘어, 사회적 가치와 윤리를 어떻게 변질시키는지를 논의하는 데 중요한 주제를 제공한다.",
        "sources": [
          {
            "kind": "book-meta",
            "id": "isbn_9788937833663"
          }
        ],
        "linkedBooks": [
          "isbn_9788937833663"
```

</details>


### A — 그리스인 조르바

- **A1 출처 강제 (Source-binding)** () — 2/2: 모든 메모의 sources 배열에 메모 ID가 명시되어 있으며, 각 주장은 sources에서 역추적 가능하다.
- **A2 책 맥락 매핑 — 다양성·깊이** () — 2/2: 각 메모가 서로 다른 주제와 흐름을 다루고 있어, 책의 다양한 측면을 충분히 반영하고 있다.
- **A3 키 개념 추출의 비자명성 (Non-triviality)** () — 2/2: 각 메모에서 제시된 핵심 개념들이 비자명하게 표현되어 있으며, 단순한 키워드가 아닌 깊이 있는 논의가 이루어지고 있다.
- **A4 사용자 사고(myThought) 반영** () — 2/2: N/A — 모든 메모의 myThought 가 비어있음 (자동 만점)

<details><summary>출력 보기</summary>

```json
{
  "analyses": [
    {
      "memoId": "seed-memo-0",
      "thesis": "꽃이 피기 위해서는 씨앗이 필요하다는 비유를 통해, 인간의 본성과 욕망이 어떻게 형성되는지를 질문하고 있다.",
      "stance": "critique",
      "tocAnchor": "미지정",
      "anchorConfidence": "low",
      "keyConcepts": [
        "욕망",
        "본성",
        "인간성"
      ],
      "bookContextLink": "조르바는 인간의 본성과 욕망에 대해 깊이 있는 질문을 던지며, 그가 겪는 영혼의 투쟁은 단순한 기행이 아닌 자유를 향한 진지한 탐구로 해석된다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-1",
      "thesis": "자신의 욕망에서 자유로워지는 것이 진정한 자유인지에 대한 의문을 제기하며, 높은 이상을 위해 희생하는 것이 노예근성일 수 있음을 탐구하고 있다.",
      "stance": "critique",
      "tocAnchor": "미지정",
      "anchorConfidence": "low",
      "keyConcepts": [
        "자유",
        "희생",
        "노예근성"
      ],
      "bookContextLink": "조르바는 자유의 개념을 탐구하며, 인간이 높은 이상을 위해 자신을 희생하는 것이 과연 진정한 자유인지에 대한 질문을 던진다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-2",
      "thesis": "죽음을 생각하며 행동하는 것과 죽음이 없다는 듯이 행동하는 것이 본질적으로 유사할 수 있음을 제안하고 있다.",
      "stance": "surface",
      "tocAnchor": "미지정",
      "anchorConfidence": "low",
      "keyConcepts": [
        "죽음",
        "행동",
        "존재"
      ],
      "bookContextLink": "조르바는 인간 존재의 복잡성을 탐구하며, 죽음에 대한 인식이 어떻게 우리의 행동에 영향을 미치는지를 성찰한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-3",
      "thesis": "사람들이 현실을 직시하게 되면 그들의 불행과 처참함을 보게 될 것이라는 두려움을 표현하고 있다.",
      "stance": "critique",
      "tocAnchor": "미지정",
      "anchorConfidence": "low",
      "keyConcepts": [
        "현실",
        "불행",
        "자각"
      ],
      "bookContextLink": "조르바는 현실을 직시하는 것이 인간에게 어떤 영향을 미치는지를 탐구하며, 진정한 자유를 찾기 위한 고뇌를 표현한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-4",
      "thesis": "행복은 개인의 몸 크기와 같아, 사람의 크기는 계속 변하기 때문에 행복도 재조정이 필요하다는 성찰을 담고 있다.",
      "stance": "surface",
      "tocAnchor": "미지정",
      "anchorConfidence": "low",
      "keyConcepts": [
        "행복",
        "변화",
        "자아"
      ],
      "bookContextLink": "조르바는 행복의 개념을 개인의 성장과 변화와 연결지으며, 인간의 복잡한 감정을 탐구한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-5",
      "thesis": "어른이 되어서도 여전히 높은 이상에 빠지려는 위험을 경계하며, 단지 말만 바꾸는 것이 구원이 아님을 자각하고 있다.",
      "stance": "critique",
      "tocAnchor": "미지정",
      "anchorConfidence": "low",
      "keyConcepts": [
        "위험",
        "이상",
        "구원"
      ],
      "bookContextLink": "조르바는 인간이 이상을 추구하는 과정에서 겪는 위험과 그로 인해 발생하는 혼란을 탐구한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-6",
      "thesis": "현실을 추상 개념으로 바꾸어 필연성을 주장하는 것이 인간의 본능적 도피임을 고백하고 있다.",
      "stance": "surface",
      "tocAnchor": "미지정",
      "anchorConfidence": "low",
      "keyConcepts": [
        "현실",
        "추상",
        "필연성"
      ],
      "bookContextLink": "조르바는 현실을 직시하기보다는 개념으로 도피하는 인간의 본성을 탐구하며, 진정한 자유를 찾기 위한 고뇌를 표현한다.",
      "userContextLinks": []
    },
    {
      "memoId": "seed-memo-7",
      "thesis": "피할 수 없는 상황에서 자신의 행동으로 본질을 변화시키는 것이 인간에게 주어진 유일한 구원의 길일 수 있음을 제안하고 있다.",
      "stance": "surface",
      "tocAnchor": "미지정",
      "anchorConfidence": "low",
      "keyConcepts": [
        "구원",
        "행동",
        "본질"
      ],
      "bookContextLink": "조르바는 인간의 선택과 행동이 어떻게 현실을 변화시킬 수 있는지를 탐구하며, 자유의 의미를 성찰한다.",
      "userContextLinks": []
    }
  ],
  "patches": [
    {
      "action": "create",
      "pageId": "concept-욕망",
      "pageDraft": {
        "title": "욕망",
        "type": "concept",
        "body": "욕망은 인간의 본성과 행동을 형성하는 중요한 요소로, 개인의 선택과 삶의 방향을 결정짓는다. 이 책은 조르바를 통해 욕망이 어떻게 인간의 행동에 영향을 미치는지를 탐구하며, 욕망에서의 자유를 찾는 과정을 그린다. 욕망은 때로는 인간을 노예로 만들기도 하며, 그로 인해 발생하는 갈등과 긴장을 통해 인간 존재의 복잡성을 드러낸다.",
        "sources": [
          {
            "kind": "book-meta",
            "id": "isbn_9788932909349"
          }
        ],
        "linkedBooks": [
          "isbn_9788932909349"
        ],
        "bookId": "isbn_9788932909349",
        "keyConcepts": [
          "욕망",
          "본성",
          "인간성"
        ]
      },
      "append": ""
    },
    {
      "action": "crea
```

</details>


---

## 파이프라인 B · Profile

| 케이스 | 합격 | 점수 | 의심 사유 |
|---|---|---|---|
| 사용자 프로필 | ✅  | B1 3축 매핑 충실도:2 B2 출처 추적성:2 B3 직접 용어 누출 방지:2 B4 추상화 전환 충실도:2 |  |


### B — 사용자 프로필

- **B1 3축 매핑 충실도** () — 2/2: 모든 축(인지, 정서, 실무)에서 의미 있는 derivedKeywords가 도출되었으며, 각 키워드는 입력 필드에서 명확히 파생되었다.
- **B2 출처 추적성** () — 2/2: 모든 derivedKeyword가 명확하게 어느 입력 필드에서 파생되었는지 추적 가능하다.
- **B3 직접 용어 누출 방지** () — 2/2: 직접 용어가 포함되지 않고, 사용자의 사고 방식과 행동 패턴이 잘 반영된 키워드들이다.
- **B4 추상화 전환 충실도** () — 2/2: 키워드들이 직군의 표면적인 용어를 넘어 사용자의 사고 방식과 정서를 잘 반영하고 있다.

<details><summary>derivedKeywords</summary>

- **복잡한 문제의 탐색** (실무, currentConcerns) — currentConcerns 의 '어렵고 복잡한 사용성 문제'에서 파생
- **창의적 문제 해결** (정서, interests) — interests 의 '새로운 아이디어를 만들어 보여줄 때 몰입'에서 파생
- **협력적 결과 도출** (실무, values) — values 의 '협력해서 혼자 못 할 결과를 만드는 뿌듯함'에서 파생
- **결정의 불안감** (정서, currentConcerns) — currentConcerns 의 '사소한 부분에서 결정 못 하는 경향'에서 파생
- **의미 중심의 접근** (인지, values) — values 의 '왜인지 명확히 알고 시작'에서 파생
- **기술적 가능성 탐구** (실무, currentConcerns) — currentConcerns 의 '기술이 가져올 가능성과 위험'에서 파생
- **사용성 개선의 필요성** (실무, currentConcerns) — currentConcerns 의 '자유도 높고 범용성 높은 영역의 근본적 사용성 개선'에서 파생
- **디지털 경험의 영향력** (정서, currentConcerns) — currentConcerns 의 '디지털 프로덕트가 일상에 미치는 영향과 임팩트'에서 파생

</details>


---

## 파이프라인 C · Nudge

| 케이스 | 합격 | 점수 | 의심 사유 |
|---|---|---|---|
| 돈으로 살 수 없는 것들 | ❌  | C1. 근거 강제 (Grounding):2 C2. 3종 유형 적합성:2 C3. derivedKeywords 활용 (개인화):0 C4. 연결 자연스러움 (Connection naturalness):2 |  |
| 그리스인 조르바 | ❌  | C1. 근거 강제 (Grounding):2 C2. 3종 유형 적합성:2 C3. derivedKeywords 활용 (개인화):0 C4. 연결 자연스러움 (Connection naturalness):2 |  |


### C — 돈으로 살 수 없는 것들

- **C1. 근거 강제 (Grounding)** () — 2/2: 모든 주장이 sourcePageIds에 명시된 페이지로 역추적 가능하며, 책 원문 추론이 없다.
- **C2. 3종 유형 적합성** () — 2/2: 출력 유형이 memo-memo로 명확히 분류되며, sourcePageIds가 해당 유형과 일치한다.
- **C3. derivedKeywords 활용 (개인화)** () — 0/2: derivedKeywords가 질문 표현에 반영되지 않아, 다른 프로필을 넣어도 같은 질문이 나올 가능성이 높다.
- **C4. 연결 자연스러움 (Connection naturalness)** () — 2/2: 시장 가격과 시장의 개념이 같은 책에서 서로 연관된 주제를 다루고 있어 자연스럽게 연결된다.

> 시장 가격이 재화의 가치를 평가하는 방식에 어떤 영향을 미치는가?

- type: `memo-memo`
- sourcePageIds: market, price
- usedDerivedKeywords: _(없음)_


### C — 그리스인 조르바

- **C1. 근거 강제 (Grounding)** () — 2/2: 모든 주장이 sourcePageIds에 명시된 페이지로 역추적 가능하며, 책의 내용을 기반으로 한 질문이므로 grounding이 잘 이루어졌다.
- **C2. 3종 유형 적합성** () — 2/2: 출력 유형이 memo-memo로 명확히 분류되며, sourcePageIds도 해당 유형에 적합하게 구성되어 있다.
- **C3. derivedKeywords 활용 (개인화)** () — 0/2: derivedKeywords가 질문 표현에 반영되지 않아 개인화가 이루어지지 않았다.
- **C4. 연결 자연스러움 (Connection naturalness)** () — 2/2: 욕망과 현실이 같은 책에서 연관된 주제를 다루고 있어 자연스럽게 연결된다.

> 꽃 한 송이를 피우기 위해 필요한 씨앗은 무엇을 의미할까?

- type: `memo-memo`
- sourcePageIds: concept-욕망, concept-현실
- usedDerivedKeywords: _(없음)_


---

## 다음 튜닝 액션 제안 (DES-198)

- C 합격률 0% — Nudge 프롬프트 라운드 (DES-203). 실패 축: C3. derivedKeywords 활용 (개인화)
