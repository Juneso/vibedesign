// 지도 일치 채점 v13 (BKT-380 0808 "채점까지 개편하자") — 스펙 파일 기반 다책 채점.
// v12 와 다른 점:
//  · 골든이 코드 내장 테이블이 아니라 golden/mapmatch-spec-<책>.json — 책이 늘면 스펙만 추가
//  · ⑦ 중요도 축 신설 — high 개념은 트리에서 키워드로 두드러지고(존재+비강등),
//    low 개념은 강등·부재여야 하며, order 쌍은 노드 salience 점수 순서가 정답 순서와 일치
//  · ② 소속 — 블록이 없는 트리(구조 예산 생략)에서는 채점 불가가 0점이 아니라 축 제외.
//    소량 메모에서 "블록을 안 만든 것"이 정답이기 때문이다 (0808 준서: 재료 부족 시
//    배경·진단·처방으로 묶는 게 위험)
//  · ⑤ 편성 — 블록 있는 트리는 v12 규칙 그대로, 블록 없는 트리는 소량 모드:
//    뿌리 직속 2~9개 · 한 키워드 독식 없음 (억지 블록 생성은 여기서 감점)
//  · 총점 = 채점된 축들의 평균 (제외 축은 분모에서 빠진다)
//
// 사용: [SPEC=golden/mapmatch-spec-넥서스.json] node evalMapMatchV13.mjs runs/hier-v12-*.json ...

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const N = (s) => String(s || '').normalize('NFC');
const nrm = (s) => N(s).replace(/\s+/g, '').toLowerCase();

const spec = JSON.parse(await readFile(resolve(__dir, process.env.SPEC || 'golden/mapmatch-spec-피로사회.json'), 'utf-8'));

function score(run) {
  const { nodes, edges = [] } = run.tree;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const concepts = nodes.filter((n) => n.kind === 'concept');
  const sents = nodes.filter((n) => n.kind === 'sentence');
  const blocks = concepts.filter((n) => byId.get(n.parentId)?.kind === 'root' && n.role);
  const roleOf = (n) => { let c = n; while (c) { if (c.role) return c.role; c = byId.get(c.parentId); } return null; };
  const hay = (n) => nrm(`${n.title} ${n.gloss || ''}`);
  const kws = concepts.filter((n) => !n.role && !n.crossCut);
  const findKw = (syn) => kws.find((n) => syn.some((s) => nrm(n.title).includes(s)))
    || kws.find((n) => syn.some((s) => hay(n).includes(s)));

  // ① 커버 + ② 소속
  let covered = 0, placed = 0, placeable = 0;
  const missing = [], misplaced = [];
  for (const c of spec.concepts) {
    const hit = concepts.find((n) => c.syn.some((s) => nrm(n.title).includes(s)))
      || concepts.find((n) => c.syn.some((s) => hay(n).includes(s)))
      || sents.find((n) => c.syn.some((s) => nrm(n.gloss || '').includes(s)));
    if (!hit) { missing.push(c.name); continue; }
    covered++;
    if (!blocks.length || !c.group?.length) continue; // 블록 없는 트리·역할 무관 개념은 소속 채점 제외
    const role = roleOf(hit);
    if (role) {
      placeable++;
      if (c.group.includes(role)) placed++;
      else misplaced.push(`${c.name}(${role}→${c.group[0]})`);
    }
  }

  // ③ 대조 — 엣지 또는 대조축 노드로 재현
  let contrasts = 0;
  const missedC = [];
  for (const ct of spec.contrasts) {
    const inEdge = edges.some((e) => {
      if (e.type !== '대조') return false;
      const text = nrm([...(e.pair || []), byId.get(e.a)?.title, byId.get(e.b)?.title].filter(Boolean).join(' '));
      return ct.a.some((s) => text.includes(s)) && ct.b.some((s) => text.includes(s));
    });
    const inAxis = concepts.some((n) => n.relation === '대조축'
      && ct.a.some((s) => nrm(n.title).includes(s)) && ct.b.some((s) => nrm(n.title).includes(s)));
    if (inEdge || inAxis) contrasts++; else missedC.push(ct.name);
  }

  // ④ 다개념 보존
  let ax4 = null, m95Found = 0, homes = new Set(), multiFail = [];
  if (spec.multi) {
    const mSents = sents.filter((n) => String(n.memoId || '').endsWith(spec.multi.memoSuffix));
    for (const s of spec.multi.concepts) {
      const hit = mSents.find((n) => nrm(`${n.gloss || ''} ${n.title}`).includes(nrm(s)));
      if (hit) { m95Found++; homes.add(hit.parentId); } else multiFail.push(s);
    }
    ax4 = Math.round((m95Found / spec.multi.concepts.length) * (homes.size >= Math.min(m95Found, 2) ? 100 : 50));
  }

  // ⑥ 위계
  const isDesc = (aId, bId) => { let c = byId.get(bId); while (c && c.parentId) { if (c.parentId === aId) return true; c = byId.get(c.parentId); } return false; };
  let hier = 0;
  const missedH = [];
  for (const h of spec.hierarchy) {
    const pn = findKw(h.p), cn = findKw(h.c);
    if (pn && cn && pn !== cn && isDesc(pn.id, cn.id)) hier++; else missedH.push(h.name);
  }

  // ⑤ 편성 — 블록 유무로 모드 분기
  const orphanKws = concepts.filter((n) => byId.get(n.parentId)?.kind === 'root' && !n.role && !n.crossCut);
  const kwTotal = kws.length || 1;
  let ax5 = 100;
  const ax5why = [];
  let ax5basis;
  if (blocks.length) {
    const shares = blocks.map((b) => concepts.filter((n) => n.parentId === b.id).length / kwTotal);
    if (blocks.length < 2 || blocks.length > 5) { ax5 -= 40; ax5why.push(`블록 ${blocks.length}개`); }
    if (shares.some((s) => s > 0.6)) { ax5 -= 30; ax5why.push('독식(>60%)'); }
    if (!blocks.some((b) => b.role === '처방')) { ax5 -= 20; ax5why.push('처방 블록 없음'); }
    if (orphanKws.length / kwTotal > 0.15) { ax5 -= 10; ax5why.push(`미배정 ${orphanKws.length}`); }
    ax5basis = `블록 모드: ${blocks.length}개 · 미배정 ${orphanKws.length}`;
  } else {
    // 소량 모드 — 블록이 없어야 정답인 트리. 뿌리 직속이 과다·과소하지 않고 독식이 없는가
    const rootKids = nodes.filter((n) => byId.get(n.parentId)?.kind === 'root');
    const kidSents = rootKids.map((k) => sents.filter((s2) => isDesc(k.id, s2.id)).length);
    const totalS = sents.length || 1;
    if (rootKids.length < 2 || rootKids.length > 9) { ax5 -= 40; ax5why.push(`뿌리 직속 ${rootKids.length}개`); }
    if (kidSents.some((c) => c / totalS > 0.7)) { ax5 -= 30; ax5why.push('독식(>70%)'); }
    ax5basis = `소량 모드(블록 0): 뿌리 직속 ${rootKids.length}개`;
  }
  ax5 = Math.max(0, ax5);

  // ⑦ 중요도 — high 존재·비강등 / low 강등·부재 / order 쌍 점수 순서
  const imp = spec.importance || { high: [], low: [], order: [] };
  let impOk = 0, impTotal = 0;
  const impFail = [];
  for (const h of imp.high) {
    impTotal++;
    const n = findKw(h.syn);
    if (n) impOk++; else impFail.push(`${h.name} 키워드 부재`);
  }
  for (const l of imp.low) {
    impTotal++;
    const n = kws.find((n2) => l.syn.some((s) => nrm(n2.title).includes(s)));
    if (!n) impOk++; else impFail.push(`${l.name} 키워드로 잔존(강등돼야)`);
  }
  for (const o of imp.order) {
    const a = findKw(o.a), b = findKw(o.b);
    if (!a || !b) continue; // 한쪽이 없으면 순서 판정 불가 — 존재 항목이 이미 잰다
    if (typeof a.score !== 'number' || typeof b.score !== 'number') continue;
    impTotal++;
    if (a.score > b.score) impOk++;
    else impFail.push(`순서 역전: ${a.title}(${a.score}) ≤ ${b.title}(${b.score})`);
  }
  const ax7 = impTotal ? Math.round((impOk / impTotal) * 100) : null;

  const records = [
    { axis: '커버', score: Math.round((covered / spec.concepts.length) * 100), basis: `골든 개념 ${spec.concepts.length}개 중 ${covered}개 존재`, failures: missing },
    { axis: '소속', score: blocks.length && placeable ? Math.round((placed / placeable) * 100) : null, basis: blocks.length ? `역할 판정 가능 ${placeable}개 중 ${placed}개 일치` : '블록 없음 — 축 제외 (소량 모드 정답)', failures: misplaced },
    { axis: '대조', score: spec.contrasts.length ? Math.round((contrasts / spec.contrasts.length) * 100) : null, basis: `골든 대조 ${spec.contrasts.length}개 중 ${contrasts}개 재현(엣지 또는 대조축 노드)`, failures: missedC },
    { axis: '다개념', score: ax4, basis: spec.multi ? `다개념 메모 ${m95Found}/${spec.multi.concepts.length} 보존 · 거처 ${homes.size}곳` : '스펙 없음 — 축 제외', failures: multiFail },
    { axis: '편성', score: ax5, basis: ax5basis, failures: ax5why },
    { axis: '위계', score: spec.hierarchy.length ? Math.round((hier / spec.hierarchy.length) * 100) : null, basis: `골든 부모-자식 ${spec.hierarchy.length}쌍 중 ${hier}쌍 재현`, failures: missedH },
    { axis: '중요도', score: ax7, basis: `high 존재·low 강등·순서쌍 ${impTotal}판정 중 ${impOk} 정답`, failures: impFail },
  ].map((r) => ({ book: spec.book, run: null, ...r }));
  const scored = records.filter((r) => r.score !== null);
  const total = Math.round(scored.reduce((a, r) => a + r.score, 0) / (scored.length || 1));
  return { records, total };
}

for (const p of process.argv.slice(2)) {
  const run = JSON.parse(await readFile(resolve(__dir, p), 'utf-8'));
  const r = score(run);
  r.records.forEach((x) => { x.run = run.label; });
  const out = { kind: 'map-match-v13', book: spec.book, run: run.label, scoredAt: new Date().toISOString(), total: r.total, records: r.records };
  await writeFile(resolve(__dir, `runs/mapmatch13-${run.label}.json`), JSON.stringify(out, null, 2));
  console.log(`\n■ v13 ${run.label} [${spec.book}] — 총점 ${r.total} | ${r.records.map((x) => `${x.axis} ${x.score ?? '–'}`).join(' · ')}`);
  for (const x of r.records) if (x.failures.length) console.log(`  ${x.axis} 실패: ${x.failures.join(' / ')}`);
  console.log(`  → runs/mapmatch13-${run.label}.json`);
}
