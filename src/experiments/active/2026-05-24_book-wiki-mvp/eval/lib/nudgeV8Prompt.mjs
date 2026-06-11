// V8 넛지 생성 공용 모듈 — 흐르는 메시지 + 해석 방향 3분기 선지 (DES-301/304)
//
// 단일 진실: 이 프롬프트를 proto 러너 / 캘리브레이션 셋 생성 / 운영 eval이 공유한다.
// 설계 근거: 라벨링 16건 피드백 (DES-304 코멘트, 2026-06-11)
//   - 선지 = 정답 후보가 아니라 "저장한 사람이 가졌을 법한 서로 다른 생각의 방향 3개"
//   - 질문은 슬롯이 아니라 풀이에서 자연스럽게 이어지는 마지막 한 문장
//   - 퀴즈/요약 나열/같은 결 2개/단순 긍정·부정 = 실패

export const V8_GUIDE_MESSAGE = `1. **message (흐르는 2~3문장)**: 풀이와 질문이 한 호흡으로 자연스럽게 이어지는 글.
   - 슬롯 형식("요약. 질문?")이 아니다. 앞 문장이 뒷 문장을 부르는, 친구가 보낸 메시지 같은 흐름.
   - 시작: 저장한 문장을 더 쉬운 말로 풀어주기. 유저가 읽으면 "내가 왜 밑줄 쳤는지 이 앱이 안다"고 느껴야 한다.
     유저가 적은 생각이 있으면 그 관점을 자연스럽게 녹여서 (그대로 복창 금지).
   - 끝: 그 흐름에서 자연스럽게 나오는 질문. **질문 문구는 앞 문장에 따라 매번 달라진다** —
     "어느 쪽이 더 가까웠어?" / "너는 ~라서 적어둔 거야, 아니면 ~?" / "뭐가 제일 걸렸어?" / "너라면 어느 쪽이야?" 등.
     고정 문구("이 문장이 너한테는 어떤 의미였어?") 반복 금지.
   - **질문은 메시지 전체에서 마지막 한 문장, 단 하나만.** 도입을 질문으로 시작하거나 질문을 연달아 쓰면 실패.
   - 그 마지막 질문에 choices 3개가 그대로 답이 되어야 한다. 경험을 묻고("~한 적 있어?") 해석을 선지로 주면 실패.
   - 책 내용 확인 퀴즈 금지. 유저의 직업·일상으로 끌고 가지 말 것. 문장의 논점 밖 금지.
   - 차분한 구어체 ("~라는 얘기야", "~라는 거지"). 과장·자극 금지 ("무섭다", "서늘하다", "충격적" X).
   - 금지어: 흥미, 인상, 탐구, ~해보면 좋겠어.`;

export const V8_GUIDE_CHOICES = `2. **choices (선지 3개 = 해석 방향 3분기)**: 이 문장을 저장한 사람이 가졌을 법한 **서로 다른 생각의 방향** 3개.
   - 정답이 없어야 한다. 책 내용 요약·사실 확인이 아니라 "내 생각이 뭐였을지"의 후보다. 고르는 행위가 자기표현이 되도록.
   - **3개의 방향이 실제로 갈라져야 한다.** 두 개가 같은 결이면 실패. (방향 분기의 예: 수용 vs 해방 vs 초월 / 비판 vs 옹호 vs 재정의)
   - 단순 긍정/부정/중립 금지 ("도움이 된다 / 안 된다 / 상황에 따라" X). 각 선지는 구체적 관점을 담은 짧은 문장.
   - 각 10~25자. 칩 버튼에 들어갈 길이.
   - 아래 예시는 **구조만 참고하라. 표현·단어를 복사하면 실패** (다른 문장에는 그 문장만의 분기가 있다):
     예 (무의미를 사랑하라는 문장): "삶의 모든 무의미를 인정하고 돌보는 것" / "의미에의 집착에서 벗어나는 것" / "의미를 극복했을 때 만나는 더 큰 의미"
   - 나쁜 예: "줄서기 규범 / 기부의 의미 / 교육의 가치" (책 퀴즈), "기술이 혁신한다 / 전통이 중요하다 / 균형이 필요하다" (당연한 말 나열)`;

export const V8_OUTPUT_HINT = `[출력 형식 — 정확히 이 모양의 JSON만]
{"message": "풀이와 질문이 자연스럽게 이어지는 2~3문장", "choices": ["해석 방향1", "해석 방향2", "해석 방향3"]}`;

export function v8Header({ book }) {
  return `당신은 독서 기록 앱의 넛지 작성자다. 유저가 책에서 직접 옮겨 적은 문장을 다시 마주치게 해주는 알림을 만든다.
유저는 "${book.title}" (${book.author}) 를 읽으며 아래 문장을 저장했다.`;
}

export function v8MemoBlock({ memo }) {
  return `[저장한 문장]
"${memo.quote}"
${memo.myThought ? `\n[유저가 함께 적은 생각]\n"${memo.myThought}"` : ''}`;
}

export function v8Prompt({ book, memo }) {
  return `
${v8Header({ book })}

${v8MemoBlock({ memo })}

[만들 것 — 2가지]

${V8_GUIDE_MESSAGE}

${V8_GUIDE_CHOICES}

${V8_OUTPUT_HINT}
  `.trim();
}

// ─── 생성 + 방어 파싱 + 분기 자가 검수 ───────────────────────────
const parseOut = (raw) => {
  let out; try { out = JSON.parse(raw); } catch { return null; }
  if (out && !out.message && out.properties?.message) out = out.properties; // 스키마 따라그림 방어
  return out?.message && Array.isArray(out?.choices) && out.choices.length === 3 ? out : null;
};

export async function checkForkDistinct(transport, choices, { model } = {}) {
  const raw = await transport({
    temperature: 0, model,
    user: `세 선택지가 서로 다른 생각의 방향인지 검사하라. 두 개가 사실상 같은 결(같은 입장의 다른 표현)이면 distinct=false.\n1. ${choices[0]}\n2. ${choices[1]}\n3. ${choices[2]}\nJSON만: {"distinct": true|false, "pair": "겹치는 쌍 (예: 1-3)", "why": "한 문장"}`,
  });
  try { return JSON.parse(raw); } catch { return { distinct: true }; }
}

// promptText 를 직접 주면 그걸 쓰고(변형 생성용), 없으면 표준 v8Prompt 사용.
// formGuard: 질문이 마지막 한 문장·단 하나인지 결정적 검사 → 위반 시 재생성 (표준 생성에만 적용)
export async function generateV8({ transport, book, memo, promptText, model, forkCheck = true, formGuard = forkCheck }) {
  const prompt = promptText || v8Prompt({ book, memo });
  let out = null;
  for (let attempt = 0; attempt < 3 && !out; attempt++) {
    out = parseOut(await transport({ user: prompt, temperature: 0.4 + attempt * 0.1, model }));
  }
  if (!out) return null;
  if (formGuard) {
    for (let attempt = 0; attempt < 2 && (out.message.match(/\?/g) || []).length !== 1; attempt++) {
      const retry = parseOut(await transport({
        temperature: 0.5 + attempt * 0.15, model,
        user: prompt + `\n\n[재시도 사유]\n직전 시도의 질문 개수가 1개가 아니었다: "${out.message.slice(0, 80)}...". 질문은 메시지의 마지막 한 문장, 단 하나만. 중간 질문 없이 다시 써라.`,
      }));
      if (retry) out = retry;
    }
  }
  if (forkCheck) {
    const check = await checkForkDistinct(transport, out.choices, { model });
    if (check.distinct === false) {
      const retry = parseOut(await transport({
        temperature: 0.6, model,
        user: prompt + `\n\n[재시도 사유]\n직전 시도에서 선택지 ${check.pair}가 같은 결이었다 (${check.why}). 세 방향이 명확히 갈라지게 다시 만들어라. message는 더 좋게 다듬어도 된다.`,
      }));
      if (retry) { retry._regen = check; out = retry; }
    }
  }
  return out;
}
