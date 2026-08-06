// v12 lift 일괄 러너 (BKT-342 4단계) — 피로사회 24메모를 실 모델로 lift 한다.
// claude -p transport(구독 요금, API 0원)가 기본. 결과는 골든과 같은 스키마로 저장돼
// 조립 러너·5축 채점·모델 A/B 가 골든과 동일하게 소비한다.
//
// 사용: node runLiftV12.mjs [라벨]   (MODEL=claude-haiku-4-5-20251001 기본)

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildLiftPrompt, normalizeLift, slotHeadwordGaps, LIFT_PROMPT_VERSION } from './lib/liftV12.mjs';
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
  // JSON 이탈은 transport 재시도(exit 실패만 흡수) 밖이라 여기서 1회 재콜한다 —
  // 실측: lift-9 에서 m17 이 파싱 실패로 주장 0개가 되어 커버·위계를 깎았다
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    try {
      raw = await llm(buildLiftPrompt({ book: { title: '피로사회', author: book.author }, memo }));
      parsed = JSON.parse(raw);
    } catch (e) {
      console.log(`  ✗ [${k}] p.${memo.p} ${attempt ? '실패(재시도 소진)' : '실패 — 재시도'}: ${e.message.slice(0, 120)}`);
    }
  }
  const { lift, warnings } = normalizeLift(parsed || { claims: [] }, { memoId });
  warnTotal += warnings.length;
  lifts.push({ memoId, p: memo.p, claims: lift.claims, promptVersion: LIFT_PROMPT_VERSION, warnings });
  console.log(`  · [${k}] p.${memo.p} → 주장 ${lift.claims.length}개${warnings.length ? ` ⚠${warnings.length}` : ''} (${Math.round((Date.now() - t0) / 1000)}초)`);
}

// GAPFIX=1 — 슬롯-표제어 격차 보정 (하네스 다개념 보정, 0806 준서 제안). 전역 2패스:
// 책 전체 표제어 합집합에 없는 개념이 어느 메모의 쌍·대상 슬롯에 자구로 남아 있으면,
// 그 메모만 개념 목록을 명시해 같은 모델로 재lift — 열린 판정을 폐쇄 판정으로 바꾼다.
if (process.env.GAPFIX === '1') {
  const globalHeads = () => lifts.flatMap((l) => l.claims.map((c) => c.headword));
  for (const l of lifts) {
    if (!l.claims.length) continue;
    const memo = book.memos[Number(l.memoId.split('-').pop())];
    const gaps = slotHeadwordGaps(l, memo.text, globalHeads().filter((h) => !l.claims.some((c) => c.headword === h)));
    if (!gaps.length) continue;
    try {
      const p2 = buildLiftPrompt({ book: { title: '피로사회', author: book.author }, memo });
      // 단정형 재지시 — 격차 검출이 문단 자구 실재를 이미 확인했으므로 거짓이 아니다.
      // "경우에만" 소프트 조건은 하이쿠가 보수적으로 무시했다(실측: 무효 7/9건).
      p2.user += `\n\n확인된 사실: 이 문단은 다음 개념을 각각 별개로 다루고 있다 — ${gaps.join(', ')}. 각 개념을 주어·표제어로 하는 주장을 반드시 포함하라.`;
      const r2 = normalizeLift(JSON.parse(await llm(p2)), { memoId: l.memoId });
      const gained = gaps.filter((g) => r2.lift.claims.some((c) => c.headword.includes(g) || g.includes(c.headword)));
      if (r2.lift.claims.length && gained.length) { l.claims = r2.lift.claims; l.warnings = r2.warnings; l.gapFixed = { gaps, gained }; }
      console.log(`  ⊕ ${l.memoId} 격차 [${gaps.join(',')}] → ${gained?.length ? `보정 +${gained.join(',')}` : '무효(1차 유지)'}`);
    } catch (e) { console.log(`  ⊕ ${l.memoId} 격차 보정 실패(1차 유지): ${e.message.slice(0, 50)}`); }
  }
}

// THINK_ESC — 에스컬레이션 축은 모델이 아니라 생각 예산 (소네트 기각 후 확정).
// 트리거 = 합성 표제어 경고("슬픔과 우울증"류) — 뭉갬의 리트머스. 그 메모만 같은
// 하이쿠를 thinking 8k 로 재lift (21초 → 118초, 실측: 합성 소멸·슬픔 분리).
if (process.env.THINK_ESC === '1') {
  const esc = claudeCliTransport({ model: MODEL, maxThinkingTokens: 8000, onUsage: (u) => usages.push(u) });
  for (const l of lifts) {
    if (!l.warnings?.some((w) => w.includes('합성 의심'))) continue;
    try {
      const memo = book.memos[Number(l.memoId.split('-').pop())];
      const r2 = normalizeLift(JSON.parse(await esc(buildLiftPrompt({ book: { title: '피로사회', author: book.author }, memo }))), { memoId: l.memoId });
      if (r2.lift.claims.length && r2.warnings.length < l.warnings.length) { l.claims = r2.lift.claims; l.warnings = r2.warnings; l.thinkEsc = true; }
      console.log(`  ↑ ${l.memoId} thinking 재lift → 경고 ${r2.warnings.length}`);
    } catch (e) { console.log(`  ↑ ${l.memoId} thinking 재lift 실패(1차 유지)`); }
  }
}

// SAMPLE2 — 다개념 메모 2샘플 합집합 (0806 잔여 대책, m18 나르시스 분산 흡수).
// 하이쿠는 같은 프롬프트·같은 메모에서 런마다 다른 개념을 잃는다(나르시스 8회 중 1회 출현).
// 프롬프트 조이기의 한계가 실측으로 확정됐으므로 표본을 늘린다: 다개념 의심 메모(주장 3개
// 이상 또는 비-high confidence — MODEL_ESC 와 같은 신호)만 같은 모델로 1회 더 lift 하고,
// 1차 표제어에 없으면서 문단 자구에 실재하는 표제어의 주장만 합친다 — 자구 조건이
// 추상어 잡음 유입을 막고, 기존 주장은 건드리지 않아 1차 품질이 회귀하지 않는다.
if (process.env.SAMPLE2 === '1') {
  const nrmS = (s) => String(s || '').normalize('NFC').replace(/\s+/g, '').toLowerCase();
  for (const l of lifts) {
    const suspect = l.claims.length >= 3 || l.claims.some((c) => c.confidence !== 'high');
    if (!suspect || !l.claims.length) continue;
    try {
      const memo = book.memos[Number(l.memoId.split('-').pop())];
      const r2 = normalizeLift(JSON.parse(await llm(buildLiftPrompt({ book: { title: '피로사회', author: book.author }, memo }))), { memoId: l.memoId });
      const heads = l.claims.map((c) => nrmS(c.headword));
      const text = nrmS(memo.text);
      const fresh = r2.lift.claims.filter((c) => {
        const h = nrmS(c.headword);
        return h.length >= 2 && text.includes(h)
          && !heads.some((x) => x.includes(h) || h.includes(x));
      });
      if (fresh.length) {
        fresh.forEach((c, i) => { c.id = `s2-${i + 1}`; });
        l.claims.push(...fresh);
        l.sample2 = fresh.map((c) => c.headword);
      }
      console.log(`  ⊎ ${l.memoId} 2샘플 → ${fresh.length ? `합집합 +${fresh.map((c) => c.headword).join(',')}` : '신규 없음'}`);
    } catch (e) { console.log(`  ⊎ ${l.memoId} 2샘플 실패(1차 유지): ${e.message.slice(0, 50)}`); }
  }
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
