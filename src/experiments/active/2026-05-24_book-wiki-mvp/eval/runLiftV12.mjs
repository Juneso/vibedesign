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
