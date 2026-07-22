export const SERIES_META = {
  'round':                { title: '인제스트 품질 라운드', purpose: '위계·개념 추출을 반복 평가', pipelineId: 'hier-ingest-v5' },
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
  'obsidian-ingest':      { title: '옵시디언 실 발췌 인제스트', purpose: '210 Books 실 발췌 → planIngest 위키 (자동선정)', pipelineId: null },
};

// 파일명에서 회차 라벨 도출: 'nudge-v7-13.json' → '13회차', 'connections-qf.json' → '단일'
export function iterationLabel(file) {
  const m = file.replace(/\.(json|md)$/, '').match(/-(\d+)$/);
  return m ? `${m[1]}회차` : '단일';
}

export function seriesTitle(series) {
  return SERIES_META[series]?.title || series;
}
