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
  'literature-v1':        { title: '문학 V1 · 모티프 축', purpose: '소설 전용 파이프라인 — 모티프 1차 축 + 인물 조건부 승격, 문장은 페이지순(서사 진행)', pipelineId: 'literature-v1' },
  'predict-v9':           { title: '전이 채점 · V9 산출', purpose: 'V9 위키로 새 상황을 설명할 수 있는지', pipelineId: null },
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
