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
  'hier-stability-v5':    { title: '위계 셔플 안정성 — V5 베이스라인', purpose: '메모 순서를 바꿔도 트리가 재현되는지 (LLM 재량 위계)', pipelineId: 'hier-ingest-v5' },
  'hier-stability-v6':    { title: '위계 셔플 안정성 — V6 교차검증', purpose: '치환 테스트 + 양방향 검증으로 가짜 위계 걸러내기', pipelineId: 'hier-ingest-v5' },
  'hier-stability-v7':    { title: '위계 셔플 안정성 — V7 테마 주역화', purpose: '책 인용 anchor + critic 승인 테마가 재현되는지', pipelineId: 'hier-ingest-v5' },
};

// 파일명에서 회차 라벨 도출: 'nudge-v7-13.json' → '13회차', 'connections-qf.json' → '단일'
export function iterationLabel(file) {
  const m = file.replace(/\.(json|md)$/, '').match(/-(\d+)$/);
  return m ? `${m[1]}회차` : '단일';
}

export function seriesTitle(series) {
  return SERIES_META[series]?.title || series;
}
