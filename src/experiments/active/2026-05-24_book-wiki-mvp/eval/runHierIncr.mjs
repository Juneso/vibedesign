// 비문학 증분 동화 시뮬레이션 (BKT-382) — "메모 한 건 넣으면 그 자리에서 반영"을 재현한다.
//
// 실사용 패턴(준서 실측): 한 독서 세션에서 몇 분에 한 번씩 1건 인제스트. 몰아넣기는 드물다.
// 부트가 6메모를 기다리면 첫 30분간 아무 정리도 못 본다 — 그래서 구간을 나눈다:
//   1~BOOT(6)  매번 일괄 재실행 — 입력이 짧아 4o 2콜이 싸고, 씨앗 단계는 평면이라
//              재실행해도 흔들릴 구조가 없다. BOOT번째가 첫 구조 형성("정리됐어요") 이벤트.
//   BOOT+1~    메모 1건씩 동화(assimilateHierMemo, mini 폐쇄 판정 + 4o 에스컬레이션).
//              매 건 후 성장 단계(잎 키워드 수 5/10/16)를 재평가 — 승격 순간에만
//              일괄 재정리가 돌고, 그것이 두 번째 종류의 정리 이벤트가 된다.
//              ("증분은 임시, 통합 패스에서 정리" 2단 분리는 채택하지 않음 — 준서 결정 2026-07-27)
//
// 합격 기준(이슈): 최종 트리가 일괄과 구조 동등(scripts/incrVsBatch.mjs) · 역량 채점 동등 ·
//                  잔류 0 · 건당 응답 시간(문학 실측 1.7~1.8초와 공통 비교).
//
// 사용: node eval/runHierIncr.mjs "피로사회" [...]
//       BOOT=6 ASSIM_MODEL=gpt-4o-mini ESC=1 node eval/runHierIncr.mjs "책"
// 결과: runs/hier-incr-{N}.json + .md (시리즈 hier-incr)
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { runHierIngest, serializeTree } from './lib/hierEngine.mjs';
import { assimilateHierMemo, leafKeywords, growthStageOf } from './lib/hierAssim.mjs';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';
import { cachedPlanIngest } from './lib/planCache.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);

const N = (s) => String(s || '').normalize('NFC');
const nrm = (s) => N(s).replace(/\s+/g, '').toLowerCase();
const BOOT = Number(process.env.BOOT) || 6;
const ASSIM_MODEL = process.env.ASSIM_MODEL || 'gpt-4o-mini';
const INGEST_MODEL = process.env.INGEST_MODEL || 'gpt-4o';
const ESC = process.env.ESC !== '0';
const KEY = process.env.OPENAI_API_KEY;
const llmMini = openaiNodeTransport({ model: ASSIM_MODEL });
const llm4o = openaiNodeTransport({ model: INGEST_MODEL });

const { planIngest, setLLMTransport } = await import('../lib/llm.js');
setLLMTransport(llm4o);

async function embedFn(text) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || 'embed fail');
  return d.data[0].embedding;
}

// 디스패치 — runHierAuto 와 같은 목차 판정. 목차는 메모와 무관하므로 책당 1회면 된다.
async function dispatch(book) {
  const toc = (book.toc || []).map(String).filter(Boolean);
  if (!toc.length) return { variant: 'v11', why: '목차 없음 → 테제형 기본값' };
  const raw = await llmMini({
    system: '비문학 책의 목차 장 제목 구조만 보고 책이 시간 순(시대·연대·인물 계보·발전 과정)으로 전개되는지 판정한다. tocEvidence 에 근거 장 제목을 그대로 옮겨 적어라. JSON만 출력.',
    user: `책: ${book.title}\n\n[목차]\n${toc.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n출력 JSON: {"chronological":true|false,"confidence":"high|med|low","tocEvidence":["장 제목"]}`,
    temperature: 0,
  });
  let j = {}; try { j = JSON.parse(raw); } catch { /* 기본값 */ }
  const ev = (Array.isArray(j.tocEvidence) ? j.tocEvidence : []).filter((x) => toc.some((t) => nrm(t).includes(nrm(x)) || nrm(x).includes(nrm(t))));
  const chrono = j.chronological === true && j.confidence === 'high' && ev.length > 0;
  return { variant: chrono ? 'v10' : 'v11', why: chrono ? '목차 시간순(high)' : '테제형' };
}

const titles = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
if (!titles.length) { console.error('책 제목을 인자로 주세요'); process.exit(1); }

const ds = JSON.parse(await readFile(resolve(__dir, 'golden/books50-memos.json'), 'utf-8'));
const meta = JSON.parse(await readFile(resolve(__dir, 'golden/obsidian-books-meta.json'), 'utf-8'));
const existing = (await readdir(resolve(__dir, 'runs'))).map((f) => f.match(/^hier-incr-(\d+)\.json$/)).filter(Boolean).map((m) => +m[1]);
let i = existing.length ? Math.max(...existing) : 0;

console.log(`[INCR] 부트/재정리 ${INGEST_MODEL} · 동화 ${ASSIM_MODEL}${ESC ? '(+4o esc)' : ' 단독'} · BOOT=${BOOT}`);

for (const t of titles) {
  const b = ds.books.find((x) => N(x.title) === N(t));
  if (!b) { console.log(`  ⚠ "${t}" — 데이터셋에 없음`); continue; }
  const m = Object.values(meta).find((x) => N(x.title) === N(t)) || {};
  const memos = b.memos.map((mm, k) => ({ id: `ds-${b.id}-${k}`, p: mm.p, text: mm.text, chapter: `p.${mm.p}`, myThought: '' }));
  const book = {
    title: N(b.title), author: m.author || '', category: m.category || '',
    toc: m.toc || [], summary: m.summary || '', aladin: m.aladin || {},
  };

  const t0 = Date.now();
  try {
    const d = await dispatch(book);
    console.log(`  [${N(b.title)}] ${d.variant} (${d.why}) · 메모 ${memos.length}건을 1건씩`);

    let nodes = null, rootId = null, lastStageRank = -1, sinceRebuild = 0;
    const log = []; const events = [];
    const incMs = [], batchMs = [];
    let attached = 0, created = 0, esc = 0, structEvents = 0;

    // 일괄 (재)정리 — 지금까지의 메모 전부로 엔진을 다시 돌린다. planIngest 는 부분집합별 캐시.
    const rebuild = async (upto, why) => {
      const part = memos.slice(0, upto);
      const r = await runHierIngest({
        book, memos: part, llm: llmMini, embedFn, variant: d.variant,
        planIngestFn: cachedPlanIngest(planIngest, { book, memos: part, model: INGEST_MODEL }),
        onProgress: () => {},
      });
      nodes = r.nodes; rootId = r.rootId;
      sinceRebuild = 0;
      const kw = leafKeywords(nodes, rootId).length;
      lastStageRank = growthStageOf(kw).rank;
      log.push(`[incr] 메모 ${upto}건째 — 일괄 재정리(${why}) → 잎 키워드 ${kw} · 단계 ${growthStageOf(kw).name}`);
      return r;
    };

    for (let k = 1; k <= memos.length; k++) {
      const tm = Date.now();
      if (k <= BOOT) {
        // 초반 구간 — 매번 일괄. 씨앗은 평면이라 흔들릴 구조가 없고, 격차 자체가 없다.
        await rebuild(k, k === BOOT ? '부트 완료 · 첫 구조' : '초반 일괄');
        batchMs.push(Date.now() - tm);
        if (k === BOOT) { events.push({ at: k, type: 'structure', why: '첫 구조 형성' }); structEvents++; }
      } else {
        const res = await assimilateHierMemo({
          nodes, rootId, book, memo: memos[k - 1],
          llm: llmMini, llmEsc: ESC ? llm4o : null, embedFn,
        });
        incMs.push(Date.now() - tm);
        res.action === 'attach' ? attached++ : created++;
        if (res.escalated) esc++;
        log.push(`[incr] ${memos[k - 1].id} → ${res.action} "${res.keyword}"${res.escalated ? ' (4o)' : ''} conf=${res.confidence}`);
        // 재정리 트리거 두 가지 — 승격 순간에만 구조가 자란다 = 두 번째 종류의 정리 이벤트.
        // ① 성장 단계 승격(잎 키워드 5/10/16 문턱 통과)
        // ② 키워드 과부하 — 한 키워드가 SPLIT_AT 문장을 넘으면 덤핑 버킷이 되고 있다는 뜻.
        //    run 1 실측: mini 가 전부 attach 로 기울면(new 0) 잎이 안 늘어 승격이 영원히
        //    안 오고, "성과사회" 가 16문장을 삼켰다. 과부하가 그 악순환의 탈출구다 —
        //    재정리의 planIngest 가 갇힌 개념(우울증·자기 착취)을 키워드로 승격시킨다.
        // ③ 재료 볼륨 — 마지막 정리 후 동화가 STALE_AT 건 쌓이면 재정리.
        //    run 2 실측: 11건째 정리 후 13건이 전부 append 로만 붙어 구조가 새싹 형태
        //    (core 1개)에 동결됐다(일괄 대비 자카드 10.4% vs 일괄끼리 39~66%). 동화는
        //    키워드를 일괄만큼 만들지 않아(new 1/18) 잎 수 기반 승격만으로는 영영 안 온다.
        //    볼륨 트리거는 정리 시점마다 증분≈일괄을 구조적으로 보장한다(그 시점 트리가 곧 일괄).
        const SPLIT_AT = 6; // 일괄 파이프라인의 과부하 분할 문턱과 같은 값
        const STALE_AT = 8;
        sinceRebuild++;
        const rank = growthStageOf(leafKeywords(nodes, rootId).length).rank;
        const overload = res.action === 'attach' && res.hostSents > SPLIT_AT;
        const stale = sinceRebuild >= STALE_AT;
        if (rank > lastStageRank || overload || stale) {
          const why = overload ? `키워드 "${res.keyword}" 과부하(${res.hostSents}문장)` : rank > lastStageRank ? `단계 승격 ${rank}` : `동화 ${sinceRebuild}건 누적`;
          const tb = Date.now();
          await rebuild(k, why);
          batchMs.push(Date.now() - tb);
          events.push({ at: k, type: 'structure', why });
          structEvents++;
        }
      }
      process.stdout.write(`      ${k}/${memos.length} (attach ${attached} · new ${created} · esc ${esc} · 정리 ${structEvents})\r`);
    }

    const tree = serializeTree(nodes, rootId);
    const sec = Math.round((Date.now() - t0) / 1000);
    const sents = tree.nodes.filter((n) => n.kind === 'sentence');
    const C = tree.nodes.filter((n) => n.kind === 'concept');
    const covered = new Set(sents.map((n) => n.memoId)).size;
    const rootSents = sents.filter((n) => n.parentId === tree.rootId).length;
    const avgInc = incMs.length ? Math.round(incMs.reduce((a, c) => a + c, 0) / incMs.length) : 0;
    const avgBatch = batchMs.length ? Math.round(batchMs.reduce((a, c) => a + c, 0) / batchMs.length) : 0;

    const base = resolve(__dir, `runs/hier-incr-${++i}`);
    await writeFile(`${base}.json`, JSON.stringify({
      label: N(b.title), runAt: new Date().toISOString(),
      kind: 'hier-incr', variant: d.variant, dispatch: d.why,
      hierModel: ASSIM_MODEL, ingestModel: `${INGEST_MODEL}(일괄${batchMs.length}회) + ${ASSIM_MODEL}(동화${incMs.length}건${ESC ? '+esc' : ''})`,
      nMemos: memos.length,
      counts: {
        concepts: C.length, sentences: sents.length, coveredMemos: covered, rootSentences: rootSents,
        incAttach: attached, incNew: created, escalations: esc,
        structureEvents: structEvents, avgIncMs: avgInc, avgBatchMs: avgBatch,
      },
      events, sec, tree, log,
    }, null, 2) + '\n', 'utf-8');

    let md = `# ${N(b.title)} — 비문학 증분 동화 (BOOT ${BOOT} + 동화 ${incMs.length}건)\n\n`;
    md += `- 정리 이벤트 ${structEvents}회: ${events.map((e) => `${e.at}건째(${e.why})`).join(' · ')}\n`;
    md += `- 동화 판정: attach ${attached} · new ${created} · 4o 에스컬레이션 ${esc}/${incMs.length}\n`;
    md += `- 응답 시간: 동화 평균 ${avgInc}ms/건 (문학 실측 1.7~1.8초 대비) · 일괄 평균 ${Math.round(avgBatch / 1000)}초/회\n`;
    md += `- 개념 ${C.length} · 문장 ${sents.length} · 잔류 ${rootSents} · 커버 ${covered}/${memos.length} · 총 ${sec}초\n\n## 최종 트리\n\n`;
    const render = (id, depth) => {
      for (const c of tree.nodes.filter((n) => n.parentId === id && n.kind === 'concept')) {
        md += `${'  '.repeat(depth)}- **${c.title}**${c.relation ? ` [${c.relation}]` : ''}\n`;
        render(c.id, depth + 1);
      }
      for (const s of tree.nodes.filter((n) => n.parentId === id && n.kind === 'sentence').sort((a, x) => (a.sources[0] || 0) - (x.sources[0] || 0))) {
        md += `${'  '.repeat(depth)}- p${s.sources[0] ?? '?'} ${String(s.title).slice(0, 80)}\n`;
      }
    };
    render(tree.rootId, 0);
    await writeFile(`${base}.md`, md, 'utf-8');
    console.log(`\n      → run ${i}: 개념 ${C.length} · 잔류 ${rootSents} · 커버 ${covered}/${memos.length} · 동화 ${avgInc}ms/건 · 정리 ${structEvents}회 (${sec}초)`);
  } catch (e) {
    console.log(`\n      ✗ 실패: ${e.message}`);
  }
}
console.log('\n✓ 완료');
