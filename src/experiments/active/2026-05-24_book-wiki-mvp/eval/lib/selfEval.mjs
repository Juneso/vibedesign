// 자기평가 프롬프트. RUBRIC.md 와 함께 LLM이 자기 출력 채점.
// 출력 스키마: { axes:[{key, name, score(0|1|2), reasoning}], pass:bool, suspect:bool, suspectReason }

const AXES = {
  A: [
    { key: 'A1', name: '출처 강제 (Source-binding)' },
    { key: 'A2', name: '챕터/목차 매핑' },
    { key: 'A3', name: '키 개념 추출의 비자명성 (Non-triviality)' },
  ],
  B: [
    { key: 'B1', name: '3축 매핑 충실도' },
    { key: 'B2', name: '출처 추적성' },
  ],
  C: [
    { key: 'C1', name: '근거 강제 (Grounding)' },
    { key: 'C2', name: '3종 유형 적합성' },
    { key: 'C3', name: 'derivedKeywords 활용 (개인화)' },
  ],
};

export const SELF_EVAL_SCHEMA = {
  type: 'object',
  required: ['axes', 'pass', 'suspect'],
  properties: {
    axes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'score', 'reasoning'],
        properties: {
          key: { type: 'string' },
          score: { enum: [0, 1, 2] },
          reasoning: { type: 'string' },
        },
      },
    },
    pass: { type: 'boolean' },
    suspect: { type: 'boolean' },
    suspectReason: { type: 'string' },
  },
};

export function selfEvalPrompt({ pipeline, rubric, input, output }) {
  const axes = AXES[pipeline];
  if (!axes) throw new Error('unknown pipeline: ' + pipeline);
  return `
당신은 본인이 방금 생성한 출력에 대해 RUBRIC.md 기준으로 점수를 매깁니다.
편향 회피: 본인 출력이라고 점수를 후하게 주지 말 것. 의심되면 suspect=true.

[루브릭 발췌]
${rubric}

[파이프라인]
${pipeline} — 평가할 축: ${axes.map(a => `${a.key} ${a.name}`).join(' / ')}

[입력]
\`\`\`json
${JSON.stringify(input, null, 2).slice(0, 4000)}
\`\`\`

[출력 — 채점 대상]
\`\`\`json
${JSON.stringify(output, null, 2).slice(0, 6000)}
\`\`\`

[작업]
1. 각 축마다 점수 0/1/2 + reasoning(1~2문장, 구체적 근거).
2. 합격 = 모든 축이 1 이상 AND 0점 축 없음. pass 에 boolean.
3. 자신의 판단이 흔들리거나 사용자 검토가 필요해 보이면 suspect=true, suspectReason 에 한 문장.

스키마:
${JSON.stringify(SELF_EVAL_SCHEMA)}

JSON만 출력.
  `.trim();
}

export function aggregate(results) {
  const total = results.length;
  const passed = results.filter(r => r.eval?.pass).length;
  const suspects = results.filter(r => r.eval?.suspect).length;
  const rate = total ? Math.round((passed / total) * 100) : 0;
  return { total, passed, suspects, rate };
}

export { AXES };
