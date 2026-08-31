// 빅콜 세대 동화 모드 검증 (BKT-381 0824) — 부트 빅콜 + 증분 소콜 시뮬레이션.
//
// 검증하려는 것 셋:
//  ① 동화로 조각조각 쌓은 트리가 전량 빅콜 트리와 얼마나 같은 구조인가 (동거쌍 자카드)
//  ② 같은 순서를 REPEAT회 반복하면 얼마나 같은가 (구엔진 동화 92.1% 이상 목표)
//  ③ 잔류 0(전 문장 소속) + 콜 수·원가가 설계(부트 1 + 소콜 n/CHUNK)와 맞는가
//
// **서버 코드를 그대로 import 한다** — booktracking-ios functions/lib 의
// buildLitPrompt/buildPrompt/toTreeNodes 를 직접 쓴다. 실험이 곧 배포 코드 검증이고,
// 실험실↔서버 프롬프트 손복사 어긋남이 이 실험에는 없다. 동화 프롬프트만 여기서
// 새로 설계한다(통과하면 서버로 이식 — 그때 이 파일이 원본이 된다).
//
// 동화 판정 설계 (구엔진 hierAssim 의 폐쇄 판정 원리 승계, 임베딩은 제거):
//  · 빅콜 트리는 뿌리 축이 3~10개뿐 — 후보 축소 없이 전 축을 그대로 제시
//  · Haiku + MAX_THINKING_TOKENS=0 (열린 판정 진자운동 방지: 객관식 + 무사고)
//  · 확신 < 0.6 이면 그 문장만 소네트 재판정 (구엔진 에스컬레이션 승계)
//  · 집행은 코드 — 잎 삽입만, 기존 축은 바이트 불변. NEW 는 뿌리 직속 씨앗 축
//  · 뿌리 축 > 10 이면 전량 빅콜 재구성 (준서 확정 0824)
//
// 사용: [BOOK=그리스인 조르바] [BOOT=5] [CHUNK=5] [REPEAT=3] node runBigCallAssim.mjs <라벨>
//   케이스 탐색: golden/app-cases/*.json (앱 실측) → golden/books50-memos.json → extra-lit-memos.json

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { claudeCliTransport } from './lib/claudeCliTransport.mjs';

const IOS_LIB = '/Users/1522684/Developer/booktracking-ios/functions/lib';
const { buildLitPrompt } = await import(`${IOS_LIB}/ingestLit.js`);
const { buildPrompt, toTreeNodes } = await import(`${IOS_LIB}/ingest.js`);
const { buildAssimPrompt, applyPlacements } = await import(`${IOS_LIB}/ingestAssim.js`);

const __dir = dirname(fileURLToPath(import.meta.url));
const N = (s) => String(s || '').normalize('NFC');
const nrmT = (s) => N(s).trim();

const label = process.argv[2] || '1';
const title = nrmT(process.env.BOOK || '그리스인 조르바');
const BOOT = Number(process.env.BOOT || 5);
const CHUNK = Number(process.env.CHUNK || 5);
const REPEAT = Number(process.env.REPEAT || 1);
const MAX_ROOT_AXES = 10;           // 재구성 문턱 (준서 확정)
const MAX_ROOT_STRAY = 5;           // 뿌리 보류 누적 문턱 — 신설 금지의 짝
// 동화에서 NEW(축 신설) 허용 여부. fixedboot3 실측: NEW 를 열어두면 패스마다
// 신설이 1/2/3개, 이름도 제각각 — 재현성 20~37% 의 주범. 신설은 재구성 빅콜의
// 몫으로 넘기고 동화는 「붙이기 or 보류」만 한다 (ALLOW_NEW=1 로 되살릴 수 있음).
const ALLOW_NEW = process.env.ALLOW_NEW === '1';
// 다수결 표 수. nonew3 실측: 축은 5/5/5 로 고정됐지만 애매한 문장 6/22 가 그럴듯한
// 두 축 사이를 오가 재현성 32~68%. 같은 청크를 VOTES회 판정해 문장별 다수결 —
// Haiku 소콜이 문장당 ~3원이라 3표도 ~9원. 과반 없으면 소네트 에스컬레이션.
const VOTES = Number(process.env.VOTES || 3);
const ESCALATE_BELOW = 0.6;         // 구엔진 문턱 승계
const GENRE = process.env.GENRE || 'lit';

// ── 케이스 로드 ─────────────────────────────────────────────
async function loadCase() {
  const appDir = resolve(__dir, 'golden/app-cases');
  try {
    for (const f of await readdir(appDir)) {
      if (!f.endsWith('.json')) continue;
      const c = JSON.parse(await readFile(resolve(appDir, f), 'utf-8'));
      if (nrmT(c.book?.title) === title || nrmT(c.book?.title).includes(title)) {
        const rich = c.richMeta
          ? [(c.richMeta.toc || []).join('\n'), c.richMeta.bookIntro, c.richMeta.inBook].filter((s) => s && s.trim())
          : [];
        return { title: nrmT(c.book.title), rich, memos: c.book.memos.map((m, i) => ({
          id: m.id || `m${i}`, text: m.text, page: m.p ?? null,
          thoughts: m.myThought ? [m.myThought] : [],
        })) };
      }
    }
  } catch {}
  for (const file of ['golden/books50-memos.json', 'golden/extra-lit-memos.json']) {
    try {
      const ds = JSON.parse(await readFile(resolve(__dir, file), 'utf-8'));
      const b = ds.books.find((x) => nrmT(x.title) === title);
      if (b) {
        let rich = [];
        try {
          const meta = JSON.parse(await readFile(resolve(__dir, 'golden/aladin-lit-meta.json'), 'utf-8'))[title];
          if (meta) rich = [meta.summary, meta.aladin?.intro, meta.aladin?.publisherIntro, meta.aladin?.excerpts].filter(Boolean);
        } catch {}
        return { title, rich, memos: b.memos.map((m, i) => ({
          id: `g-${i}`, text: m.text, page: m.p ?? m.page ?? null,
          thoughts: (m.myThought || m.my) ? [m.myThought || m.my] : [],
        })) };
      }
    } catch {}
  }
  throw new Error(`케이스를 못 찾음: ${title}`);
}

// 동화 프롬프트·집행은 서버 모듈(ingestAssim.js)에서 import — 사본 없음 (0826)

// ── 측정: 동거쌍 자카드 (litStability 방식 — 최상위 축 기준, memoId 로) ──
function topPairs(nodes) {
  const topOf = (n) => { let c = n; while (c && c.parentID !== 'root') c = nodes.find((x) => x.id === c.parentID); return c?.id ?? n.id; };
  const groups = new Map();
  for (const n of nodes) {
    if (n.kind !== 'sentence' || !n.highlightID) continue;
    const t = n.parentID === 'root' ? `solo:${n.id}` : topOf(n);
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(n.highlightID);
  }
  const pairs = new Set();
  for (const ids of groups.values())
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        pairs.add([ids[i], ids[j]].sort().join('|'));
  return pairs;
}
const jaccard = (a, b) => {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
};

// ── 실행 ────────────────────────────────────────────────────
const kase = await loadCase();
const memoByID = new Map(kase.memos.map((m) => [m.id, m]));
console.log(`『${kase.title}』 — 문장 ${kase.memos.length}건, 부트 ${BOOT} + 청크 ${CHUNK}, ${REPEAT}회 반복`);

const usages = [];
// 부트·재구성 빅콜은 서버 조건(effort medium, 사고 있음)과 맞춘다 — 소콜만 무사고.
// (main3 실측: 무사고 부트가 패스마다 축 6/8/5 로 갈라져 재현성 폭락의 주범이었다)
const big = claudeCliTransport({ model: 'claude-sonnet-5', timeoutMs: 480000, maxThinkingTokens: 8000, onUsage: (u) => usages.push({ ...u, role: 'big' }) });
const small = claudeCliTransport({ model: 'claude-haiku-4-5-20251001', timeoutMs: 180000, onUsage: (u) => usages.push({ ...u, role: 'assim' }) });
const esc = claudeCliTransport({ model: 'claude-sonnet-5', timeoutMs: 300000, onUsage: (u) => usages.push({ ...u, role: 'esc' }) });

const buildBig = (memos) => (GENRE === 'lit' ? buildLitPrompt : buildPrompt)(kase.title, kase.rich, memos);
const parseBig = (raw, memos) => {
  const parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) || ['{}'])[0]);
  return toTreeNodes(parsed, kase.title, { literary: GENRE === 'lit', memoByID: new Map(memos.map((m) => [m.id, m])) }).nodes;
};

// **부트는 한 번, 동화만 반복.** 실서비스에서 부트는 책당 1회이고 트리가 저장돼
// 이어진다 — 패스마다 부트를 새로 하면 유저가 겪지 않을 변동(부트 추첨)까지
// 재현성에 섞인다. 재는 대상은 "같은 트리에서 출발한 동화 판정의 일관성"이다.
let sharedBoot = null;
async function assimPass(passNo) {
  const log = [];
  const bootMemos = kase.memos.slice(0, BOOT);
  if (!sharedBoot) {
    log.push(`[boot] 빅콜 ${bootMemos.length}건`);
    sharedBoot = parseBig(await big({ user: buildBig(bootMemos) }), bootMemos);
  }
  let nodes = structuredClone(sharedBoot);
  let reorgs = 0, escalations = 0, assimCalls = 0;

  for (let i = BOOT; i < kase.memos.length; i += CHUNK) {
    const chunk = kase.memos.slice(i, i + CHUNK);
    // v3 (0831): 비문학은 트리 전체 제시 + 어느 자리든 배치 + 갈래 국소 재편(regroup).
    const prompt = buildAssimPrompt(kase.title, GENRE, nodes, chunk);
    assimCalls++;
    let placements = [];
    let regroup = null;
    try {
      const parsed = JSON.parse(await esc(prompt));
      placements = parsed.placements || [];
      regroup = parsed.regroup || null;
    } catch (e) { log.push(`[assim] 판정 파싱 실패 (${e.message.slice(0, 60)})`); }
    for (const m of chunk) if (!placements.some((p) => p.memoId === m.id))
      placements.push({ memoId: m.id, target: 'ROOT' });
    const { added, newAxes, regrouped } = applyPlacements(nodes, { placements, regroup }, memoByID, GENRE);
    for (const a of newAxes) log.push(`[assim] NEW 축 「${a.name}」`);
    if (regrouped) {
      reorgs++;
      log.push(`[assim] 재편 「${regrouped.axis.name}」 → 하위 ${regrouped.newConcepts.map((c) => c.name).join('·')} · 이동 ${regrouped.moved.length}`);
    }
  }
  const placed = new Set(nodes.filter((n) => n.kind === 'sentence' && n.highlightID).map((n) => n.highlightID));
  const missing = kase.memos.filter((m) => !placed.has(m.id));
  const rootStray = nodes.filter((n) => n.kind === 'sentence' && n.parentID === 'root').length;
  // 어떤 문장이 흔들리는지 추적용 — memoId → 최상위 축 이름
  const topOf = (n) => { let c = n; while (c && c.parentID !== 'root') c = nodes.find((x) => x.id === c.parentID); return c; };
  const groups = {};
  for (const n of nodes) if (n.kind === 'sentence' && n.highlightID)
    groups[n.highlightID] = n.parentID === 'root' ? '(보류)' : (topOf(n)?.name ?? '?');
  console.log(`  pass ${passNo}: 축 ${nodes.filter((n) => n.kind === 'concept' && n.parentID === 'root').length} · 커버 ${placed.size}/${kase.memos.length} · 뿌리 보류 ${rootStray} · 소콜 ${assimCalls} · 에스컬 ${escalations} · 재구성 ${reorgs}`);
  return { nodes, log, groups, stats: { assimCalls, escalations, reorgs, covered: placed.size, missing: missing.map((m) => m.id), rootStray } };
}

// 기준선: 전량 빅콜 1회 (SKIP_BATCH=1 이면 생략 — CLI 간헐 실패 시 동화만 검증)
let batchNodes = [], batchPairs = new Set();
if (process.env.SKIP_BATCH !== '1') {
  console.log('[batch] 전량 빅콜 기준선…');
  batchNodes = parseBig(await big({ user: buildBig(kase.memos) }), kase.memos);
  batchPairs = topPairs(batchNodes);
}

const passes = [];
for (let r = 1; r <= REPEAT; r++) passes.push(await assimPass(r));

// ── 측정 결과 ────────────────────────────────────────────────
const vsBatch = passes.map((p) => Math.round(jaccard(topPairs(p.nodes), batchPairs) * 1000) / 10);
const among = [];
for (let i = 0; i < passes.length; i++)
  for (let j = i + 1; j < passes.length; j++)
    among.push(Math.round(jaccard(topPairs(passes[i].nodes), topPairs(passes[j].nodes)) * 1000) / 10);
const cost = usages.reduce((s, u) => s + (u.costUsd || 0), 0);

const render = (nodes) => {
  let md = '';
  const walk = (pid, d) => {
    for (const n of nodes.filter((x) => x.parentID === pid).sort((a, b) => a.position - b.position)) {
      md += n.kind === 'concept'
        ? `${'  '.repeat(d)}- **${n.name}**${n.gloss ? ` — ${n.gloss.split('\n')[0]}` : ''}\n`
        : `${'  '.repeat(d)}- p.${n.sourcePages[0] ?? '?'}${n.display?.badge ? ` [${n.display.badge}]` : ''} ${n.name.slice(0, 80)}\n`;
      if (n.kind === 'concept') walk(n.id, d + 1);
    }
  };
  walk('root', 0);
  return md;
};

const out = {
  label: `bigcall-assim-${label}`, runAt: new Date().toISOString(), book: kase.title, genre: GENRE,
  config: { BOOT, CHUNK, REPEAT, MAX_ROOT_AXES, ESCALATE_BELOW },
  metrics: { vsBatchJaccard: vsBatch, amongPassesJaccard: among, totalCostUsd: Math.round(cost * 10000) / 10000 },
  passes: passes.map((p) => ({ stats: p.stats, groups: p.groups, log: p.log })),
  usages,
};
await writeFile(resolve(__dir, `runs/${out.label}.json`), JSON.stringify({ ...out, finalNodes: passes[0].nodes, batchNodes }, null, 2));

let md = `# ${out.label} — 『${kase.title}』 빅콜 동화 검증\n\n> ${out.runAt} · 부트 ${BOOT} + 청크 ${CHUNK} × ${REPEAT}회 · 총 $${out.metrics.totalCostUsd}\n\n`;
md += `## 측정\n\n- 동화 vs 전량 빅콜 구조 일치도: ${vsBatch.join(' · ')}%\n- 반복 재현성(패스 간): ${among.length ? among.join(' · ') + '%' : '(1회 실행)'}\n- 커버: ${passes.map((p) => `${p.stats.covered}/${kase.memos.length}`).join(' · ')} · 뿌리 보류: ${passes.map((p) => p.stats.rootStray).join(' · ')}\n- 콜: 소콜 ${passes[0].stats.assimCalls} · 에스컬 ${passes[0].stats.escalations} · 재구성 ${passes[0].stats.reorgs}\n\n`;
md += `## 동화 최종 트리 (pass 1)\n\n${render(passes[0].nodes)}\n## 전량 빅콜 기준선\n\n${render(batchNodes)}`;
await writeFile(resolve(__dir, `runs/${out.label}.md`), md);
console.log(`✓ vs일괄 ${vsBatch.join('·')}% | 재현성 ${among.join('·') || '-'}% | $${out.metrics.totalCostUsd}`);
console.log(`  → runs/${out.label}.json / .md`);
