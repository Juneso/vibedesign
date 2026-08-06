// v12 lift 일괄 러너 (BKT-342 4단계) — 피로사회 24메모를 실 모델로 lift 한다.
// claude -p transport(구독 요금, API 0원)가 기본. 결과는 골든과 같은 스키마로 저장돼
// 조립 러너·5축 채점·모델 A/B 가 골든과 동일하게 소비한다.
//
// 사용: node runLiftV12.mjs [라벨]   (MODEL=claude-haiku-4-5-20251001 기본)

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildLiftPrompt, normalizeLift, LIFT_PROMPT_VERSION } from './lib/liftV12.mjs';
import { claudeCliTransport } from './lib/claudeCliTransport.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.MODEL || 'claude-haiku-4-5-20251001';
const label = process.argv[2] || '1';

const ds = JSON.parse(await readFile(resolve(__dir, 'golden/books50-memos.json'), 'utf-8'));
const book = ds.books.find((b) => b.title.normalize('NFC') === '피로사회');

const usages = [];
const llm = claudeCliTransport({ model: MODEL, onUsage: (u) => usages.push(u) });

// RESUME=runs/….json — 기존 런에서 성공한 메모는 건너뛰고 실패분만 다시 lift 한다
// (CLI 동시 실행 충돌로 후반 16메모가 죽은 실측의 복구 경로)
const prev = new Map();
if (process.env.RESUME) {
  const pr = JSON.parse(await readFile(resolve(__dir, process.env.RESUME), 'utf-8'));
  for (const l of pr.lifts) if (l.claims.length) prev.set(l.memoId, l);
  console.log(`  이어받기: ${prev.size}메모 재사용`);
}

const lifts = [];
let warnTotal = 0;
for (let k = 0; k < book.memos.length; k++) {
  const memo = book.memos[k];
  const memoId = `ds-b50-피로사회-${k}`;
  // MEMOS=11,18 — 표적 메모만 lift (프롬프트 튜닝 반복을 24콜이 아니라 2~3콜로)
  if (process.env.MEMOS && !process.env.MEMOS.split(',').includes(String(k))) continue;
  if (prev.has(memoId)) { lifts.push(prev.get(memoId)); continue; }
  const t0 = Date.now();
  let raw, parsed = null;
  try {
    raw = await llm(buildLiftPrompt({ book: { title: '피로사회', author: book.author }, memo }));
    parsed = JSON.parse(raw);
  } catch (e) {
    console.log(`  ✗ [${k}] p.${memo.p} 실패: ${e.message.slice(0, 120)}`);
  }
  const { lift, warnings } = normalizeLift(parsed || { claims: [] }, { memoId });
  warnTotal += warnings.length;
  lifts.push({ memoId, p: memo.p, claims: lift.claims, promptVersion: LIFT_PROMPT_VERSION, warnings });
  console.log(`  · [${k}] p.${memo.p} → 주장 ${lift.claims.length}개${warnings.length ? ` ⚠${warnings.length}` : ''} (${Math.round((Date.now() - t0) / 1000)}초)`);
}

// (a) 다개념 에스컬레이션 — 하이쿠 1차 lift 뒤, 다개념 의심 메모만 상위 모델로 재lift.
// 의심 신호: 주장 3개 이상(과분할이거나 진짜 다개념) 또는 비-high confidence 존재.
// "싼 모델 기본 + 어려운 케이스만 비싼 모델" 프로덕션 비용 구조의 개발판 (MODEL_ESC=claude-sonnet-5)
if (process.env.MODEL_ESC) {
  const esc = claudeCliTransport({ model: process.env.MODEL_ESC, onUsage: (u) => usages.push(u) });
  for (const l of lifts) {
    const suspect = l.claims.length >= 3 || l.claims.some((c) => c.confidence !== 'high');
    if (!suspect) continue;
    try {
      const memo = book.memos[Number(l.memoId.split('-').pop())];
      const raw = await esc(buildLiftPrompt({ book: { title: '피로사회', author: book.author }, memo }));
      const { lift, warnings } = normalizeLift(JSON.parse(raw), { memoId: l.memoId });
      if (lift.claims.length) { l.claims = lift.claims; l.escalated = process.env.MODEL_ESC; l.warnings = warnings; }
      console.log(`  ↑ ${l.memoId} 에스컬레이션 → 주장 ${lift.claims.length}개`);
    } catch (e) { console.log(`  ↑ ${l.memoId} 에스컬레이션 실패(1차 유지): ${e.message.slice(0, 60)}`); }
  }
}

const sum = (f) => usages.reduce((s, u) => s + (f(u) || 0), 0);
const out = {
  label: `lift-v12-${MODEL.includes('haiku') ? 'haiku' : MODEL}-${label}`,
  runAt: new Date().toISOString(), kind: 'lift-v12', model: MODEL,
  promptVersion: LIFT_PROMPT_VERSION, bookId: 'b50-피로사회', nMemos: lifts.length,
  nClaims: lifts.reduce((s, l) => s + l.claims.length, 0), warnTotal,
  usage: { calls: usages.length, ms: sum((u) => u.ms), inputTokens: sum((u) => u.inputTokens), outputTokens: sum((u) => u.outputTokens), costUsd: Math.round(sum((u) => u.costUsd) * 1000) / 1000 },
  lifts,
};
await writeFile(resolve(__dir, `runs/${out.label}.json`), JSON.stringify(out, null, 2));
console.log(`\n✓ ${out.label} — 주장 ${out.nClaims} · 경고 ${warnTotal} · ${Math.round(out.usage.ms / 1000)}초 · $${out.usage.costUsd}(구독 내)`);
