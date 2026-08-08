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

// salience: computeSalience 결과(ranked). 점수가 룰 문턱 더미를 대체한다(0808 준서 설계):
// 방향(낮은 점수 → 높은 점수 밑으로) · 강등(바닥 점수 개념은 키워드 승격 금지) ·
// 대조 축 승격(양변 다 중요한 대조만 구조로) · 구조 예산(재료가 적으면 블록 생략).
// aliasMap: nrm(이름) → 핵심 개념 이름 — 별칭·측면 귀속(salience 런 산출)을 클러스터
// 병합에도 적용한다. 합성 표제어 뽑기("자율적 컴퓨터의 네트워크 구조 영향")가 핵심
// 개념(컴퓨터) 하나로 합쳐진다 (0808 준서: 의미 동일 개념 파악이 최우선).
export async function assembleV12({ book, lifts, llm, embedFn, onProgress, salience = [], aliasMap = new Map() }) {
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
  const coreOf = (name) => aliasMap.get(nrm(name)) || null;
  for (const c of claims) {
    const core = coreOf(c.headword);
    let hit = clusters.find((k) => k.headwords.has(nrm(c.headword)) || (core && nrm(k.rep) === nrm(core)));
    if (!hit && core) {
      hit = clusters.find((k) => coreOf(k.rep) && nrm(coreOf(k.rep)) === nrm(core));
      if (hit) { hit.rep = core; log.push(`[v12] 별칭 병합: "${c.headword}" ≈ "${core}"`); }
    }
    if (!hit && embedFn) {
      const e = await embedFn(`${c.headword}: ${c.claim.slice(0, 120)}`);
      let best = null, bs = 0;
      for (const k of clusters) { if (!k.emb) continue; const s = cos(e, k.emb); if (s > bs) { bs = s; best = k; } }
      if (best && bs >= CLUSTER_MIN) { hit = best; log.push(`[v12] 패러프레이즈 병합: "${c.headword}" → "${hit.rep}" (cos ${bs.toFixed(2)})`); }
      c._emb = e;
    }
    if (hit) { hit.claims.push(c); hit.headwords.add(nrm(c.headword)); if (core && nrm(hit.rep) !== nrm(core) && coreOf(hit.rep)) hit.rep = core; }
    else clusters.push({ id: `k${clusters.length}`, rep: c.headword, headwords: new Set([nrm(c.headword)]), claims: [c], emb: c._emb || null });
  }
  // salience 점수 부착 — 이름·별칭 매칭, 미상은 중간값(0.25)
  const salN = salience.map((r) => ({ n: nrm(r.concept), score: r.score }));
  const scoreOf = (k) => {
    let best = 0.25;
    for (const n of [nrm(k.rep), ...k.headwords]) {
      const hit = salN.find((x) => x.n === n) || salN.find((x) => n.length >= 2 && (x.n.includes(n) || n.includes(x.n)));
      if (hit) { best = hit.score; break; }
    }
    return best;
  };
  for (const k of clusters) k.score = salience.length ? scoreOf(k) : 0.5;
  // 강등 — 바닥 점수 + 단발 개념은 키워드로 세우지 않는다(신조어·의식류). 주장은 같은
  // 메모의 최고점 키워드 밑에 문장으로 붙는다(gloss 에 표제어가 남아 커버는 유지).
  const DEMOTE = 0.08;
  const demoted = salience.length ? clusters.filter((k) => k.score < DEMOTE && k.claims.length === 1) : [];
  for (const k of demoted) clusters.splice(clusters.indexOf(k), 1);
  if (demoted.length) log.push(`[v12] 강등 ${demoted.length}개(점수<${DEMOTE}): ${demoted.map((k) => `${k.rep}(${k.score})`).join(' · ')}`);

  const promoted = clusters.filter((k) => k.claims.length >= 2);
  log.push(`[v12] 클러스터 ${clusters.length}개 · 승격(2회 이상) ${promoted.length}개: ${promoted.map((k) => `${k.rep}(${k.claims.length})`).join(' · ') || '(없음)'}${embedFn ? '' : ' — 임베딩 없음: 자구 일치만'}`);

  // ── 2) 역할 블록 편성 — LLM 1콜 ──────────────────────────────
  // 전개 방식 분포가 신호. 대장 1개 독식 금지(보완점 ①②)는 코드가 사후 검사한다.
  // 구조 예산 (0808 준서: "메모가 부족할 땐 논지·개념 정리에 집중") — 주장이 적으면
  // 역할 블록을 세우지 않는다. 5메모에 배경·진단·처방을 강제하던 넥서스 실측의 처방.
  const BLOCK_MIN_CLAIMS = 15;
  const skipBlocks = claims.length < BLOCK_MIN_CLAIMS;
  if (skipBlocks) log.push(`[v12] 구조 예산: 주장 ${claims.length} < ${BLOCK_MIN_CLAIMS} — 역할 블록 생략, 개념·파렌팅·대조 중심 평면`);
  onProgress?.('v12 — 역할 블록 편성');
  const devLine = (k) => {
    const d = {}; for (const c of k.claims) for (const x of c.devices) d[x] = (d[x] || 0) + 1;
    return Object.entries(d).sort((a, b) => b[1] - a[1]).map(([x, n]) => (n > 1 ? `${x}×${n}` : x)).join(',');
  };
  const clusterLine = clusters.map((k) =>
    `${k.id} | ${k.rep} — 주장 ${k.claims.length}개 · 방식: ${devLine(k)} · 대표: ${k.claims[0].claim.slice(0, 60)}`).join('\n');
  const blockRaw = skipBlocks ? '{"blocks":[]}' : await llm({
    system: `주장 키워드들을 책의 역할 블록으로 편성한다. 블록은 "이 키워드들이 책의 논지에서 맡는 역할"의 묶음이다 — 신호: ${ROLE_SIGNAL}.
블록은 2~5개. name 은 이 책의 실제 내용을 가리키는 짧은 명사구, role 은 ${BLOCK_ROLES.join('|')} 중 하나. 모든 키워드를 어느 한 블록에 배정하라(한 키워드는 한 블록에만). 한 블록이 전체를 독식하면 안 된다 — 역할이 정말 갈리는 지점에서 나눠라. JSON만 출력.`,
    user: `책: ${book.title}${book.author ? ` (${book.author})` : ''}

[주장 키워드 — 전개 방식 분포 포함]
${clusterLine}

출력 JSON: {"blocks":[{"name":"블록 이름","role":"${BLOCK_ROLES.join('|')}","memberIds":["k0"],"why":"이 묶음이 이 역할인 이유 한 줄"}]}`,
    temperature: 0.1,
  });
  if (!skipBlocks) llmCalls++;
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
  if (orphans.length && !skipBlocks) log.push(`[v12⚠] 미배정 키워드 ${orphans.length}개 → 뿌리 직속: ${orphans.map((k) => k.rep).join(' · ')}`);
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
    const kw = add({ id: id(), title: k.rep, parentId: parent.id, level: parent.level + 1, kind: 'concept', sources: [], gloss: k.claims[0].claim.slice(0, 160), promoted: k.claims.length >= 2, clusterId: k.id, score: k.score });
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
  // 강등 개념의 주장은 같은 메모 최고점 키워드 밑에 문장으로 (없으면 뿌리)
  for (const k of (demoted || [])) for (const c of k.claims) {
    const sib = clusters.filter((x) => x.claims.some((cc) => cc.memoId === c.memoId) && x.nodeId)
      .sort((a2, b2) => b2.score - a2.score)[0];
    claimNode(c, sib ? nodes.get(sib.nodeId) : root);
  }

  // ── 4) 대조 엣지 — lift 슬롯의 쌍을 그대로 엣지로, LLM 0콜 ────
  // 재판정하지 않는다(보완점 ③). 쌍의 문면이 다른 클러스터 표제어와 겹치면 클러스터 간
  // 엣지로 해석하고, 아니면 주장 단위 엣지로 남긴다 — 한 문장 안에서 완결되는 대조가 흔하다.
  const edges = [];
  const clusterOf = (c) => clusters.find((k) => k.claims.includes(c));
  // 쌍의 문면은 "이름 — 설명" 꼴이다. 이름부만 보고, 정확 일치 또는 4자 이상 표제어의
  // 포함일 때만 클러스터로 해석한다 — "면역학적 타자의 부정성"이 '부정성'(3자) 클러스터로
  // 끌려가던 과잉 매칭 실측의 방지.
  // 별칭 해석을 양변에 적용 — "점토판·인쇄기·라디오"(대조 변)가 컴퓨터 클러스터로
  // 해석되려면 salience 런의 aliasMap 이 엣지 해석에도 들어와야 한다 (0808 잔여 ①).
  const findByText = (text, exclude) => {
    const byName = (raw) => {
      const name = nrm(coreOf(raw) || raw);
      return clusters.find((k) => k !== exclude && [...k.headwords].some((h0) => {
        const h = nrm(coreOf(h0) || h0);
        return h === name || (h.length >= 4 && name.includes(h));
      })) || null;
    };
    const raw = nrm(N(text).split('—')[0]);
    const whole = byName(raw);
    if (whole) return whole;
    // 열거형 변("점토판·인쇄기·라디오") 폴백 — 토큰별 별칭 해석 중 최고 점수 클러스터.
    // 별칭 판정이 열거 전체를 대조 상대(컴퓨터)로 묶어 자기-변 제외에 걸리는 실측의 우회다.
    const hits = raw.split(/[·,]/).map((t) => nrm(t)).filter((t) => t.length >= 2)
      .map(byName).filter(Boolean);
    return hits.sort((a2, b2) => (b2.score || 0) - (a2.score || 0))[0] || null;
  };
  for (const c of claims) {
    const s = c.slots?.['대조']; if (!s) continue;
    let a = clusterOf(c);
    let bSide = s.pair.map((t) => findByText(t, a)).find(Boolean) || null;
    // 자기 클러스터가 강등·미배정이면 쌍의 양변을 각각 해석 — "문자·인쇄술·라디오 ↔ 컴퓨터"
    // 를 담은 주장의 표제어(기술 혁신의 범위)가 강등돼도 대조 자체는 살아야 한다 (0808 잔여 ①).
    if (!a?.nodeId && s.pair.length >= 2) {
      const a2 = findByText(s.pair[0], null); const b2 = findByText(s.pair[1], a2);
      if (a2?.nodeId && b2?.nodeId) { a = a2; bSide = b2; }
    }
    edges.push({ type: '대조', axis: s.axis, pair: s.pair, claimKey: c.key, a: a?.nodeId || null, b: bSide?.nodeId || null });
  }
  log.push(`[v12] 대조 엣지 ${edges.length}개 (lift 슬롯 그대로 · 재판정 0콜) — 클러스터 간 해석 ${edges.filter((e) => e.b).length}개`);

  // ── 4.5) 키워드 위계 v2 — 조사 참조·대조 방향·핵어 공유 (0806 준서 판정의 채점화 대응) ──
  // "큰 맥(우울증·성과사회·성과주체)을 부모로 세우고 상세 설명을 하위로."
  // v1(슬롯 신호 + 무게 역전 금지 + 블록 내부 한정)은 오라클 8쌍 중 1쌍 — 실패 원인 실측:
  //   ① 프레임 개념(성과사회)은 주장 수가 적어도 부모다 → 무게 역전 guard 가 정방향을 막음
  //   ② "성과사회의 주민", "성과주체는 강박에 빠진다"처럼 조사로 결합한 참조가 최다 신호인데 미사용
  //     (기각된 "언급→종속"과 다르다 — 나열 언급 "우울증·ADHD…"는 조사가 없어 안 걸린다)
  //   ③ 대조 방향 고정 오류: 주장의 주어가 자기 표제어면(깊은 피로는…) 상대는 반대개념 '자식'이다
  //     — 오라클이 "대조: 성과사회의 피로"를 깊은 피로 밑에 들여쓴 동형. 주어가 상대면 기존대로 그 아래로.
  // 전부 자구·슬롯 재사용 — LLM 0콜 · 임베딩 0콜. 신호 우선순위: 조사 참조 → 대조 → 인과 →
  // 예시·분석·정의 → 통시 → 핵어 공유. 클러스터당 첫 신호가 이긴다.
  {
    const blockOfC = new Map();
    for (const b of blocks) for (const k of b.members) blockOfC.set(k.id, b);
    const weight = (k) => k.claims.length;
    // 클러스터 전문(주장 + 슬롯 값) — 대조 반대편의 퍼지 매칭용
    const fullTextOf = new Map();
    const fullText = (k) => {
      if (!fullTextOf.has(k.id)) {
        const parts = [];
        for (const c of k.claims) {
          parts.push(c.claim);
          for (const s of Object.values(c.slots || {})) for (const v of Object.values(s)) parts.push(Array.isArray(v) ? v.join(' ') : v);
        }
        fullTextOf.set(k.id, nrm(parts.join(' ')));
      }
      return fullTextOf.get(k.id);
    };
    // parentOf: 클러스터 그래프로 먼저 모으고 마지막에 트리에 반영 — 순환·중복을 그래프에서 거른다
    const parentOf = new Map(); // childClusterId → { parent, why }
    const propose = (child, parent, why) => {
      if (!child || !parent || child === parent || parentOf.has(child.id)) return false;
      let a = parent; const seen = new Set([child.id]);
      while (a) { if (seen.has(a.id)) return false; seen.add(a.id); a = parentOf.get(a.id)?.parent; }
      parentOf.set(child.id, { parent, why });
      return true;
    };
    const byHeadIn = (text, exclude) => findByText(text, exclude);
    // 주어 판정 — 표제어가 주장 문두부에 있으면 자기 서술 주장이다
    const selfSubject = (k, c) => nrm(c.claim).slice(0, nrm(k.rep).length + 6).includes(nrm(k.rep));
    // 대조 반대편 퍼지 매칭 — "말 못하는·분열시키는 피로"를 핵어(피로) + 어간(분열)으로 찾는다
    const foilMatch = (sideText, self) => {
      const exact = byHeadIn(sideText, self); if (exact) return exact;
      const toks = N(sideText).split('—')[0].split(/[·,\s]+/).filter(Boolean);
      if (toks.length < 2) return null;
      const headN = nrm(toks[toks.length - 1]);
      if (headN.length < 2) return null;
      const stems = toks.slice(0, -1).map((t) => nrm(t).slice(0, 2)).filter((s) => s.length === 2);
      return clusters.find((p) => p !== self && nrm(p.rep).endsWith(headN) && stems.some((s) => fullText(p).includes(s))) || null;
    };

    // ① 조사 참조: 다른 키워드 P 가 주장의 **주어 자리**에 있을 때만 부모 신호로 인정한다.
    // 한국어 주제-서술 구조의 일반 논리다 — 주어(주제부)는 주장이 서술하는 프레임이고,
    // 목적어·부사어 자리의 언급은 서사의 재료일 뿐 종속이 아니다:
    //   "성과사회의 주민은 … 성과주체다"      → P의-구가 주어 → 성과주체 ⊂ 성과사회 ✓
    //   "복종적 주체는 타자의 강요에 예속된다"  → 타자의-구가 부사어 → 참조 아님 ✓
    // 이전 판(모든 조사 + "부모 4자 이상" 자격)은 골든 끼워맞춤이었다(0807 준서 지적) —
    // 타자·자아 같은 2자 개념도 주어로 서술되는 주장에서는 정당한 부모가 된다.
    // 인정 형태 둘: (a) P는|P이|P가 — P 자신이 주어  (b) P의 + 짧은 명사구 + 은|는|이|가
    // — 소유 구가 주어("성과사회의 주민은"). 부정("~가 아니라")과 자기 서술(소유 구의
    // 핵어가 자기 표제어와 겹침 — "성과사회의 피로는")은 제외.
    const SUBJ = ['은', '는', '이', '가'];
    const refParent = (k, c) => {
      const t = nrm(c.claim);
      let best = null;
      for (const p of clusters) {
        if (p === k) continue;
        for (const h of p.headwords) {
          if (h.length < 2) continue;
          let i = t.indexOf(h);
          while (i !== -1) {
            const after = t.slice(i + h.length);
            let ok = false;
            if (SUBJ.some((x) => after.startsWith(x)) && !after.slice(1).startsWith('아니')) ok = true; // (a) P가 주어
            else if (after.startsWith('의')) {                                                          // (b) 소유 구가 주어
              const np = after.slice(1, 8);
              const subjAt = SUBJ.map((x) => np.indexOf(x)).filter((j) => j > 0).sort((a, b) => a - b)[0];
              const headNoun = subjAt ? np.slice(0, subjAt) : null;
              // 핵명사는 짧은 명사 연쇄여야 한다 — "집단의 의지를 강조하는"에서 어미 '~하는'의
              // '는'을 주어 조사로 오인하던 것 방지(존중정치학 프로브 실측): 다른 조사·긴 구 제외
              if (headNoun && headNoun.length <= 4 && !/[를을에로와과]/.test(headNoun)
                && !np.slice(subjAt + 1).startsWith('아니')
                && !nrm(k.rep).includes(headNoun.slice(0, 2))) ok = true;
            }
            if (ok && (best === null || i < best.i)) best = { p, i };
            i = t.indexOf(h, i + 1);
          }
        }
      }
      return best?.p || null;
    };

    const foilChildren = []; // 대조 반대개념으로 신설할 자식 키워드
    // 의미 매칭 보류함 — 자구로 못 이은 슬롯 구절을 모았다가 폐쇄 LLM 판정 1콜로 잇는다
    // (0807 준서 지시: "글자만 같은 게 아니라 의미상 유사도"). 임베딩 코사인은 실측에서
    // 표적(능률↔경제적 효율 0.41)이 잡음(짜증↔우울증 0.45)보다 낮아 문턱 방식을 기각했다.
    const semPending = [];
    for (const k of clusters) {
      for (const c of k.claims) {
        if (parentOf.has(k.id)) break;
        // ① 조사 참조
        const rp = refParent(k, c);
        if (rp && propose(k, rp, '참조')) break;
        // ② 대조 — 주어 방향 분기
        const ct = c.slots?.['대조'];
        if (ct) {
          if (selfSubject(k, c)) {
            // 자기 서술 주장: 상대는 반대개념 자식 (오라클 "대조:" 들여쓰기 동형)
            for (const side of ct.pair) {
              // 자기 표제어가 든 변은 자기 쪽이다 — "성과사회의 호모 사케르 ↔ 주권 사회의 호모 사케르"
              // 처럼 자기 개념의 하위 유형 대조에서 성과사회를 반대편으로 오인하는 것 방지
              if ([...k.headwords].some((h) => nrm(side).includes(h))) continue;
              const other = foilMatch(side, k);
              if (other) { propose(other, k, '대조·반대개념'); continue; }
              semPending.push({ k, rel: '대조·반대개념', text: side, dir: 'child', claim: c.claim });
              // 상대가 클러스터로 없으면 자식 키워드로 신설 — 승격 큰 맥일 때만 (분노 ⊃ 짜증)
              if (weight(k) >= 2) {
                const name = N(side).split('—')[0].split(/[과와]\s/)[0].trim();
                if (name.length >= 2 && name.length <= 10 && !nrm(k.rep).includes(nrm(name)) && nrm(c.claim).includes(nrm(name))
                  && !foilChildren.some((f) => f.name === name && f.under === k))
                  foilChildren.push({ name, under: k, from: c });
              }
            }
          } else {
            const other = ct.pair.map((t) => byHeadIn(t, k)).find(Boolean);
            if (other && propose(k, other, '대조')) break;
          }
        }
        if (parentOf.has(k.id)) break;
        // ③ 인과: 사슬 항목이 다른 키워드면 그중 가장 큰 맥 아래로 (기존 guard 유지)
        // 방향 가드 통일(0808): 무게 대신 salience — 낮은 점수가 높은 점수 밑으로만
        const guard = (parent) => parent && k.score <= parent.score + 0.1
          && (blockOfC.get(k.id) === blockOfC.get(parent.id) || parent.score >= 0.35 || weight(parent) >= 2);
        const ch = c.slots?.['인과'];
        if (ch) {
          const hits = ch.chain.map((t) => byHeadIn(t, k)).filter(Boolean);
          const big = hits.sort((a, b) => weight(b) - weight(a))[0];
          if (guard(big) && propose(k, big, '인과')) break;
          if (!big) ch.chain.forEach((t) => semPending.push({ k, rel: '인과', text: t, dir: 'parent', claim: c.claim }));
        }
        // ④ 예시·분석·정의: 대상(of/concept)이 다른 키워드면 그 밑으로
        let done = false;
        for (const rel of ['예시', '분석', '정의']) {
          const s = c.slots?.[rel]; if (!s) continue;
          const tx = s.of || s.concept || '';
          const target = byHeadIn(tx, k);
          if (guard(target) && propose(k, target, rel)) { done = true; break; }
          if (!target && tx) semPending.push({ k, rel, text: tx, dir: 'parent', claim: c.claim });
        }
        if (done) break;
        // ⑤ 통시: 시기·국면 항목도 사슬처럼 — "규율사회→성과사회" phases 가 큰 맥을 가리킨다
        const ts = c.slots?.['통시'];
        if (ts) { const hit = ts.phases.map((t) => byHeadIn(t, k)).find(Boolean); if (guard(hit) && propose(k, hit, '통시')) break; }
      }
    }
    // (기각) 핵어 공유 규칙 — "나르시스적 주체 → 성과주체"처럼 같은 핵어로 끝나는 수식형을
    // 원형 밑에 넣는 규칙은 골든 1쌍을 잡으려는 끼워맞춤이었고, 일반적으로는 수식형끼리
    // 형제인 경우("복종적 주체"와 "성과주체"는 대조 쌍)가 더 많다 — 0807 준서 지적으로 삭제.

    // ⑥ 의미 매칭 — 자구로 못 이은 슬롯 구절을 폐쇄 LLM 판정 1콜로 잇는다 (0807 준서 지시).
    // "반복이 정확한 단어가 아니라 다른 표현으로 반복된다"(골든 관찰)의 파렌팅 대응:
    // '경제적 효율'이 '능률' 키워드를 가리키는지 같은 동의 판정은 임베딩 문턱으로는 불가
    // (표적 0.41 < 잡음 0.45 실측)라, 후보 목록에서 고르는 폐쇄 판정으로 한다.
    // 방향은 자구 규칙과 동일하게 슬롯 의미가 정한다 — 판정은 "같은 개념인가"만 답한다.
    if (llm && semPending.length) {
      const fresh = semPending.filter((x, i) =>
        (x.dir === 'child' || !parentOf.has(x.k.id))
        && N(x.text).split('—')[0].trim().length >= 2
        && semPending.findIndex((y) => y.k === x.k && y.text === x.text && y.dir === x.dir) === i
      ).slice(0, 30);
      if (fresh.length) {
        try {
          onProgress?.('v12 — 의미 매칭 판정');
          const raw = await llm({
            system: `구절이 가리키는 개념이 키워드 목록에 있으면 그 키워드를 고른다. 단어 자구가 아니라 **문맥으로** 판정한다 — 구절이 문장 안에서 하는 일과 키워드의 대표 주장이 같은 개념을 서술하면 매칭한다(예: "무형성이 높은 경제적 효율을 가능하게 한다"의 "경제적 효율" ≈ "자기 착취가 더 능률적이다"의 "능률"). 주제가 이웃인 것으로는 부족하다 — 같은 개념의 다른 표현일 때만. 확신이 없으면 null. JSON만 출력.`,
            user: `[키워드 목록 — 대표 주장 포함]\n${clusters.map((p) => `- ${p.rep}: ${N(p.claims[0].claim).slice(0, 70)}`).join('\n')}\n\n[구절 — 출처 문장 포함]\n${fresh.map((x, i) => `${i} | "${N(x.text).split('—')[0].trim()}" ← ${N(x.claim || '').slice(0, 90)}`).join('\n')}\n\n출력 JSON: {"map":{"0":"키워드 또는 null"}}`,
            temperature: 0.1,
          });
          llmCalls++;
          // 하이쿠가 코드 펜스·설명을 붙일 수 있다 — 첫 JSON 블록만 추출 (rule4-15 콜 실패 실측)
          const map = JSON.parse((raw.match(/\{[\s\S]*\}/) || ['{}'])[0]).map || {};
          const semHits = [];
          for (const [i, repName] of Object.entries(map)) {
            const x = fresh[Number(i)];
            if (!x || !repName || repName === 'null') continue;
            const p = clusters.find((c2) => nrm(c2.rep) === nrm(String(repName)));
            if (!p || p === x.k) continue;
            if (x.dir === 'child') { if (propose(p, x.k, `${x.rel}≈`)) semHits.push(`${p.rep} → ${x.k.rep}`); }
            // 부모 방향은 상대가 승격 큰 맥일 때만 — 의미 판정은 "같은 개념인가"만 답하므로
            // 방향 근거가 자구 규칙보다 약하다. 성격 없는 인간(행위자)이 능률(그 행위의 결과)
            // 밑으로 들어간 sem-14 실측의 방지 — 잔가지끼리는 잇지 않는다.
            else if ((p.score >= 0.35 || weight(p) >= 2) && x.k.score <= p.score + 0.1) {
              if (propose(x.k, p, `${x.rel}≈`)) semHits.push(`${x.k.rep} → ${p.rep}`);
            }
          }
          log.push(`[v12] 의미 매칭: 후보 ${fresh.length}건 중 ${semHits.length}건 연결${semHits.length ? ` — ${semHits.join(' · ')}` : ''}`);
        } catch (e) { log.push(`[v12⚠] 의미 매칭 콜 실패 — 자구 결과만 유지 (${String(e.message).slice(0, 120)})`); }
      }
    }

    // ⑦ 고아 인과 귀속: 어디에도 못 붙은 클러스터 B 를, B 를 인과 사슬로 서술하는 확립 클러스터
    // A(부모가 있거나 승격) 아래로 — "강제하는 자유의 내면화 → 끊임없는 자기 착취"에서 자기착취는
    // 강제하는 자유 서사의 디테일이다. A 가 확립일 때만이라 기각된 "언급→종속"(나열 언급)과 다르고,
    // 이미 부모가 있는 클러스터는 건드리지 않아 소진→우울증 같은 정방향 인과 중첩과 충돌하지 않는다.
    for (const b of clusters) {
      if (parentOf.has(b.id)) continue;
      // 귀속은 잔가지만 — 주장이 많거나 이미 자식을 거느린 클러스터는 큰 맥 뿌리다.
      // (실측: 이 가드 없이는 성과사회가 "성과사회의 긍정성 → 우울증 환자" 사슬에 걸려
      // 우울증 환자 아래로 들어가며 하위 트리 전체의 역할 블록이 무너졌다 — 소속 88→69)
      const childCnt = [...parentOf.values()].filter((v) => v.parent === b).length;
      if (weight(b) + childCnt > 2 || b.score >= 0.5) continue;      // 상위 점수 개념은 뿌리로 남는다
      for (const a of clusters) {
        if (a === b || !(parentOf.has(a.id) || weight(a) >= 2 || a.score >= 0.5)) continue;
        if (a.score + 0.1 < b.score) continue;
        const hit = a.claims.some((c) => (c.slots?.['인과']?.chain || []).some((t) => byHeadIn(t, a) === b));
        if (hit && propose(b, a, '인과·귀속')) break;
      }
    }

    // 반영 — 그래프에서 걸러진 간선만 트리에 적용
    const relevel = (nid) => { const x = nodes.get(nid); x.level = nodes.get(x.parentId).level + 1; for (const ch of nodes.values()) if (ch.parentId === nid) relevel(ch.id); };
    const nested = [];
    for (const [cid, { parent, why }] of parentOf) {
      const child = clusters.find((x) => x.id === cid);
      const cn = nodes.get(child?.nodeId), pn = nodes.get(parent?.nodeId);
      if (!cn || !pn) continue;
      cn.parentId = pn.id; relevel(cn.id);
      nested.push(`${child.rep} → ${parent.rep}(${why})`);
    }
    for (const f of foilChildren) {
      const pn = nodes.get(f.under.nodeId); if (!pn) continue;
      add({ id: id(), title: f.name, parentId: pn.id, level: pn.level + 1, kind: 'concept', sources: [], gloss: `${f.under.rep}의 반대개념 — ${f.from.claim.slice(0, 100)}`, foil: true });
      nested.push(`${f.name} ⊂ ${f.under.rep}(반대개념 신설)`);
    }
    if (nested.length) log.push(`[v12] 키워드 위계 ${nested.length}건: ${nested.join(' · ')}`);
    else log.push('[v12] 키워드 위계 신호 없음 — 평면 유지');
  }

  // ── 4.7) 대조 축 승격 (0808 준서: "지엽적 대조와 책에서 중요한 대조를 가려내는 것") ──
  // 양변이 모두 키워드이고 min(양변 점수)가 높은 대조만 "A ↔ B" 축 노드로 트리에 세운다
  // — 인쇄술↔컴퓨터가 표적. 파렌팅이 이미 부모-자식을 정한 쌍(짜증→분노)은 건드리지
  // 않고, 한 문단 안 완결 대조(위안↔정당성)는 b 가 없어 자연 제외된다.
  {
    const isAncN = (aId, bId) => { let c = nodes.get(bId); while (c && c.parentId) { if (c.parentId === aId) return true; c = nodes.get(c.parentId); } return false; };
    const AXIS_MIN = 0.45;
    for (const e of edges.filter((x) => x.type === '대조' && x.a && x.b)) {
      const an = nodes.get(e.a), bn = nodes.get(e.b);
      if (!an || !bn || an === bn) continue;
      const ka = clusters.find((k) => k.nodeId === e.a), kb = clusters.find((k) => k.nodeId === e.b);
      if (!ka || !kb) continue;
      if (Math.min(ka.score, kb.score) < AXIS_MIN) continue;
      if (isAncN(an.id, bn.id) || isAncN(bn.id, an.id)) continue;                   // 파렌팅 우선
      if (nodes.get(an.parentId)?.relation === '대조축' || nodes.get(bn.parentId)?.relation === '대조축') continue;
      const host = nodes.get(an.parentId) || root;
      const axis = add({ id: id(), title: `${an.title} ↔ ${bn.title}`, parentId: host.id, level: host.level + 1, kind: 'concept', relation: '대조축', sources: [], gloss: e.axis || '' });
      an.parentId = axis.id; bn.parentId = axis.id;
      const relevelN = (nid) => { const x = nodes.get(nid); x.level = nodes.get(x.parentId).level + 1; for (const ch of nodes.values()) if (ch.parentId === nid) relevelN(ch.id); };
      relevelN(an.id); relevelN(bn.id);
      log.push(`[v12] 대조 축 승격: ${an.title} ↔ ${bn.title} (${e.axis || ''} · min점수 ${Math.min(ka.score, kb.score)})`);
    }
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
