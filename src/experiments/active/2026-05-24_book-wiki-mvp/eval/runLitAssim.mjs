// literature-v1 동화 모드 시뮬레이션 — 증분 수집 시나리오 재현 (BKT-381)
//
// 실서비스에서 유저는 메모를 하나씩 쌓는다. 이 러너는 그 흐름을 재현한다:
//   부트스트랩: 첫 BOOT(기본 6)개 메모 → 기존 일괄 파이프라인(runLitIngest, planIngestLit 4o 캐시)
//   증분: 나머지 메모를 1개씩 assimilateLitMemo — 판정은 mini(폐쇄형 attach|new),
//         저신뢰(<0.6)·검증 실패 시에만 4o 에스컬레이션. 목소리 재분기·아크 재계산은 코드.
//
// 검증 대상: ① mini 가 폐쇄형 판정을 감당하는가(에스컬레이션율) ② 최종 구조가 일괄과 대등한가
// ③ 재현성 — 축이 고정이므로 출렁임은 배정 1건 수준이어야 한다.
//
// 사용: node eval/runLitAssim.mjs "그리스인 조르바"
//       BOOT=6 ASSIM_MODEL=gpt-4o-mini ESC=1 node eval/runLitAssim.mjs "죄와 벌"
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { runLitIngest, planIngestLit, assimilateLitMemo, consolidateSeeds, rebranchVoices, recomputeArcs } from './lib/litEngine.mjs';
import { serializeTree } from './lib/hierEngine.mjs';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';
import { cachedPlanIngest } from './lib/planCache.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);

const N = (s) => String(s || '').normalize('NFC');
const BOOT = Number(process.env.BOOT) || 6;
const ASSIM_MODEL = process.env.ASSIM_MODEL || 'gpt-4o-mini';
const ESC = process.env.ESC !== '0'; // 저신뢰 4o 에스컬레이션 (끄면 mini 단독 성능 측정)
const KEY = process.env.OPENAI_API_KEY;
const llmMini = openaiNodeTransport({ model: ASSIM_MODEL });
const llm4o = openaiNodeTransport({ model: 'gpt-4o' });

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

const titles = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
if (!titles.length) { console.error('책 제목을 인자로 주세요'); process.exit(1); }

const ds = JSON.parse(await readFile(resolve(__dir, 'golden/books50-memos.json'), 'utf-8'));
try {
  const extra = JSON.parse(await readFile(resolve(__dir, 'golden/extra-lit-memos.json'), 'utf-8'));
  ds.books.push(...(extra.books || []));
} catch { /* 없으면 골든셋만 */ }
const meta = JSON.parse(await readFile(resolve(__dir, 'golden/obsidian-books-meta.json'), 'utf-8'));
let litMeta = {};
try { litMeta = JSON.parse(await readFile(resolve(__dir, 'golden/aladin-lit-meta.json'), 'utf-8')); } catch { /* 미수집 */ }
let canonDb = {};
if (process.env.CANON !== '0') {
  try { canonDb = JSON.parse(await readFile(resolve(__dir, 'golden/lit-canon-motifs.json'), 'utf-8')).books || {}; } catch { /* 미적재 */ }
}

console.log(`[lit-assim] 부트스트랩 ${BOOT}개(4o) → 증분 ${ASSIM_MODEL}${ESC ? ' (+4o 에스컬레이션)' : ' 단독'}`);

const existing = (await readdir(resolve(__dir, 'runs'))).map((f) => f.match(/^literature-v1-(\d+)\.json$/)).filter(Boolean).map((m) => +m[1]);
let i = existing.length ? Math.max(...existing) : 0;
for (const t of titles) {
  const b = ds.books.find((x) => N(x.title) === N(t));
  if (!b) { console.log(`  ⚠ "${t}" — 데이터셋에 없음`); continue; }
  const m = Object.values(meta).find((x) => N(x.title) === N(t))
    || Object.values(litMeta).find((x) => N(x.title) === N(t)) || {};
  const seenP = new Map();
  const memos = b.memos.map((mm) => {
    const n = seenP.get(mm.p) || 0; seenP.set(mm.p, n + 1);
    return { id: n ? `m${mm.p}dup${n}` : `m${mm.p}`, p: mm.p, text: mm.text, myThought: '' };
  });
  const book = {
    title: N(b.title), author: m.author || b.author || '', category: m.category || b.category || '',
    toc: m.toc || [], summary: m.summary || '', aladin: m.aladin || {},
  };
  const isEssay = /수필|에세이/.test(book.category);
  const canon = Object.entries(canonDb).find(([k]) => N(k) === N(t))?.[1] || null;

  const bootMemos = memos.slice(0, BOOT);
  const incMemos = memos.slice(BOOT);
  console.log(`  ${N(b.title)} — 부트 ${bootMemos.length} + 증분 ${incMemos.length}`);
  const t0 = Date.now();
  try {
    // ─ 부트스트랩: 일괄 파이프라인 (planIngestLit 캐시 — 메모 부분집합이라 키가 전량과 다름)
    const planFn = cachedPlanIngest(
      (args) => planIngestLit({ ...args, llm: llm4o, canon }),
      { book, memos: bootMemos, model: `gpt-4o#lit2${(book.summary || book.aladin?.intro) ? '+rich' : ''}${canon ? '+canon' : ''}` },
    );
    const r = await runLitIngest({
      book, memos: bootMemos, llm: llmMini, embedFn, planLitFn: planFn, canon,
      onProgress: () => {},
    });
    const { nodes, rootId } = r;
    const log = [...r.log, `[assim] 부트 ${bootMemos.length} → 모티프 ${r.stats.motifs}`];

    // ─ 증분: 메모 1개씩 동화 + 주기적 씨앗 통합(4건마다·종료 시 — same 병합 | sub 하위 편입)
    let esc = 0, attached = 0, created = 0, merged = 0, subbed = 0;
    const times = []; const judged = new Set();
    const runConsol = async () => {
      const acts = await consolidateSeeds({ nodes, rootId, book, llm: llmMini, embedFn, judged });
      merged += acts.filter((a) => a.includes('병합')).length;
      subbed += acts.filter((a) => a.includes('하위 편입')).length;
      log.push(...acts);
    };
    let k = 0;
    for (const memo of incMemos) {
      const tm = Date.now();
      const res = await assimilateLitMemo({
        nodes, rootId, book, memo,
        llm: llmMini, llmEsc: ESC ? llm4o : null, embedFn,
      });
      times.push(Date.now() - tm);
      if (res.escalated) esc++;
      res.action === 'attach' ? attached++ : created++;
      log.push(`[assim] ${memo.id} → ${res.action} "${res.motif}"${res.escalated ? ' (4o 에스컬레이션)' : ''} conf=${res.confidence}`);
      if (++k % 4 === 0) await runConsol();
      process.stdout.write(`      증분 ${attached + created}/${incMemos.length} (attach ${attached} · new ${created} · esc ${esc} · 병합 ${merged} · 하위 ${subbed})\r`);
    }
    await runConsol();
    recomputeArcs(nodes, isEssay);
    const voices = rebranchVoices(nodes, rootId);

    const tree = serializeTree(nodes, rootId);
    const sec = Math.round((Date.now() - t0) / 1000);
    const sents = tree.nodes.filter((n) => n.kind === 'sentence');
    const motifs = tree.nodes.filter((n) => n.kind === 'concept' && n.parentId === rootId && n.role !== 'voice');
    const covered = new Set(sents.map((n) => n.memoId)).size;
    const rootSents = sents.filter((n) => n.parentId === rootId).length;
    const avgMs = times.length ? Math.round(times.reduce((a, c) => a + c, 0) / times.length) : 0;

    const base = resolve(__dir, `runs/literature-v1-${++i}`);
    await writeFile(`${base}.json`, JSON.stringify({
      label: N(b.title), runAt: new Date().toISOString(),
      kind: 'literature-v1', variant: 'literature-v1',
      mode: { mode: '동화 모드', confidence: 'high', reason: motifs.map((n) => n.title).join(' · ') },
      hierModel: ASSIM_MODEL, ingestModel: `gpt-4o(부트${BOOT}) + ${ASSIM_MODEL}(증분${ESC ? '+esc' : ''})`,
      nMemos: memos.length,
      counts: { variant: 'literature-v1', motifs: motifs.length, voices, sentences: sents.length, rootSentences: rootSents, coveredMemos: covered, escalations: esc, incAttach: attached, incNew: created, consolMerged: merged, consolSubbed: subbed, avgIncMs: avgMs },
      sec, tree, log,
    }, null, 2) + '\n', 'utf-8');

    let md = `# ${N(b.title)} — literature-v1 동화 모드 (부트 ${BOOT} + 증분 ${incMemos.length})\n\n`;
    md += `- 모티프: ${motifs.map((n) => `**${n.title}**`).join(' · ') || '(불성립)'}\n`;
    md += `- 증분 판정: attach ${attached} · new ${created} · 4o 에스컬레이션 ${esc}/${incMemos.length} · 평균 ${avgMs}ms/건\n`;
    md += `- 씨앗 통합: 병합 ${merged} · 하위 편입 ${subbed}\n`;
    md += `- 모티프 ${motifs.length} · 목소리 ${voices} · 잔류 ${rootSents} · 커버 ${covered}/${memos.length} · ${sec}초\n\n## 트리\n\n`;
    const sentLine = (s, indent) => `${indent}- p${s.sources[0] || '?'} [${[s.arc, s.speaker, s.emotion].filter(Boolean).join('·')}] ${String(s.title).slice(0, 80)}\n`;
    const renderNode = (c, depth) => {
      const indent = '  '.repeat(depth);
      md += `${indent}- **${c.title}**${c.gloss ? ` — ${c.gloss}` : ''}\n`;
      for (const sub of tree.nodes.filter((n) => n.parentId === c.id && n.kind === 'concept')) renderNode(sub, depth + 1);
      for (const s of tree.nodes.filter((n) => n.parentId === c.id && n.kind === 'sentence').sort((a, b) => (a.sources[0] || 0) - (b.sources[0] || 0))) md += sentLine(s, indent + '  ');
    };
    for (const c of motifs) renderNode(c, 0);
    await writeFile(`${base}.md`, md, 'utf-8');
    console.log(`\n      → run ${i}: 모티프 ${motifs.length} · 목소리 ${voices} · 잔류 ${rootSents} · esc ${esc}/${incMemos.length} · 평균 ${avgMs}ms/건 (${sec}초)`);
  } catch (e) {
    console.log(`\n      ✗ 실패: ${e.message}`);
  }
}
