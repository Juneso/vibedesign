// Step 1 — 메모별 "답하는 질문" 후보 추출 (question-first 연결의 토대).
// 각 수집 문장이 '혼자서' 답하는 질문을 여러 갈래(다른 고도/각도)로 뽑는다.
// 짝짓기 없이 독립적으로 → 나중에 질문이 겹치는 문장끼리 연결(억지 제거).
// 산출물 형태는 ingest가 낼 것과 동일(메모마다 questions[]) → 검증되면 INGEST_SCHEMA로 승격.
// 결과: golden/memo-questions.json
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadUnits } from './lib/units.mjs';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);
const call = openaiNodeTransport({ model: 'gpt-4o' });

const { units, perBook } = await loadUnits(__dir);
console.log(`units ${units.length} / 책 ${Object.keys(perBook).length}권`);

const digest = units.map(u =>
  `[${u.id}] 《${u.book}》(${u.concept})\n    원문: ${u.quote || '(없음)'}\n    논지: ${u.thesis}`
).join('\n');

const system = `너는 독서 메모를 분석해 "이 문장이 답하고 있는 질문"을 두 고도로 뽑는다.

핵심 원칙:
- 질문은 **이 문장 하나만 보고** 도출한다. 다른 문장과 엮으려 하지 마라(짝짓기 금지). 이 문장이 이미 답하고 있는 질문을 발견하는 것이다.
- 이 문장이 **실제로 답이 되는** 질문만. 답이 하나로 정해지지 않아 입장이 갈리는 형태로. "X란 무엇인가" 정의 물음 금지.

두 고도로 나눠서 뽑아라:
- **concrete (구체, 1~2개)**: 이 문장의 소재에 밀착한 질문. 책 고유의 표현을 써도 된다. (표시·구체성용)
- **universal (보편, 2~3개)**: **다른 어떤 책에도 그대로 쓸 수 있는** 질문. 이 책·이 소재의 고유명사와 특수어휘를 전부 제거하고, 인간 보편의 물음으로 올려라. (책 간 매칭용 — 가장 중요)
  - 반드시 이 문장이 실제로 답하는 것이어야 한다(억지 일반화 금지).
  - 고유명사·책 특정 소재어("시장","디자인","임제" 등)가 남아 있으면 실패. 한 단계 위 개념으로 치환하라.
  - 예: 문장 "시장은 재화 가치를 평가하지 않고 쌍방이 판단" → concrete "시장은 재화의 가치를 어떻게 정하는가" / universal "어떤 것의 가치는 무엇이 정하는가?"
  - 예: 문장 "임제는 외부 권위 말고 스스로 잠재력을" → concrete "임제가 말하는 자기 실현은?" / universal "나를 이끄는 힘은 내 안에 있는가, 밖에 있는가?"

각 질문 짧은 한 문장.`;

const user = `다음 수집 문장들 각각에 대해 concrete/universal 질문을 뽑아라.

${digest}

JSON:
{ "items": [ { "id": <unit id>, "concrete": ["..."], "universal": ["..."] } ] }`;

const raw = await call({ system, user, temperature: 0.2 });
const parsed = JSON.parse(raw);
const byId = new Map(parsed.items.map(it => [it.id, it]));

const out = units.map(u => {
  const it = byId.get(u.id) || {};
  return { ...u, concrete: it.concrete || [], universal: it.universal || [] };
});
const missing = out.filter(u => !u.universal.length).length;
await writeFile(resolve(__dir, 'golden/memo-questions.json'), JSON.stringify({ units: out }, null, 2), 'utf-8');
const tU = out.reduce((n, u) => n + u.universal.length, 0);
const tC = out.reduce((n, u) => n + u.concrete.length, 0);
console.log(`✓ ${out.length} units, universal ${tU} / concrete ${tC}, universal 누락 ${missing}`);
console.log('\n샘플:');
for (const u of out.slice(0, 4)) {
  console.log(`\n《${u.book}》 "${u.thesis.slice(0, 36)}..."`);
  u.concrete.forEach(q => console.log(`  [구체] ${q}`));
  u.universal.forEach(q => console.log(`  [보편] ${q}`));
}
