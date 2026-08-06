// hier-ingest v12 조립 — 주장 단위 (BKT-342 · docs/hier-v12-lift-design.md B절).
//
// v11 과의 차이: 입력이 메모가 아니라 lift 가 뽑은 **주장**이다. 한 메모의 주장들이
// 서로 다른 가지로 갈 수 있다(보완점 ⑦ — m95 나르시스·슬픔·리비도 증발의 해법).
// 구조 판정은 lift 에서 이미 끝났으므로 조립의 LLM 콜은 역할 블록 1콜 + fold-back 1콜뿐:
// - 역할 블록: 전개 방식 분포로 최상위 편성 (통념 반박·문답=문제의식, 인과·분석=진단, …)
// - 대조 엣지: lift 슬롯의 쌍을 그대로 1:1 엣지로 — 트리 위 재판정 콜 삭제 (보완점 ③)
// - 패러프레이즈 승격: 표제어 클러스터 2회 이상 → 키워드. 자구 2회 규칙 대체, LLM 0콜 (보완점 ⑥)
// - 깊이: 주장 밀도 따라 자연 비대칭 — 규칙 처리, LLM 0콜 (보완점 ⑤)
//
// 개발 루프(API 0원): embedFn 없이 돌리면 승격은 정규화 자구 일치만, fold-back 은 스킵.
// 임베딩·실 LLM 은 3단계(claude -p transport)부터 붙는다.

import { normalizeLift } from './liftV12.mjs';

const N = (s) => String(s || '').normalize('NFC');
const nrm = (s) => N(s).replace(/\s+/g, '').toLowerCase();
const cos = (a, b) => { let s = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return s / (Math.sqrt(x) * Math.sqrt(y) || 1); };

// 역할 블록 어휘 — 전개 방식이 역할의 신호다 (설계 B-역할 블록)
export const BLOCK_ROLES = ['문제의식', '배경', '진단', '처방', '기타'];
const ROLE_SIGNAL = '통념 반박·문답 계열 주장 → 문제의식 / 시대·사회의 이행을 서술하는 주장 → 배경 / 인과·분석 계열 주장 → 진단 / 중단·회복·해결을 말하는 주장 → 처방';

// 같은 개념으로 묶는 임베딩 문턱. 승격(같은 키워드)은 보수적으로, fold-back 후보(묶는
// 개념일지도)는 느슨하게 — 느슨한 쪽은 LLM 판정이 한 번 더 거른다.
const CLUSTER_MIN = 0.78;
const FOLD_MIN = 0.6;

export async function assembleV12({ book, lifts, llm, embedFn, onProgress }) {
  const log = [];
  let llmCalls = 0;

  // ── 0) 주장 평탄화 — lift 스키마 재검증을 겸한다 ──────────────
  const claims = [];
  for (const l of lifts) {
    const { lift, warnings } = normalizeLift(l, { memoId: l.memoId });
    warnings.forEach((w) => log.push(`[v12⚠] lift 검증: ${w}`));
    for (const c of lift.claims) claims.push({ ...c, memoId: lift.memoId, p: l.p, key: `${lift.memoId}#${c.id}` });
  }
  log.push(`[v12] 입력: 메모 ${lifts.length}건 → 주장 ${claims.length}개 (조립 입력 = 주장)`);

  // ── 1) 패러프레이즈 승격 — 표제어 클러스터, LLM 0콜 ──────────
  // "표현 달라도 같은 개념" 2회 이상이면 키워드 승격 (자구 2회 규칙 대체).
  // embedFn 없으면 정규화 자구 일치만으로 묶는다(개발 루프 0원 폴백).
  onProgress?.('v12 — 표제어 클러스터');
  const clusters = []; // { id, rep, headwords:Set, claims:[], emb }
  for (const c of claims) {
    let hit = clusters.find((k) => k.headwords.has(nrm(c.headword)));
    if (!hit && embedFn) {
      const e = await embedFn(`${c.headword}: ${c.claim.slice(0, 120)}`);
      let best = null, bs = 0;
      for (const k of clusters) { if (!k.emb) continue; const s = cos(e, k.emb); if (s > bs) { bs = s; best = k; } }
      if (best && bs >= CLUSTER_MIN) { hit = best; log.push(`[v12] 패러프레이즈 병합: "${c.headword}" → "${hit.rep}" (cos ${bs.toFixed(2)})`); }
      c._emb = e;
    }
    if (hit) { hit.claims.push(c); hit.headwords.add(nrm(c.headword)); }
    else clusters.push({ id: `k${clusters.length}`, rep: c.headword, headwords: new Set([nrm(c.headword)]), claims: [c], emb: c._emb || null });
  }
  const promoted = clusters.filter((k) => k.claims.length >= 2);
  log.push(`[v12] 클러스터 ${clusters.length}개 · 승격(2회 이상) ${promoted.length}개: ${promoted.map((k) => `${k.rep}(${k.claims.length})`).join(' · ') || '(없음)'}${embedFn ? '' : ' — 임베딩 없음: 자구 일치만'}`);

  // ── 2) 역할 블록 편성 — LLM 1콜 ──────────────────────────────
  // 전개 방식 분포가 신호. 대장 1개 독식 금지(보완점 ①②)는 코드가 사후 검사한다.
  onProgress?.('v12 — 역할 블록 편성');
  const devLine = (k) => {
    const d = {}; for (const c of k.claims) for (const x of c.devices) d[x] = (d[x] || 0) + 1;
    return Object.entries(d).sort((a, b) => b[1] - a[1]).map(([x, n]) => (n > 1 ? `${x}×${n}` : x)).join(',');
  };
  const clusterLine = clusters.map((k) =>
    `${k.id} | ${k.rep} — 주장 ${k.claims.length}개 · 방식: ${devLine(k)} · 대표: ${k.claims[0].claim.slice(0, 60)}`).join('\n');
  const blockRaw = await llm({
    system: `주장 키워드들을 책의 역할 블록으로 편성한다. 블록은 "이 키워드들이 책의 논지에서 맡는 역할"의 묶음이다 — 신호: ${ROLE_SIGNAL}.
블록은 2~5개. name 은 이 책의 실제 내용을 가리키는 짧은 명사구, role 은 ${BLOCK_ROLES.join('|')} 중 하나. 모든 키워드를 어느 한 블록에 배정하라(한 키워드는 한 블록에만). 한 블록이 전체를 독식하면 안 된다 — 역할이 정말 갈리는 지점에서 나눠라. JSON만 출력.`,
    user: `책: ${book.title}${book.author ? ` (${book.author})` : ''}

[주장 키워드 — 전개 방식 분포 포함]
${clusterLine}

출력 JSON: {"blocks":[{"name":"블록 이름","role":"${BLOCK_ROLES.join('|')}","memberIds":["k0"],"why":"이 묶음이 이 역할인 이유 한 줄"}]}`,
    temperature: 0.1,
  });
  llmCalls++;
  let blocksJ = []; try { blocksJ = JSON.parse(blockRaw).blocks || []; } catch { log.push('[v12✗] 역할 블록 파싱 실패 — 전부 미배정'); }

  // memberIds 는 id 우선, 표제어로도 받아 준다(수동 픽스처·모델 편차 견딤)
  const byIdOrHead = (t) => clusters.find((k) => k.id === t) || clusters.find((k) => k.headwords.has(nrm(t)) || nrm(k.rep) === nrm(t));
  const assigned = new Set();
  const blocks = [];
  for (const b of blocksJ) {
    const members = (b.memberIds || []).map(byIdOrHead).filter((k) => k && !assigned.has(k.id));
    if (!members.length) { log.push(`[v12✗] 블록 "${b.name}" 무산 — 배정 키워드 없음`); continue; }
    members.forEach((k) => assigned.add(k.id));
    blocks.push({ name: String(b.name || '').trim() || b.role, role: BLOCK_ROLES.includes(b.role) ? b.role : '기타', why: String(b.why || '').trim(), members });
  }
  const orphans = clusters.filter((k) => !assigned.has(k.id));
  if (orphans.length) log.push(`[v12⚠] 미배정 키워드 ${orphans.length}개 → 뿌리 직속: ${orphans.map((k) => k.rep).join(' · ')}`);
  // 독식 검사 — 하드 컷 대신 경고. 개수 상한으로 조이면 멀쩡한 구조까지 깎인다(v11 실측 교훈).
  for (const b of blocks) {
    const share = b.members.length / clusters.length;
    if (blocks.length > 1 && share > 0.6) log.push(`[v12⚠] 블록 "${b.name}" 이 키워드 ${Math.round(share * 100)}% 독식 — 재편 검토 대상`);
  }
  log.push(`[v12] 역할 블록 ${blocks.length}개: ${blocks.map((b) => `${b.name}(${b.role}·${b.members.length})`).join(' · ')}`);

  // ── 3) 트리 구성: root → 블록 → 키워드 → 주장 ────────────────
  // 깊이는 주장 밀도가 만든다(보완점 ⑤): 주장 5개 이상 키워드만 주 전개 방식별로 한 단 더.
  let SEQ = 0; const id = () => `n${++SEQ}`;
  const nodes = new Map();
  const root = { id: id(), title: book.title, parentId: null, level: 0, kind: 'root', sources: [] };
  nodes.set(root.id, root);
  const add = (n) => { nodes.set(n.id, n); return n; };
  const claimNode = (c, parent) => {
    const n = add({ id: id(), title: c.claim, parentId: parent.id, level: parent.level + 1, kind: 'sentence', sources: c.p != null ? [c.p] : [], gloss: c.headword, memoId: c.memoId, claimKey: c.key, devices: c.devices, confidence: c.confidence });
    let a = parent; while (a && a.kind !== 'root') { if (c.p != null && !a.sources.includes(c.p)) a.sources.push(c.p); a = nodes.get(a.parentId); }
    return n;
  };
  const kwNode = (k, parent) => {
    const kw = add({ id: id(), title: k.rep, parentId: parent.id, level: parent.level + 1, kind: 'concept', sources: [], gloss: k.claims[0].claim.slice(0, 160), promoted: k.claims.length >= 2, clusterId: k.id });
    k.nodeId = kw.id;
    if (k.claims.length >= 5) {
      // 밀도 깊이: 주 전개 방식별 하위 묶음 — 규칙 처리, LLM 0콜
      const groups = new Map();
      for (const c of k.claims) { const g = c.devices[0] || '기타'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
      for (const [g, cs] of groups) {
        const gp = cs.length >= 2 ? add({ id: id(), title: `${k.rep} — ${g}`, parentId: kw.id, level: kw.level + 1, kind: 'concept', sources: [], relation: g }) : kw;
        cs.forEach((c) => claimNode(c, gp));
      }
    } else k.claims.forEach((c) => claimNode(c, kw));
    return kw;
  };
  for (const b of blocks) {
    const bn = add({ id: id(), title: b.name, parentId: root.id, level: 1, kind: 'concept', role: b.role, sources: [], gloss: b.why });
    b.members.forEach((k) => kwNode(k, bn));
  }
  orphans.forEach((k) => kwNode(k, root));

  // ── 4) 대조 엣지 — lift 슬롯의 쌍을 그대로 엣지로, LLM 0콜 ────
  // 재판정하지 않는다(보완점 ③). 쌍의 문면이 다른 클러스터 표제어와 겹치면 클러스터 간
  // 엣지로 해석하고, 아니면 주장 단위 엣지로 남긴다 — 한 문장 안에서 완결되는 대조가 흔하다.
  const edges = [];
  const clusterOf = (c) => clusters.find((k) => k.claims.includes(c));
  // 쌍의 문면은 "이름 — 설명" 꼴이다. 이름부만 보고, 정확 일치 또는 4자 이상 표제어의
  // 포함일 때만 클러스터로 해석한다 — "면역학적 타자의 부정성"이 '부정성'(3자) 클러스터로
  // 끌려가던 과잉 매칭 실측의 방지.
  const findByText = (text, exclude) => {
    const name = nrm(N(text).split('—')[0]);
    return clusters.find((k) => k !== exclude && [...k.headwords].some((h) =>
      h === name || (h.length >= 4 && name.includes(h))));
  };
  for (const c of claims) {
    const s = c.slots?.['대조']; if (!s) continue;
    const a = clusterOf(c);
    const bSide = s.pair.map((t) => findByText(t, a)).find(Boolean) || null;
    edges.push({ type: '대조', axis: s.axis, pair: s.pair, claimKey: c.key, a: a?.nodeId || null, b: bSide?.nodeId || null });
  }
  log.push(`[v12] 대조 엣지 ${edges.length}개 (lift 슬롯 그대로 · 재판정 0콜) — 클러스터 간 해석 ${edges.filter((e) => e.b).length}개`);

  // ── 4.5) 키워드 위계 — 큰 맥을 부모로, 슬롯 신호로 자식 매달기 (0806 준서 판정) ──
  // "우울증·성과사회·성과주체라는 큰 맥이 분명하니 그걸 부모로 하고 상세를 하위로."
  // lift 슬롯을 그대로 재사용하는 규칙 처리 — LLM 0콜. 같은 블록 안에서만 중첩한다
  // (블록을 넘는 관계는 엣지로 남긴다 — 슬픔↔우울증처럼).
  {
    const blockOfC = new Map();
    for (const b of blocks) for (const k of b.members) blockOfC.set(k.id, b);
    const weight = (k) => k.claims.length;
    const nodeC = (k) => nodes.get(k.nodeId);
    const isAnc = (aId, bId) => { let c = nodes.get(bId); while (c && c.parentId) { if (c.parentId === aId) return true; c = nodes.get(c.parentId); } return false; };
    const relevel = (nid) => { const x = nodes.get(nid); x.level = nodes.get(x.parentId).level + 1; for (const ch of nodes.values()) if (ch.parentId === nid) relevel(ch.id); };
    const nested = [];
    const nest = (child, parent, why) => {
      if (!child || !parent || child === parent) return;
      if (blockOfC.get(child.id) !== blockOfC.get(parent.id)) return;           // 블록 밖 이동 금지
      const cn = nodeC(child), pn = nodeC(parent);
      if (!cn || !pn || cn.parentId !== blockOfC.get(child.id) && nodes.get(cn.parentId)?.kind !== 'concept') return;
      if (nodes.get(cn.parentId)?.clusterId) return;                            // 이미 중첩됐으면 유지 (첫 신호 우선)
      if (isAnc(cn.id, pn.id)) return;                                          // 순환 방지
      if (weight(child) > weight(parent)) return;                               // 큰 맥이 밑으로 가는 역전 금지
      cn.parentId = pn.id; relevel(cn.id);
      nested.push(`${child.rep} → ${parent.rep}(${why})`);
    };
    const byHeadIn = (text, exclude) => findByText(text, exclude);
    for (const k of clusters) for (const c of k.claims) {
      // 대조: 반대개념은 참조된 쪽 아래로 (준서 지도의 "짜증 — 분노의 반대개념" 동형)
      const ct = c.slots?.['대조'];
      if (ct) { const other = ct.pair.map((t) => byHeadIn(t, k)).find(Boolean); if (other) nest(k, other, '대조'); }
      // 인과: 사슬 항목이 다른 키워드면 그중 가장 큰 맥 아래로
      const ch = c.slots?.['인과'];
      if (ch) {
        const hits = ch.chain.map((t) => byHeadIn(t, k)).filter(Boolean);
        const big = hits.sort((a, b) => weight(b) - weight(a))[0];
        if (big) nest(k, big, '인과');
      }
      // 예시·분석·정의: 대상(of/concept)이 다른 키워드면 그 밑으로
      for (const rel of ['예시', '분석', '정의']) {
        const s = c.slots?.[rel]; if (!s) continue;
        const target = byHeadIn(s.of || s.concept || '', k);
        if (target) nest(k, target, rel);
      }
    }
    if (nested.length) log.push(`[v12] 키워드 위계 ${nested.length}건: ${nested.join(' · ')}`);
    else log.push('[v12] 키워드 위계 신호 없음 — 평면 유지');
  }

  // ── 5) fold-back — 여러 블록에 걸친 느슨한 클러스터를 후보로 1콜 (보완점 ④) ──
  // 준서 골든 관찰: 능률·경제 효율·생산 증대는 펼친 맵을 거꾸로 "묶는" 개념이 된다.
  if (embedFn && llm) {
    onProgress?.('v12 — fold-back 판정');
    const blockOf = (k) => blocks.find((b) => b.members.includes(k));
    const cand = [];
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i], b = clusters[j];
      if (!a.emb || !b.emb || blockOf(a) === blockOf(b)) continue;
      const s = cos(a.emb, b.emb);
      if (s >= FOLD_MIN && s < CLUSTER_MIN) cand.push({ a, b, s });
    }
    if (cand.length) {
      const foldRaw = await llm({
        system: '서로 다른 역할 블록에 흩어진 키워드 쌍들이 "하나의 묶는 개념"으로 접히는지 판정한다. 묶는 개념은 흩어진 키워드들을 관통하는 상위 원리다(예: 능률·경제 효율·생산 증대 → "경제적 능률"). 정말 관통할 때만 fold 를 내라 — 주제가 이웃인 것으로는 부족하다. JSON만 출력.',
        user: `책: ${book.title}\n\n[후보 쌍 — 코사인 유사도 순]\n${cand.sort((x, y) => y.s - x.s).slice(0, 12).map((x) => `- ${x.a.rep} ↔ ${x.b.rep} (${x.s.toFixed(2)})`).join('\n')}\n\n출력 JSON: {"folds":[{"name":"묶는 개념 이름","members":["표제어"],"why":"한 줄"}]}`,
        temperature: 0.1,
      });
      llmCalls++;
      try {
        for (const f of (JSON.parse(foldRaw).folds || [])) {
          const ms = (f.members || []).map((t) => byIdOrHead(t)).filter(Boolean);
          if (ms.length < 2) continue;
          const fn = add({ id: id(), title: String(f.name).trim(), parentId: root.id, level: 1, kind: 'concept', crossCut: true, sources: [], gloss: String(f.why || '').trim() });
          ms.forEach((k) => edges.push({ type: 'fold-back', a: fn.id, b: k.nodeId }));
          log.push(`[v12] fold-back "${fn.title}" ← ${ms.map((k) => k.rep).join(' · ')}`);
        }
      } catch { log.push('[v12✗] fold-back 파싱 실패 — 스킵'); }
    } else log.push('[v12] fold-back 후보 없음');
  } else log.push('[v12] fold-back 스킵 — 임베딩 없음(개발 루프 0원 모드)');

  const lowConf = claims.filter((c) => c.confidence === 'low' || c.confidence === 'med');
  return {
    nodes, rootId: root.id, edges, log, llmCalls,
    counts: {
      memos: lifts.length, claims: claims.length, clusters: clusters.length,
      promoted: promoted.length, blocks: blocks.length, orphans: orphans.length,
      contrastEdges: edges.filter((e) => e.type === '대조').length,
      escalation: lowConf.map((c) => `${c.key}(${c.confidence})`),
    },
  };
}

// 직렬화 — hierEngine.serializeTree 와 같은 형태 + 엣지
export function serializeV12({ nodes, rootId, edges }) {
  return { rootId, nodes: [...nodes.values()].map(({ emb, ...rest }) => rest), edges };
}
