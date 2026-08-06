// 지도 일치 5축 채점 (BKT-342 4단계) — v12 런을 준서 수기 골든 지도
// (golden/hier-oracle-피로사회-junseo.md)와 대조한다. LLM 0콜 — 오라클을 기대값
// 테이블로 인코딩해 결정적으로 채점한다. 모델 교체 회귀 테스트의 비교 기준
// (설계 문서 "대고객 전환 대비" ①): 후보 모델을 같은 골든에 돌려 이 점수만 비교한다.
//
// 5축:
//  ① 커버 — 골든 지도의 개념들이 트리에 존재하는가 (동의어 허용)
//  ② 소속 — 커버된 개념이 골든의 구획과 같은 역할 블록에 있는가
//  ③ 대조 — 골든의 대조 구도가 엣지로 재현되는가
//  ④ 다개념 보존 — m95(p.95)의 나르시스·슬픔·리비도가 각자 살아 있는가
//  ⑤ 편성 — 블록 2~5개 · 독식 없음 · 처방 블록 존재 · 미배정 소수
//
// 사용: node evalMapMatchV12.mjs runs/hier-v12-manual-1.json [runs/...2.json ...]

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const N = (s) => String(s || '').normalize('NFC');
const nrm = (s) => N(s).replace(/\s+/g, '').toLowerCase();

// 오라클 기대값 — 준서 지도의 개념·구획. group 은 허용 역할(오라클에서 자리가 겹치는
// 개념은 복수 허용 — 예: 폭력은 오라클에서 해결방안 절에 있지만 문제의식으로도 정당).
const CONCEPTS = [
  { name: '신경성 질환', syn: ['신경성질환'], group: ['문제의식'] },
  { name: '긍정성의 과잉', syn: ['긍정성의과잉', '긍정성과잉'], group: ['문제의식'] },
  { name: '긍정성의 폭력', syn: ['긍정성의폭력'], group: ['문제의식'] },
  { name: '합의적 폭력', syn: ['합의적폭력'], group: ['문제의식', '처방'] },
  { name: '타자성의 소멸', syn: ['타자성', '이질성'], group: ['배경', '문제의식'] },
  { name: '세계화', syn: ['세계화', '탈경계'], group: ['배경', '문제의식'] },
  { name: '소비주의', syn: ['소비주의'], group: ['배경', '문제의식'] },
  { name: '성과사회', syn: ['성과사회'], group: ['배경'] },
  { name: '성과주체', syn: ['성과주체'], group: ['배경', '진단'] },
  { name: '할 수 있다', syn: ['할수있'], group: ['배경'] },
  { name: '우울증', syn: ['우울증'], group: ['진단'] },
  { name: '자기 착취', syn: ['자기착취'], group: ['진단'] },
  { name: '강제하는 자유', syn: ['강제하는자유', '자유로운강제', '자유와강제'], group: ['진단', '배경'] },
  { name: '보상', syn: ['보상'], group: ['진단'] },
  { name: '성격 없는 인간', syn: ['성격없는', '유연한인간', '무형'], group: ['진단', '배경'] },
  { name: '능률', syn: ['능률', '경제적효율'], group: ['진단', '배경'] },
  { name: '나르시스', syn: ['나르시스'], group: ['진단'] },
  { name: '리비도', syn: ['리비도'], group: ['진단', '처방'] },
  { name: '정체성', syn: ['정체성', '유연한개인'], group: ['진단', '배경'] },
  { name: '불안과 초조', syn: ['불안', '초조', '탈서사화'], group: ['진단'] },
  { name: '중단', syn: ['중단', '머뭇거림'], group: ['처방'] },
  { name: '분노', syn: ['분노'], group: ['처방'] },
  { name: '짜증', syn: ['짜증'], group: ['처방'] },
  { name: '깊은 피로', syn: ['깊은피로'], group: ['처방'] },
  { name: '고독한 피로', syn: ['고독한피로', '성과사회의피로', '분열적'], group: ['처방', '진단'] },
  { name: '슬픔', syn: ['슬픔'], group: ['처방', '진단'] },
];
// 오라클의 대조 구도 — 각 변은 동의어 집합. 엣지의 쌍 문면(또는 연결 노드 제목)에
// 양변이 모두 나타나면 재현으로 친다.
const CONTRASTS = [
  { name: '규율사회 ↔ 성과사회', a: ['규율사회'], b: ['성과사회'] },
  { name: '복종적 주체 ↔ 성과주체', a: ['복종적주체'], b: ['성과주체'] },
  { name: '부정성 ↔ 긍정성', a: ['부정성'], b: ['긍정성'] },
  { name: '분노 ↔ 짜증', a: ['분노'], b: ['짜증'] },
  { name: '깊은 피로 ↔ 성과사회의 피로', a: ['깊은피로', '화해시키'], b: ['고독한피로', '성과사회의피로', '분열'] },
  { name: '슬픔 ↔ 우울증', a: ['슬픔'], b: ['우울증'] },
];
const M95 = ['나르시스', '슬픔', '리비도']; // p.95 다개념 메모 — v11에서 증발한 실측
// ⑥ 위계 — 오라클이 들여쓰기로 명시한 부모-자식 8쌍 (0806 트리 깊이 판정의 채점화).
// 각 변은 동의어 집합. 트리에서 조상-자손 관계로 재현되면 1쌍 인정.
const HIERARCHY = [
  { name: '성과사회 > 성과주체', p: ['성과사회'], c: ['성과주체'] },
  { name: '성과주체 > 자기 착취', p: ['성과주체'], c: ['자기착취'] },
  { name: '성과주체 > 보상', p: ['성과주체'], c: ['보상'] },
  { name: '성과주체 > 나르시스', p: ['성과주체'], c: ['나르시스'] },
  { name: '성과사회 > 우울증', p: ['성과사회'], c: ['우울증'] },
  { name: '분노 > 짜증', p: ['분노'], c: ['짜증'] },
  { name: '깊은 피로 > 고독한 피로', p: ['깊은피로'], c: ['고독한피로', '성과사회의피로', '분열'] },
  { name: '후기근대적 자아 > 능률', p: ['성격없는', '후기근대', '유연한인간'], c: ['능률'] },
];

function score(run) {
  const { nodes, edges = [] } = run.tree;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const concepts = nodes.filter((n) => n.kind === 'concept');
  const sents = nodes.filter((n) => n.kind === 'sentence');
  const blocks = concepts.filter((n) => byId.get(n.parentId)?.kind === 'root' && n.role);
  const roleOf = (n) => { let c = n; while (c) { if (c.role) return c.role; c = byId.get(c.parentId); } return null; };
  const hay = (n) => nrm(`${n.title} ${n.gloss || ''}`);

  // ① 커버 + ② 소속
  let covered = 0, placed = 0, placeable = 0;
  const missing = [], misplaced = [];
  for (const c of CONCEPTS) {
    // 제목 일치 우선 — gloss 는 남의 개념을 나열할 수 있다("신경성 질환" gloss 의 "우울증" 실측)
    const hit = concepts.find((n) => c.syn.some((s) => nrm(n.title).includes(s)))
      || concepts.find((n) => c.syn.some((s) => hay(n).includes(s)))
      || sents.find((n) => c.syn.some((s) => nrm(n.gloss || '').includes(s)));
    if (!hit) { missing.push(c.name); continue; }
    covered++;
    const role = roleOf(hit);
    if (role) {
      placeable++;
      if (c.group.includes(role)) placed++;
      else misplaced.push(`${c.name}(${role}→${c.group[0]})`);
    }
  }
  // ③ 대조
  let contrasts = 0;
  const missedC = [];
  for (const ct of CONTRASTS) {
    const hit = edges.some((e) => {
      if (e.type !== '대조') return false;
      const text = nrm([...(e.pair || []), byId.get(e.a)?.title, byId.get(e.b)?.title].filter(Boolean).join(' '));
      return ct.a.some((s) => text.includes(s)) && ct.b.some((s) => text.includes(s));
    });
    if (hit) contrasts++; else missedC.push(ct.name);
  }
  // ④ 다개념 보존 — m95 개념들이 서로 다른 키워드 아래 살아 있는가
  const m95Sents = sents.filter((n) => String(n.memoId || '').endsWith('-18'));
  const homes = new Set();
  let m95Found = 0;
  for (const s of M95) {
    const hit = m95Sents.find((n) => nrm(`${n.gloss || ''} ${n.title}`).includes(s));
    if (hit) { m95Found++; homes.add(hit.parentId); }
  }
  const ax4 = Math.round((m95Found / M95.length) * (homes.size >= Math.min(m95Found, 2) ? 100 : 50));
  // ⑥ 위계 — 오라클 부모-자식 쌍이 조상-자손으로 재현되는가
  // 블록·fold-back 노드 제외 — 블록 이름("성과주체의 자기 착취")이 부모로 잡히면
  // 블록 소속을 위계로 오인한다. 위계 축은 키워드 간 중첩만 잰다.
  const kws = concepts.filter((n) => !n.role && !n.crossCut);
  const findC = (syn) => kws.find((n) => syn.some((s) => nrm(n.title).includes(s)))
    || kws.find((n) => syn.some((s) => hay(n).includes(s)));
  const isDesc = (aId, bId) => { let c = byId.get(bId); while (c && c.parentId) { if (c.parentId === aId) return true; c = byId.get(c.parentId); } return false; };
  let hier = 0;
  const missedH = [];
  for (const h of HIERARCHY) {
    const pn = findC(h.p), cn = findC(h.c);
    if (pn && cn && pn !== cn && isDesc(pn.id, cn.id)) hier++; else missedH.push(h.name);
  }
  // ⑤ 편성
  const orphanKws = concepts.filter((n) => byId.get(n.parentId)?.kind === 'root' && !n.role && !n.crossCut);
  const kwTotal = concepts.filter((n) => !n.role && !n.crossCut).length || 1;
  const shares = blocks.map((b) => concepts.filter((n) => n.parentId === b.id).length / kwTotal);
  let ax5 = 100;
  const ax5why = [];
  if (blocks.length < 2 || blocks.length > 5) { ax5 -= 40; ax5why.push(`블록 ${blocks.length}개`); }
  if (shares.some((s) => s > 0.6)) { ax5 -= 30; ax5why.push('독식(>60%)'); }
  if (!blocks.some((b) => b.role === '처방')) { ax5 -= 20; ax5why.push('처방 블록 없음'); }
  if (orphanKws.length / kwTotal > 0.15) { ax5 -= 10; ax5why.push(`미배정 ${orphanKws.length}`); }
  ax5 = Math.max(0, ax5);

  // 축별 구조화 레코드가 1급 산출물이다 (BKT-374 0805 인사이트: 대시보드가 축 기준
  // 피벗 뷰(축 선택 → 책×런 매트릭스 → 감점 근거)를 만들려면 점수가 md 산문이 아니라
  // {책, 런, 축, 점수, 근거, 실패 사례} 단위로 나와야 한다). md/콘솔은 사람용 부록.
  const book = '피로사회';
  const records = [
    { axis: '커버', score: Math.round((covered / CONCEPTS.length) * 100), basis: `골든 지도 개념 ${CONCEPTS.length}개 중 ${covered}개 존재`, failures: missing },
    { axis: '소속', score: placeable ? Math.round((placed / placeable) * 100) : 0, basis: `역할 블록 소속 판정 가능 ${placeable}개 중 ${placed}개 일치`, failures: misplaced },
    { axis: '대조', score: Math.round((contrasts / CONTRASTS.length) * 100), basis: `골든 대조 구도 ${CONTRASTS.length}개 중 ${contrasts}개 재현`, failures: missedC },
    { axis: '다개념', score: ax4, basis: `m95 개념 ${m95Found}/${M95.length} 보존 · 거처 ${homes.size}곳`, failures: M95.filter((s) => !m95Sents.some((n) => nrm(`${n.gloss || ''} ${n.title}`).includes(s))) },
    { axis: '편성', score: ax5, basis: `블록 ${blocks.length}개 · 최대 점유 ${Math.round((Math.max(0, ...shares)) * 100)}% · 미배정 ${orphanKws.length}`, failures: ax5why },
    { axis: '위계', score: Math.round((hier / HIERARCHY.length) * 100), basis: `오라클 부모-자식 ${HIERARCHY.length}쌍 중 ${hier}쌍 조상-자손 재현`, failures: missedH },
  ].map((r) => ({ book, run: null, ...r })); // run 라벨은 호출부가 채운다
  const total = Math.round(records.reduce((a, r) => a + r.score, 0) / records.length);
  return { records, total };
}

const { writeFile } = await import('node:fs/promises');
for (const p of process.argv.slice(2)) {
  const run = JSON.parse(await readFile(resolve(__dir, p), 'utf-8'));
  const r = score(run);
  r.records.forEach((x) => { x.run = run.label; });
  const out = { kind: 'map-match-v12', book: '피로사회', run: run.label, scoredAt: new Date().toISOString(), total: r.total, records: r.records };
  await writeFile(resolve(__dir, `runs/mapmatch-${run.label}.json`), JSON.stringify(out, null, 2));
  console.log(`\n■ ${run.label} — 총점 ${r.total} | ${r.records.map((x) => `${x.axis} ${x.score}`).join(' · ')}`);
  for (const x of r.records) if (x.failures.length) console.log(`  ${x.axis} 실패: ${x.failures.join(' / ')}`);
  console.log(`  → runs/mapmatch-${run.label}.json`);
}
