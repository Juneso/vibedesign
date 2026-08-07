export const SERIES_META = {
  'round':                { title: '인제스트 품질 라운드', purpose: '위계·키워드 추출을 반복 평가', pipelineId: 'hier-ingest-v5' },
  'connections-qf':       { title: '책 간 연결 — 공유질문 우선', purpose: 'question-first 방식으로 두 책을 잇는 후보', pipelineId: 'connections-qf' },
  'connection-candidates':{ title: '책 간 연결 — 초기 후보', purpose: '연결 후보 초안 추출(초기 트랙)', pipelineId: null },
  'nudge-v7':             { title: '넛지 V7 — co-reader 톤', purpose: 'AI가 먼저 생각을 말하고 넘기는 질문', pipelineId: null },
  'nudge-v8':             { title: '넛지 V8 — 좋은 질문 검증', purpose: '정지력을 넘어 실제로 좋은 질문인지', pipelineId: 'nudge-v8' },
  'nudge-v8-proto':       { title: '넛지 V8 프로토타입', purpose: 'V8 규칙 초안 실험', pipelineId: 'nudge-v8' },
  'nudge-variants':       { title: '넛지 변형 비교', purpose: 'V1~V3 톤·전략 변형 대조', pipelineId: null },
  'judge-calib':          { title: 'LLM 채점자 보정', purpose: '자동 채점을 사람 기준에 정렬', pipelineId: null },
  'calib-labeling-sheet': { title: '채점 보정용 라벨링 시트', purpose: '사람이 기준 케이스를 라벨링', pipelineId: null },
  'toc-ablation':         { title: '목차 유무 비교', purpose: '목차가 인제스트 품질에 주는 영향', pipelineId: null },
  'hier-stability-v5':    { title: 'ingest V5', purpose: '셔플 안정성 베이스라인 — LLM 재량 위계가 재현되는지', pipelineId: 'hier-ingest-v5' },
  'hier-stability-v6':    { title: 'ingest V6', purpose: '셔플 안정성 — 치환 테스트 + 양방향 교차검증', pipelineId: 'hier-ingest-v7' },
  'hier-stability-v7':    { title: 'ingest V7', purpose: '셔플 안정성 — 책 인용 anchor 테마 + critic 반증', pipelineId: 'hier-ingest-v7' },
  'hier-stability-v8':    { title: 'ingest V8', purpose: '개요(리치데이터) + 위계 통합 — planIngest 위에 테마', pipelineId: 'hier-ingest-v8' },
  'hier-money-v8':        { title: 'ingest V8 · 돈으로', purpose: '돈으로 살 수 없는 것들 — 실 발췌 개요+테마', pipelineId: 'hier-ingest-v8' },
  'hier-desire-v8':       { title: 'ingest V8 · 욕망의사물', purpose: '욕망의 사물 — 실 발췌 개요+테마 (알라딘 메타 빈약)', pipelineId: 'hier-ingest-v8' },
  'obsidian-ingest':      { title: '옵시디언 실 발췌 — planIngest만', purpose: '210 Books 실 발췌 10권 — Phase 1만 실행(위계 없음)', pipelineId: 'hier-ingest-v8' },
  'obsidian-hier-v8':     { title: '옵시디언 V8 전체 · 위계 4o-mini', purpose: '리치데이터 주입 + Phase 1→1.5→2 (위계 모델 gpt-4o-mini)', pipelineId: 'hier-ingest-v8' },
  'obsidian-hier-v8-4o':  { title: '옵시디언 V8 전체 · 위계 4o', purpose: '같은 입력, 위계 모델만 gpt-4o 로 상향 — 테마 밀도 비교', pipelineId: 'hier-ingest-v8' },
  // V9 — 동화 우선. 등록이 없으면 대시보드가 아예 노출하지 않아 그동안 안 보였다.
  'hier-v9-batch':        { title: 'V9 전수 · 56권', purpose: '데이터셋 56권 887메모 배치 — 순서 바꿔도 같은 트리인지', pipelineId: 'hier-ingest-v9' },
  'hier-v9':              { title: 'V9 · 디자인의 디자인', purpose: '도착 순서 3종으로 수렴 안정성 + 오라클 일치', pipelineId: 'hier-ingest-v9' },
  'hier-v9-money':        { title: 'V9 · 돈으로', purpose: '돈으로 살 수 없는 것들 — 순서 3종 수렴 검증', pipelineId: 'hier-ingest-v9' },
  'hier-v9-justice':      { title: 'V9 · 정의란 무엇인가', purpose: '정의란 무엇인가 — 순서 3종 수렴 검증', pipelineId: 'hier-ingest-v9' },
  'hier-v9-zorba':        { title: 'V9 · 조르바', purpose: '목차 없는 소설 — 평면 폴백 + 상향 승격 테스트베드', pipelineId: 'hier-ingest-v9' },
  'hier-v9-toc':          { title: 'V9 목차 A/B', purpose: '알라딘 목차를 뼈대로 넣었을 때의 효과 — 메모 고정, 목차만 변경', pipelineId: 'hier-ingest-v9' },
  'hier-v9-tree':         { title: 'V9 위계 트리 · 9권', purpose: 'V8 과 같은 책·같은 형식으로 그린 트리 — 나란히 비교용', pipelineId: 'hier-ingest-v9' },
  'hier-v8-full':         { title: 'V8 · 메모 전량 (공정비교)', purpose: 'V9 와 같은 메모를 넣은 V8 — MAX_MEMOS 로 자르지 않음', pipelineId: 'hier-ingest-v8' },
  'hier-v10':             { title: 'V10 · 전개 방식 기반', purpose: '책이 이야기를 풀어가는 방식을 판정해 그 축으로 위계 구성', pipelineId: 'hier-ingest-v10' },
  'hier-v11':             { title: 'V11 · 관계 축 기반', purpose: '핵심 개념 아래를 "개념(분석)·기원(통시)" 같은 관계 축으로 편성 — 혼재 전개 대응', pipelineId: 'hier-ingest-auto' },
  'hier-auto':            { title: '자동 디스패치 · 최종안', purpose: '목차 시간순(high)이면 v10 시대 편성, 아니면 v11 관계 축 — BKT-380 확정 구조', pipelineId: 'hier-ingest-auto' },
  'hier-incr':            { title: '증분 동화 · 비문학', purpose: '메모 1건씩 동화 — 부트 일괄 + 폐쇄형 배정 + 성장 단계 승격 시 재정리 (BKT-382)', pipelineId: 'hier-ingest-auto' },
  'literature-v1':        { title: '문학 V1 · 모티프 축', purpose: '소설 전용 파이프라인 — 모티프 1차 축 + 인물 조건부 승격, 문장은 페이지순(서사 진행)', pipelineId: 'literature-v1' },
  'placement':            { title: '배치 테스트', purpose: '라벨 경로만 보고 메모를 제자리에 놓을 수 있는가 — 임베딩 최근접 기준선과 비교해 관계 라벨의 기여를 잰다', pipelineId: 'hier-ingest-auto' },
  'defects':              { title: '결함 감사', purpose: '알려진 결함 14종이 트리에 몇 건 있는지 — 점수가 아니라 지목된 노드를 열어 사람이 검증하는 지표', pipelineId: 'hier-ingest-auto' },
  'competency':           { title: '역량 질문 채점', purpose: '트리만 보고 핵심 주장·근거·전개·사례 질문에 답할 수 있는지 — 온톨로지 품질 측정', pipelineId: 'hier-ingest-auto' },
  // V12 — 주장 단위(lift 우선). 런이 세 종류로 갈린다:
  //   lift-*        메모 1건 → 주장 분해 결과 (조립 전 재료)
  //   hier-v12-*    그 재료로 세운 트리
  //   mapmatch-*    그 트리의 지도 일치 6축 점수
  // 같은 실험의 세 면이라 한 파이프라인 아래 나란히 둔다.
  'lift-v12-haiku':       { title: 'lift · 하이쿠 전량', purpose: '피로사회 24메모를 구조 먼저로 분해 — 조립에 들어갈 재료 (8회차가 v12.4)', pipelineId: 'hier-ingest-v12' },
  'lift-v12-haiku-probe': { title: 'lift · 표적 프로브', purpose: '프롬프트 튜닝용 표적 메모만 lift — 24콜 대신 2~3콜', pipelineId: 'hier-ingest-v12' },
  'hier-v12-manual':      { title: 'V12 · 골든 입력 상한선', purpose: '사람이 만든 lift 골든을 넣었을 때의 조립 성능 — 조립 로직의 천장', pipelineId: 'hier-ingest-v12' },
  'hier-v12-claude-haiku':{ title: 'V12 · 하이쿠 lift', purpose: '실 모델 lift → 조립. 프롬프트 v12.1~v12.2 구간', pipelineId: 'hier-ingest-v12' },
  'hier-v12-claude-sonnet':{ title: 'V12 · 소네트 조립', purpose: '조립 콜만 상위 모델로 — 역할 블록 에스컬레이션 효과 측정', pipelineId: 'hier-ingest-v12' },
  'hier-v12-claude-esc':  { title: 'V12 · 모델 에스컬레이션', purpose: '다개념 의심 메모만 소네트 재lift — 실측 기각된 갈래', pipelineId: 'hier-ingest-v12' },
  'hier-v12-claude-gapfix':{ title: 'V12 · 슬롯 격차 보정', purpose: '표제어가 놓친 개념을 슬롯에서 회수해 폐쇄 재지시', pipelineId: 'hier-ingest-v12' },
  'hier-v12-claude-final':{ title: 'V12.4 · 합성 표제어 금지', purpose: '합성 표제어 금지 + 생각 예산 에스컬레이션 — 위계 규칙 v2 직전 기준선', pipelineId: 'hier-ingest-v12' },
  'hier-v12-claude-rule2':{ title: '파렌팅 중간판 · 과적합 구간', purpose: '모든 조사 + 4자 필터 + 핵어 공유 — 골든 끼워맞춤으로 기각(0807), 74~77', pipelineId: 'hier-ingest-v12' },
  'hier-v12-claude-rule3':{ title: '파렌팅 v2 · 최신 자동 경로', purpose: '주어-자리 판정 — 현재 기준선 78 (과적합 밴드보다 높음)', pipelineId: 'hier-ingest-v12' },
  'hier-v12-claude-probe':{ title: '일반화 프로브 · 존중정치학', purpose: '골든 없는 책에서 파렌팅이 헛소리를 만드는지 정성 검사 — 23건 오류성 0건', pipelineId: 'hier-ingest-v12' },
  'hier-v12-claude-sem':  { title: '의미 매칭 · 골든 lift', purpose: '문맥 포함 폐쇄 판정으로 자구 실패분 연결 — 19회차 89 (자동 조립 최고)', pipelineId: 'hier-ingest-v12' },
  'hier-v12-claude-rule4':{ title: '의미 매칭 · 하이쿠 lift', purpose: '하이쿠 재료 + 의미 매칭 — 역할 블록 편차가 지배 병목임을 확정한 구간', pipelineId: 'hier-ingest-v12' },
  'lift-v12-haiku-존중받지 못하는 자들을 위한 정치학': { title: 'lift · 존중정치학', purpose: '일반화 프로브용 lift — BOOK 파라미터 첫 사용', pipelineId: 'hier-ingest-v12' },
  'hier-v12-incr':        { title: 'V12 · 증분 동화', purpose: '메모 한 건씩 도착하는 실사용 경로 — 배치와의 차이 측정', pipelineId: 'hier-ingest-v12' },
  'mapmatch-hier-v12-manual':      { title: '6축 채점 · 골든 입력', purpose: '준서 수기 지도 대조 — 상한선 런의 점수', pipelineId: 'hier-ingest-v12' },
  'mapmatch-hier-v12-claude-haiku':{ title: '6축 채점 · 하이쿠 lift', purpose: '커버·소속·대조·다개념·편성 (위계 축 도입 전)', pipelineId: 'hier-ingest-v12' },
  'mapmatch-hier-v12-claude-sonnet':{ title: '6축 채점 · 소네트 조립', purpose: '조립 모델 상향의 점수 효과 (위계 축 도입 전)', pipelineId: 'hier-ingest-v12' },
  'mapmatch-hier-v12-claude-esc':  { title: '6축 채점 · 모델 에스컬레이션', purpose: '상위 모델 재lift 가 점수를 올렸는지 — 기각 근거', pipelineId: 'hier-ingest-v12' },
  'mapmatch-hier-v12-claude-gapfix':{ title: '6축 채점 · 격차 보정', purpose: '보정 강도별 점수 — 단정형 재지시의 과분화 부작용 포함', pipelineId: 'hier-ingest-v12' },
  'mapmatch-hier-v12-claude-final':{ title: '6축 채점 · V12.4', purpose: '위계 규칙 v2 직전 점수 — 총점 70 · 위계 13', pipelineId: 'hier-ingest-v12' },
  'mapmatch-hier-v12-claude-rule2':{ title: '6축 채점 · 파렌팅 중간판', purpose: '과적합 구간 점수 — 74~77 (기각 근거 보존용)', pipelineId: 'hier-ingest-v12' },
  'mapmatch-hier-v12-claude-rule3':{ title: '6축 채점 · 파렌팅 v2', purpose: '주어-자리 판정 구간 — 총점 78 · 수동 상한선 95', pipelineId: 'hier-ingest-v12' },
  'mapmatch-hier-v12-claude-sem':  { title: '6축 채점 · 의미 매칭(골든)', purpose: '문맥 판정 후 89 — 커버·다개념·대조·편성 100', pipelineId: 'hier-ingest-v12' },
  'mapmatch-hier-v12-claude-rule4':{ title: '6축 채점 · 의미 매칭(하이쿠)', purpose: '71~76 — 역할 블록 뽑기 편차 실측 구간', pipelineId: 'hier-ingest-v12' },
  'mapmatch-hier-v12-incr':        { title: '6축 채점 · 증분 동화', purpose: '증분 트리가 배치와 같은 품질인지', pipelineId: 'hier-ingest-v12' },
  'predict-v9':{ title: '전이 채점 · V9 산출', purpose: 'V9 위키로 새 상황을 설명할 수 있는지', pipelineId: null },
  'predict-v9-v2':        { title: '전이 채점 v2 · V9 산출', purpose: '전이 채점 2차 — 오라클 갭 재측정', pipelineId: null },
  'predict-oracle':       { title: '전이 채점 · 오라클', purpose: '사람이 만든 정답 트리 기준선', pipelineId: null },
  'predict-oracle-v2':    { title: '전이 채점 v2 · 오라클', purpose: '오라클 기준선 2차', pipelineId: null },
  'predict':              { title: '전이 채점 · 초기', purpose: '전이 채점 축 초안', pipelineId: null },
};

// 파일명에서 회차 라벨 도출: 'nudge-v7-13.json' → '13회차', 'connections-qf.json' → '단일'
export function iterationLabel(file) {
  const m = file.replace(/\.(json|md)$/, '').match(/-(\d+)$/);
  return m ? `${m[1]}회차` : '단일';
}

export function seriesTitle(series) {
  return SERIES_META[series]?.title || series;
}
