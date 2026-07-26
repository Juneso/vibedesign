// 결함 감사(defect audit) — "이 트리에 알려진 결함이 몇 개나 있는가"
//
// 점수가 아니라 **개수와 위치**를 낸다. 점수는 검증할 방법이 없지만(포화되거나
// 채점자를 믿어야 한다), 결함은 지목된 노드를 열어보면 사람이 5분에 검증할 수 있다.
// 그래서 이 지표는 Junseo 가 감사자를 감사할 수 있는 유일한 지표다.
//
// 결함 목록은 전부 실측에서 나왔다 — 루소·칸트가 문장에 갇힌 사건(미승격),
// 타자성↔자본주의 가짜 쌍, 돈으로의 분류 축이 7개를 삼킨 덤핑 버킷 등.
// 새 결함을 발견하면 여기에 추가한다. 지표가 우리 이해와 함께 자란다.
//
// 사용: node eval/evalDefects.mjs runs/hier-auto-45.json [...]
// 결과: runs/defects-{N}.json + .md (시리즈 defects)
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';
import { MEMBER_SPEC, PAGE_ORDERED, verifyAsk } from './lib/relationVocab.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);

const N = (s) => String(s || '').normalize('NFC');
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
const llm = openaiNodeTransport({ model: MODEL });

// 결함 분류 — code 는 코드가 확정적으로 잡고, llm 은 의미 판단이 필요해 모델이 지목한다.
export const DEFECTS = {
  // 다음 둘은 결함 목록에서 뺐다(Junseo 판정).
  // - 자식 1개 축: "성과사회의 기원 · 통시 → 규율사회" 처럼 멀쩡한 경우가 많다.
  //   축이 하나만 거느린 것 자체는 잘못이 아니다. 37건 중 11건이 이것이었고,
  //   전부 오탐으로 관계별 순위를 통째로 왜곡하고 있었다.
  // - 헛도는 층: 결함으로 셀 게 아니라 파이프라인이 고칠 일이다. hierEngine 4.9 의
  //   축 해체 규칙을 낱말 겹침까지 넓혀(조사 차이로 놓치던 것) 코드가 직접 없앤다.
  underMin:     { by: 'code', label: '관계 최소 위반', desc: '대조·인과처럼 짝이 있어야 성립하는 관계인데 한쪽만 있다' },
  dumping:      { by: 'code', label: '덤핑 버킷', desc: '한 축이 지나치게 많이 삼켰다 — 분류가 아니라 나머지 통이다' },
  orphan:       { by: 'code', label: '고아', desc: '어느 개념에도 안 묶이고 뿌리에 매달린 문장' },
  emptyLeaf:    { by: 'code', label: '빈 키워드', desc: '이름만 있고 문장도 자식도 없다' },
  thinPillar:   { by: 'code', label: '실속 없는 기둥', desc: '핵심 개념인데 거느린 게 거의 없다 — 기둥이라 부를 근거가 없다' },
  fakeOrder:    { by: 'code', label: '가짜 순서', desc: '통시·과정인데 자식들이 책의 같은 대목에 몰려 있다 — 시간 흐름이 아니다' },
  dupPillar:    { by: 'llm',  label: '중복 기둥', desc: '사실상 같은 것을 가리키는 핵심 개념이 둘 이상 서 있다' },
  relationMiss: { by: 'llm',  label: '관계-멤버 불일치', desc: '선언한 관계와 자식들의 실제 관계가 다르다' },
  nameMiss:     { by: 'llm',  label: '이름-내용 불일치', desc: '이름이 약속한 것과 그 아래 실제 내용이 어긋난다' },
  misplaced:    { by: 'llm',  label: '오배치', desc: '이 키워드는 다른 축 아래 있어야 맞다' },
  misabsorbed:  { by: 'llm',  label: '오흡수', desc: '그 키워드와 무관한 문장이 딸려 들어갔다' },
  unpromoted:   { by: 'llm',  label: '미승격', desc: '독립된 키워드가 됐어야 할 개념이 문장 속에 갇혀 있다' },
};

// ── 트리 헬퍼 ──────────────────────────────────────────────────────────
function idx(tree) {
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const kids = new Map();
  for (const n of tree.nodes) {
    if (!kids.has(n.parentId)) kids.set(n.parentId, []);
    kids.get(n.parentId).push(n);
  }
  const root = tree.nodes.find((n) => n.kind === 'root');
  const ch = (id) => kids.get(id) || [];
  const concepts = (id) => ch(id).filter((n) => n.kind === 'concept');
  const sents = (id) => ch(id).filter((n) => n.kind === 'sentence');
  const deep = (id) => { let n = 0; const w = (i) => { for (const c of ch(i)) { n++; w(c.id); } }; w(id); return n; };
  return { byId, root, ch, concepts, sents, deep };
}

// ── 코드 감사 ──────────────────────────────────────────────────────────
function auditCode(tree) {
  const T = idx(tree);
  const out = [];
  const add = (type, node, why) => out.push({ type, by: 'code', nodeId: node.id, title: N(node.title), why });

  for (const n of tree.nodes) {
    if (n.kind === 'root') continue;
    const kidC = T.concepts(n.id);
    const kidS = T.sents(n.id);

    if (n.kind === 'sentence') {
      if (n.parentId === T.root?.id) add('orphan', n, '뿌리에 바로 매달려 있다');
      continue;
    }
    // 축(relation 보유) 전용 검사
    if (n.relation) {
      const min = MEMBER_SPEC[n.relation]?.min || 1;
      if (kidC.length && kidC.length < min) add('underMin', n, `${n.relation} 는 최소 ${min}개가 필요한데 ${kidC.length}개다`);
      if (PAGE_ORDERED.has(n.relation) && kidC.length >= 2) {
        const med = (x) => { const ps = [...new Set(x.sources || [])].sort((a, b) => a - b); return ps.length ? ps[Math.floor(ps.length / 2)] : null; };
        const seq = kidC.map(med).filter((p) => p != null);
        if (seq.length >= 2) {
          const span = Math.max(...seq) - Math.min(...seq);
          if (span < 20) add('fakeOrder', n, `${n.relation} 인데 자식들이 페이지 ${Math.min(...seq)}~${Math.max(...seq)} (폭 ${span}p) 에 몰려 있다`);
        }
      }
    }
    // 핵심 개념(뿌리 직속) — 기둥 실속
    if (n.parentId === T.root?.id && n.kind === 'concept') {
      const axes = kidC.filter((c) => c.relation).length;
      // 거느린 키워드 = 직속 키워드 + 축 아래 키워드
      const kws = kidC.filter((c) => !c.relation).length
        + kidC.filter((c) => c.relation).reduce((a, c) => a + T.concepts(c.id).length, 0);
      if (axes < 2 && kws < 3) add('thinPillar', n, `축 ${axes}개 · 하위 키워드 ${kws}개뿐이다`);
    }
    // 출처 페이지는 있는데 문장이 다른 데로 흡수돼 껍데기만 남은 경우가 대부분 —
    // 유저가 눌러도 볼 게 없다.
    if (!n.relation && !kidC.length && !kidS.length) {
      add('emptyLeaf', n, (n.sources || []).length ? `출처 p.${n.sources.join(',')} 는 있으나 문장이 딸려 있지 않다` : '문장도 자식도 없다');
    }
  }

  // 덤핑 버킷 — 절대 기준으로 센다.
  // 형제 축 대비 배수로 재던 규칙은 **개선을 벌줬다**: 피로사회의 분석 축에서 결과 2개를
  // 걷어내 자식이 4개로 줄었는데, 형제 축이 더 작아서 오히려 덤핑 판정에 새로 걸렸다.
  // 축이 커진 게 아니라 형제가 작아진 것이므로 결함이 아니다. 키워드 절대 수로 본다.
  const DUMP_KIDS = 8;
  for (const n of tree.nodes) {
    if (!n.relation) continue;
    const k = T.concepts(n.id).length;
    if (k >= DUMP_KIDS) add('dumping', n, `키워드 ${k}개를 거느린다 — 하나의 관계로 묶였다고 보기 어렵다`);
  }
  return out;
}

// ── LLM 감사용 뷰 ──────────────────────────────────────────────────────
function treeView(tree) {
  const T = idx(tree);
  const lines = [];
  const walk = (n, d) => {
    const pad = '  '.repeat(d);
    if (n.kind === 'sentence') { lines.push(`${pad}· [${n.id}] "${N(n.title).slice(0, 90)}" (p.${(n.sources || [])[0] ?? '?'})`); return; }
    const rel = n.relation ? ` {관계=${n.relation} · 검증질문: ${verifyAsk(n.relation)}}` : '';
    lines.push(`${pad}- [${n.id}] ${N(n.title)}${rel}`);
    for (const c of T.ch(n.id)) walk(c, d + 1);
  };
  for (const c of T.ch(T.root.id)) walk(c, 0);
  return lines.join('\n');
}

const LLM_TYPES = Object.entries(DEFECTS).filter(([, v]) => v.by === 'llm');

async function auditLLM(tree, label) {
  const view = treeView(tree);
  const spec = LLM_TYPES.map(([k, v]) => `- ${k} (${v.label}): ${v.desc}`).join('\n');
  const raw = await llm({
    system: [
      '독서 메모로 자동 생성된 개념 위계를 감사한다. 좋은 점은 말하지 말고 **결함만** 찾아라.',
      '점수를 매기지 마라. 아래 목록에 해당하는 것만, 해당하는 노드를 지목해 보고한다.',
      '노드 id 는 반드시 트리에 실제로 나온 [nN] 을 그대로 쓴다. 지어내면 무효 처리된다.',
      // 실측: 축 4개를 전부 관계-멤버 불일치로 지목하면서 근거 칸에 노드 줄을 그대로
      // 복사해 왔다. 근거 없는 지목은 감사가 아니라 도장 찍기다.
      'why 에는 **문제가 되는 자식의 이름을 직접 대고** 무엇이 어긋나는지 써라.',
      '나쁜 근거: "성과사회의 구성 요소 · 분석 {관계=분석}" (노드를 그대로 옮겼을 뿐이다).',
      '좋은 근거: "자식 \'우울증\'·\'세계화\'는 성과사회의 구성 요소가 아니라 그 결과와 배경이다".',
      'dupPillar·misplaced 는 상대 노드 id 를 otherId 에 반드시 적는다.',
      '같은 층의 노드를 전부 지목했다면 그건 감사 실패다 — 정말 어긋나는 것만 골라라.',
      '확신이 없으면 보고하지 마라 — 놓치는 것보다 잘못 지목하는 게 나쁘다.',
      'JSON만 출력.',
    ].join(' '),
    user: `[결함 목록]\n${spec}\n\n[감사 대상 위계]\n${view}\n\n출력 JSON: {"defects":[{"type":"위 키 중 하나","nodeId":"nN","otherId":"nM 또는 생략","why":"문제되는 자식 이름을 대고 무엇이 어긋나는지"}]}`,
    temperature: 0,
  });
  let j = { defects: [] };
  try { j = JSON.parse(raw); } catch { /* noop */ }
  const ids = new Set(tree.nodes.map((n) => n.id));
  const rootId = tree.nodes.find((n) => n.kind === 'root')?.id;
  const keys = new Set(LLM_TYPES.map(([k]) => k));
  const kept = [], dropped = [];
  for (const d of Array.isArray(j.defects) ? j.defects : []) {
    const n = tree.nodes.find((x) => x.id === d.nodeId);
    const why = String(d.why || '').trim();
    // 근거 강제 — 아래 어느 하나라도 걸리면 버린다(감사자 환각·도장 찍기 차단).
    const bad = !ids.has(d.nodeId) || !keys.has(d.type) ? '없는 노드/종류'
      // 관계 없는 노드(v10 트리 등)에 관계 결함을 붙일 수 없다
      : (d.type === 'relationMiss' && !n.relation) ? '관계 없는 노드'
      // 관계 키워드 — 짝이 한 문장 안에서 완결될 때 축을 키워드로 전환한 **의도된 구조**다.
      // 자식 키워드가 없으니 "자식들이 그 관계인가"라는 질문 자체가 성립하지 않는다.
      // (실측: 대조 결함 4건 중 2건이 이 오탐이었다)
      : (d.type === 'relationMiss' && !tree.nodes.some((x) => x.parentId === n.id && x.kind === 'concept')) ? '관계 키워드(자식 없음)'
      // 상대가 있어야 성립하는 결함은 상대를 대야 한다
      : (['dupPillar', 'misplaced'].includes(d.type) && !ids.has(d.otherId)) ? '상대 노드 미지정'
      // 기둥은 뿌리 직속 핵심 개념만 — 축을 기둥이라 부른 지목은 종류를 잘못 고른 것이다
      : (['dupPillar', 'thinPillar'].includes(d.type) && n.parentId !== rootId) ? '기둥이 아닌 노드'
      : why.length < 12 ? '근거 부실'
      // 노드 줄을 그대로 옮겨 적은 것은 근거가 아니다
      : why.replace(/\s/g, '').includes(N(n.title).replace(/\s/g, '')) && why.length < N(n.title).length * 2 ? '근거가 노드 복사'
      : null;
    if (bad) { dropped.push({ ...d, bad }); continue; }
    kept.push({ type: d.type, by: 'llm', nodeId: d.nodeId, otherId: d.otherId, title: N(n.title), why });
  }
  if (dropped.length) console.log(`      ⚠ ${label}: 무효 지목 ${dropped.length}건 버림 (${[...new Set(dropped.map((d) => d.bad))].join(', ')})`);
  return kept;
}

// ── 실행 ───────────────────────────────────────────────────────────────
const files = process.argv.slice(2);
if (!files.length) { console.error('런 파일 경로를 인자로 주세요 (예: runs/hier-auto-45.json)'); process.exit(1); }

const existing = (await readdir(resolve(__dir, 'runs'))).map((f) => f.match(/^defects-(\d+)\.json$/)).filter(Boolean).map((m) => +m[1]);
let idxN = existing.length ? Math.max(...existing) : 0;

console.log(`[DEFECTS] 감사 모델 ${MODEL} · 대상 ${files.length}개 런`);

for (const f of files) {
  const run = JSON.parse(await readFile(resolve(__dir, f), 'utf-8'));
  const tree = run.tree;
  const codeD = auditCode(tree);
  const llmD = process.env.CODE_ONLY === '1' ? [] : await auditLLM(tree, N(run.label));
  const all = [...codeD, ...llmD];

  const nConcept = tree.nodes.filter((n) => n.kind === 'concept').length;
  const byType = {};
  for (const d of all) byType[d.type] = (byType[d.type] || 0) + 1;
  // 밀도 — 트리 크기가 다른 책끼리 비교하려면 개수만으로는 안 된다.
  const density = nConcept ? all.length / nConcept : 0;

  console.log(`  [${N(run.label)}] ${run.variant} · 개념 ${nConcept}개 · 결함 ${all.length}건 (밀도 ${density.toFixed(2)})`);
  for (const [t, c] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${DEFECTS[t].label} ${c}건 — ${all.filter((d) => d.type === t).map((d) => d.title).slice(0, 3).join(' / ')}`);
  }

  const base = resolve(__dir, `runs/defects-${++idxN}`);
  await writeFile(`${base}.json`, JSON.stringify({
    label: N(run.label), runAt: new Date().toISOString(), kind: 'defects',
    sourceRun: f, sourceVariant: run.variant || run.kind, model: MODEL,
    nConcepts: nConcept, total: all.length, density: +density.toFixed(3),
    byType, defects: all,
    reading: `개념 ${nConcept}개 중 결함 ${all.length}건 — ${Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => `${DEFECTS[t].label} ${c}`).join(' · ') || '없음'}`,
  }, null, 2) + '\n', 'utf-8');

  let md = `# ${N(run.label)} — 결함 감사\n\n`;
  md += `- 대상 트리: \`${f}\` (${run.variant || run.kind}) · 개념 ${nConcept}개\n`;
  md += `- **결함 ${all.length}건** (개념당 ${density.toFixed(2)}건)\n\n`;
  if (!all.length) md += `결함이 지목되지 않았다.\n`;
  else {
    md += `## 종류별\n\n| 결함 | 건수 | 잡은 쪽 |\n|---|---|---|\n`;
    for (const [t, c] of Object.entries(byType).sort((a, b) => b[1] - a[1])) md += `| ${DEFECTS[t].label} | ${c} | ${DEFECTS[t].by === 'code' ? '코드' : '감사자'} |\n`;
    md += `\n## 지목된 노드\n\n`;
    for (const [t] of Object.entries(byType).sort((a, b) => byType[b[0]] - byType[a[0]])) {
      md += `**${DEFECTS[t].label}** — ${DEFECTS[t].desc}\n\n`;
      for (const d of all.filter((x) => x.type === t)) {
        const other = d.otherId ? ` (상대: \`${d.otherId}\` ${N(tree.nodes.find((n) => n.id === d.otherId)?.title || '')})` : '';
        md += `- \`${d.nodeId}\` ${d.title}${other} — ${d.why}\n`;
      }
      md += `\n`;
    }
  }
  await writeFile(`${base}.md`, md, 'utf-8');
}
console.log('\n✓ 완료');
