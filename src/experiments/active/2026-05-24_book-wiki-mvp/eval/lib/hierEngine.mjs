// 위계 인제스트 엔진 — protoHierIngestV5 로직을 variant 파라미터로 재사용 가능하게 추출.
// variant:
//  - 'v5' : V5 그대로 (place 4택 = merge/child/parent/attach, 존중형 cluster)
//  - 'v6' : V5 + A(치환 테스트 프롬프트) + B(child/parent 양방향 교차검증, 불일치→attach)
//  - 'v7' : V6 + 테마 주역화 — Phase2 전면 재설계:
//           · 테마마다 name+description(책이 이 테마로 말하는 것) 필수, 책 summary+toc 앵커링
//           · 테마별 독립 critic 반증(책 핵심 부합? 억지 멤버?) — 탈락 테마 해체
//           · 같은 메모 출신 개념쌍은 sim 문턱 무시하고 동의어 검사
//           · 고아→고아 중첩 구멍 제거(테마 생성 경로로만 수직 이동)
// 사용: runHierIngest({ book, memos, llm, embedFn, variant })  → { nodes, rootId, stats, log }
//
// ⚠ 구조도 동기화: 이 엔진의 단계·프롬프트·파라미터를 바꾸면 반드시
//   eval/pipelines/hier-ingest-v7.json (eval 대시보드 왼쪽 구조도)도 같이 갱신할 것.

const MAX_LEVEL = 3;

const cos = (a, b) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return s / (Math.sqrt(na) * Math.sqrt(nb)); };

export async function runHierIngest({ book, memos, llm, embedFn, variant = 'v5', onProgress }) {
  let SEQ = 0; const id = () => `n${++SEQ}`;
  const nodes = new Map(); const log = [];
  const root = { id: id(), title: book.title, parentId: null, level: 0, kind: 'root', sources: [], emb: null };
  nodes.set(root.id, root);
  const concepts = () => [...nodes.values()].filter((n) => n.kind === 'concept');
  const childrenOf = (pid) => [...nodes.values()].filter((n) => n.parentId === pid);
  const ancestry = (n) => { const path = []; let c = n; while (c && c.parentId) { c = nodes.get(c.parentId); if (c && c.kind === 'concept') path.unshift(c.title); } return path.join(' › ') || '(최상위)'; };
  const isAncestor = (aId, bId) => { let c = nodes.get(bId); while (c && c.parentId) { if (c.parentId === aId) return true; c = nodes.get(c.parentId); } return false; };
  function addConcept(title, parentId, emb, gloss) {
    const lvl = nodes.get(parentId).level + 1;
    const n = { id: id(), title, parentId, level: lvl, kind: 'concept', sources: [], emb, gloss };
    nodes.set(n.id, n); return n;
  }
  function reparent(nodeId, newParentId) {
    nodes.get(nodeId).parentId = newParentId;
    const relevel = (nid) => { const x = nodes.get(nid); x.level = nodes.get(x.parentId).level + 1; childrenOf(nid).forEach((k) => relevel(k.id)); };
    relevel(nodeId);
  }
  const subtreeDepth = (nid) => { const kids = childrenOf(nid); return kids.length ? 1 + Math.max(...kids.map((k) => subtreeDepth(k.id))) : 0; };
  function safeReparent(nodeId, newParentId) {
    const newLvl = nodes.get(newParentId).level + 1;
    if (newLvl + subtreeDepth(nodeId) > MAX_LEVEL) return false;
    reparent(nodeId, newParentId); return true;
  }

  const SYS = '너는 독서 메모를 "책별 개념 위계 트리"에 점진적으로 끼워넣는 사서다. 보이는 노드는 오직 메모에서 나온 개념뿐 — 책 목차는 위계를 잡는 참고용 숨은 척추일 뿐 절대 노드로 만들지 않는다. 같은 개념은 반드시 병합하고, 위계는 진짜 포함관계(상위=넓음, 하위=좁음)일 때만 만든다. JSON만 출력.';

  // 1) 개념 추출 (V5와 동일 — variant 무관, 비교 공정성 유지)
  async function extract(memo) {
    const prompt = `[문장] ${memo.text}\n[내 생각] ${memo.my || '(없음)'}\n\n이 메모의 핵심 개념을 뽑아라. 기본 1개. 정말로 별개의 두 개념이 섞였을 때만 2개. 한 개념을 측면별로 쪼개지 마라(예: "질감"과 "기억"은 하나).\n⚠ "디자인"·"책"·"개념"·"정보"처럼 너무 일반적인 단어 금지 — 이 문장만의 구체적 키워드로(예: "재발견으로서의 디자인", "촉각 정보", "여백의 그릇").\n출력 JSON: {"concepts":[{"name":"짧은 명사구","gloss":"한 줄 설명"}]}`;
    const raw = await llm({ system: SYS, user: prompt, temperature: 0.1 });
    try { return (JSON.parse(raw).concepts || []).slice(0, 2); } catch { return []; }
  }

  // 2) 배치 결정 — v5/v6 프롬프트 분기
  async function place(memo, c, cand) {
    const existing = concepts().map((n) => `${n.id} | ${ancestry(n)} › ${n.title}`).join('\n') || '(아직 없음)';
    // A. 치환 테스트: "좁다/넓다" 대신 검증 가능한 문장 테스트로 바꿔 판단을 쉬운 문제로.
    const hierRuleV6 = `이 새 개념을 트리에 어떻게 꽂을지 판단하라. 위계 판단은 아래 **치환 테스트**를 통과할 때만 한다:
- op="merge": 후보가 **같은 한 단어로 부를 같은 개념**(동의어·바꿔말하기)일 때만. targetId=그 후보. 관련·인접일 뿐이면 절대 merge 아님.
- op="child": 치환 테스트 → "〈새 개념〉은 〈후보〉의 한 종류/사례/부분이다" 문장이 자연스럽고, 그 역방향("〈후보〉는 〈새 개념〉의 한 종류다")은 어색할 때만. targetId=상위가 될 후보.
- op="parent": 치환 테스트 → "〈후보〉는 〈새 개념〉의 한 종류/사례/부분이다"가 자연스럽고 역방향은 어색할 때만. targetId=대표 후보, adoptIds=이 새 상위 아래로 함께 넣을 다른 기존 개념 id들(없으면 []). 남발 금지.
- op="attach": 치환 테스트가 **양방향 모두 어색하거나 양방향 모두 자연스러우면**(=동의어 의심이면 merge 검토) root 직속 leaf. targetId="${root.id}".
확신 없으면 attach. 위계는 최대 ${MAX_LEVEL}단까지만.`;
    const hierRuleV5 = `이 새 개념을 트리에 어떻게 꽂을지 판단하라. 위계는 **진짜 포함관계**일 때만 만든다:
- op="merge": 후보가 **같은 한 단어로 부를 같은 개념**(동의어·바꿔말하기)일 때만. targetId=그 후보. 관련·인접일 뿐이면 절대 merge 아님.
- op="child": 새 개념이 후보보다 **좁은 하위 개념**일 때. targetId=상위가 될 후보. (새 개념이 후보의 한 종류/사례/부분)
- op="parent": 새 개념이 후보(들)보다 **넓은 상위 개념**일 때. targetId=대표 후보, adoptIds=이 새 상위 아래로 함께 넣을 다른 기존 개념 id들(없으면 []). 남발 금지 — 명백히 상위일 때만.
- op="attach": 위 어디에도 안 맞으면 root 직속 leaf. targetId="${root.id}".
확신 없으면 attach. 위계는 최대 ${MAX_LEVEL}단까지만.`;
    const prompt = `[숨은 척추 — 참고만, 노드로 만들지 마라]
책: ${book.title} (${book.category})
목차 흐름: ${book.toc.join(' · ')}

[새 개념] ${c.name} — ${c.gloss}
(출처 문장: ${memo.text})

[관련 후보 (임베딩 유사도 상위)]
${cand.length ? cand.map((x) => `${x.id} | ${ancestry(x.node)} › ${x.node.title} (유사도 ${x.sim.toFixed(2)})`).join('\n') : '(없음)'}

[현재 트리의 모든 개념]
${existing}

${variant === 'v5' ? hierRuleV5 : hierRuleV6}
출력 JSON: {"op":"merge|child|parent|attach","targetId":"n?","adoptIds":["n?"],"reason":"한 줄"}`;
    const raw = await llm({ system: SYS, user: prompt, temperature: 0.1 });
    try { return JSON.parse(raw); } catch { return { op: 'attach', targetId: root.id, reason: 'parse-fail' }; }
  }

  // B. 양방향 교차검증 (v6 전용) — child/parent 판정을 맥락 없는 중립 템플릿으로 재확인.
  // narrow ⊂ broad 가 맞는지: 정방향 yes + 역방향 no 일 때만 통과.
  // 양방향 yes → 동의어 의심(merge로 강등), 그 외 → attach로 강등.
  async function verifyDirection(narrow, broad) {
    const ask = async (a, b) => {
      const raw = await llm({
        system: '개념 관계 판정기. 주어진 문장이 의미상 자연스러운지만 판단. JSON만 출력.',
        user: `책 "${book.title}"의 개념이다.\nA: ${a.name} — ${a.gloss || ''}\nB: ${b.name} — ${b.gloss || ''}\n\n"${a.name}은(는) ${b.name}의 한 종류/사례/부분이다" — 이 문장이 자연스러운가?\n출력 JSON: {"natural":true|false}`,
        temperature: 0,
      });
      try { return !!JSON.parse(raw).natural; } catch { return false; }
    };
    const fwd = await ask(narrow, broad);   // 좁은 것 ⊂ 넓은 것 → yes 기대
    const rev = await ask(broad, narrow);   // 반대 → no 기대
    if (fwd && !rev) return 'confirmed';
    if (fwd && rev) return 'synonym';
    return 'rejected';
  }

  // ─── Phase 1 ────────────────────────────────────────────────
  log.push(`[Phase0] variant=${variant} · 목차=숨은 척추. root=책 1개. 최대 ${MAX_LEVEL}단.`);
  let memoIdx = 0;
  for (const memo of memos) {
    memoIdx++; onProgress?.(`memo ${memoIdx}/${memos.length} (p${memo.p})`);
    for (const c of await extract(memo)) {
      const emb = await embedFn(`${c.name}: ${c.gloss}`);
      const cand = concepts().map((n) => ({ id: n.id, node: n, sim: cos(emb, n.emb) })).filter((x) => x.node.emb).sort((a, b) => b.sim - a.sim).slice(0, 4).filter((x) => x.sim > 0.3);
      let d = await place(memo, c, cand);
      const tgt = nodes.get(d.targetId);
      const validConcept = tgt && tgt.kind === 'concept';

      // B. v6+: child/parent는 양방향 교차검증을 통과해야 확정
      if ((variant === 'v6' || variant === 'v7') && validConcept && (d.op === 'child' || d.op === 'parent')) {
        const asConcept = (n) => ({ name: n.title, gloss: n.gloss });
        const verdict = d.op === 'child'
          ? await verifyDirection(c, asConcept(tgt))          // 새 개념 ⊂ 후보
          : await verifyDirection(asConcept(tgt), c);         // 후보 ⊂ 새 개념
        if (verdict === 'synonym') {
          log.push(`[flip]   p${memo.p} · "${c.name}" ${d.op}→merge (양방향 자연스러움=동의어 의심)`);
          d = { op: 'merge', targetId: d.targetId, reason: 'B검증: 양방향 포함 → 동의어' };
        } else if (verdict === 'rejected') {
          log.push(`[flip]   p${memo.p} · "${c.name}" ${d.op}→attach (교차검증 불일치)`);
          d = { op: 'attach', targetId: root.id, reason: 'B검증: 방향 불일치' };
        }
      }

      if (d.op === 'merge' && validConcept) {
        tgt.sources.push(memo.p);
        log.push(`[merge]  p${memo.p} · "${c.name}" → ${tgt.id} ${tgt.title}  (${d.reason})`);

      } else if (d.op === 'child' && validConcept && tgt.level < MAX_LEVEL) {
        const n = addConcept(c.name, tgt.id, emb, c.gloss); n.sources.push(memo.p);
        log.push(`[child]  p${memo.p} · "${c.name}" → ${n.id} ⊂ ${tgt.title} (L${n.level})  (${d.reason})`);

      } else if (d.op === 'parent' && validConcept) {
        const grand = nodes.get(tgt.parentId) || root;
        if (grand.level + 1 > MAX_LEVEL) {
          const n = addConcept(c.name, root.id, emb, c.gloss); n.sources.push(memo.p);
          log.push(`[attach*] p${memo.p} · "${c.name}" → ${n.id} (parent 승격이 깊이 초과 → root)  (${d.reason})`);
        } else {
          const n = addConcept(c.name, grand.id, emb, c.gloss); n.sources.push(memo.p);
          const adopt = [d.targetId, ...(d.adoptIds || [])]
            .filter((aid, i, arr) => arr.indexOf(aid) === i)
            .map((aid) => nodes.get(aid))
            .filter((x) => x && x.kind === 'concept' && x.id !== n.id && x.id !== n.parentId && !isAncestor(x.id, n.id));
          for (const a of adopt) if (n.level + 1 + subtreeDepth(a.id) <= MAX_LEVEL) reparent(a.id, n.id);
          log.push(`[parent] p${memo.p} · "${c.name}"(${n.id},L${n.level}) ⊃ [${adopt.map((a) => a.title).join(', ')}]  (${d.reason})`);
        }

      } else {
        const n = addConcept(c.name, root.id, emb, c.gloss); n.sources.push(memo.p);
        log.push(`[attach] p${memo.p} · "${c.name}" → ${n.id} (root)  (${d.reason})`);
      }
    }
  }

  // ─── Phase 1.5: 동의어 병합 패스 (V5와 동일) ─────────────────
  {
    onProgress?.('phase 1.5 — 동의어 병합');
    const cs = concepts().filter((n) => n.emb);
    const pairs = [];
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const sim = cos(cs[i].emb, cs[j].emb);
      // v7: 같은 메모에서 나온 개념쌍은 extract 자기중복 가능성이 높다 — sim 문턱 무시하고 검사
      const sameMemo = variant === 'v7' && cs[i].sources.some((p) => cs[j].sources.includes(p));
      if (sim > 0.55 || sameMemo) pairs.push({ a: cs[i], b: cs[j], sim });
    }
    pairs.sort((x, y) => y.sim - x.sim);
    const dead = new Set();
    for (const { a, b, sim } of pairs) {
      if (dead.has(a.id) || dead.has(b.id)) continue;
      if (isAncestor(a.id, b.id) || isAncestor(b.id, a.id)) continue;
      const prompt = `책 "${book.title}"에서 나온 두 개념이 **같은 한 단어로 부를 같은 개념**(동의어·바꿔말하기)인가, 아니면 관련될 뿐 다른 개념인가?\n관련·인접·같은 테마일 뿐이면 "다름"이다. 확신 없으면 "다름".\nA: ${a.title} — ${a.gloss || ''}\nB: ${b.title} — ${b.gloss || ''}\n출력 JSON: {"same":true|false,"keep":"A|B","reason":"한 줄"}`;
      const raw = await llm({ system: SYS, user: prompt, temperature: 0 });
      let d; try { d = JSON.parse(raw); } catch { continue; }
      if (!d.same) continue;
      const keep = d.keep === 'B' ? b : a; const drop = keep === a ? b : a;
      for (const k of childrenOf(drop.id)) reparent(k.id, keep.id);
      keep.sources.push(...drop.sources);
      nodes.delete(drop.id); dead.add(drop.id);
      log.push(`[merge*] "${drop.title}" → "${keep.title}" (sim ${sim.toFixed(2)}, ${d.reason})`);
    }
  }

  // ─── Phase 2 (v7): 테마 주역화 — Description 필수 + 책 논지 앵커링 + critic 반증 ──
  if (variant === 'v7') {
    onProgress?.('phase 2 — 테마 생성(v7)');
    const rootKids = concepts().filter((n) => n.parentId === root.id);
    if (rootKids.length >= 3) {
      const desc = (n) => {
        const kids = childrenOf(n.id);
        return `${n.id}: ${n.title} — ${n.gloss || ''}${kids.length ? ` (하위: ${kids.map((k) => k.title).join(', ')})` : ''}`;
      };
      const genPrompt = `[책 맥락 — 테마의 근거는 반드시 여기서]
책: ${book.title} (${book.author} · ${book.category})
${book.summary ? `핵심 논지: ${book.summary}` : ''}
목차 흐름: ${book.toc.join(' · ')}

아래는 한 독자가 이 책에서 수집한 개념들이다(place가 만든 하위 위계는 유지된다).
**이 책을 읽은 독자의 머릿속에 자연스럽게 생기는 이해의 큰 축**만 테마로 만들어라.

규칙:
- 테마는 이 책의 핵심 논지에서 직접 도출돼야 한다. 책과 무관한 일반 분류("기타", "다양한 관점", "삶의 지혜" 류) 절대 금지.
- 테마마다 anchor 필수: 위 [책 맥락]의 핵심 논지·목차에서 이 테마의 근거가 되는 구절을 **그대로 인용**. 인용할 구절이 없으면 그 테마는 만들지 마라.
- 테마마다 description 필수: 이 책이 이 테마로 무엇을 말하는지 + 왜 이 멤버들이 여기 묶이는지, 2~3문장.
- ⚠ memberIds가 2개 미만인 테마는 아예 출력하지 마라. 어울리는 테마가 없는 개념은 그냥 남겨라(억지 편입 금지). 다 묶일 필요 전혀 없다.
- 테마명은 멤버 이름 복사·목차 제목 복붙 금지. 멤버들을 실제로 아우르는 이름.

[개념들]
${rootKids.map(desc).join('\n')}

출력 JSON: {"themes":[{"name":"테마명","anchor":"책 맥락에서 그대로 인용한 근거 구절","description":"2~3문장","memberIds":["n?","n?"]}]}`;
      const raw = await llm({ system: SYS, user: genPrompt, temperature: 0.1 });
      let out; try { out = JSON.parse(raw); } catch { out = { themes: [] }; }

      // 테마별 독립 critic — 반증 시도. author≠reviewer.
      for (const t of out.themes || []) {
        const members = (t.memberIds || []).map((mid) => nodes.get(mid)).filter((x) => x && x.kind === 'concept' && x.parentId === root.id);
        if (members.length < 2 || !t.name?.trim() || !t.description?.trim()) {
          log.push(`[theme✗] "${t.name || '?'}" 스킵(멤버<2 또는 name/description 누락)`); continue;
        }
        const criticPrompt = `아래 "테마"가 이 책의 핵심 내용에 부합하는 우산 개념인지 검증하라. 판정은 반드시 **인용 근거**로 한다 — 분위기로 판단하지 마라.

[책 맥락]
${book.title} — ${book.summary || ''}
목차: ${book.toc.join(' · ')}

[제안된 테마] ${t.name}
[테마의 근거 주장(anchor)] ${t.anchor || '(없음)'}
[테마 설명] ${t.description}
[멤버들]
${members.map((m) => `${m.id}: ${m.title} — ${m.gloss || ''}`).join('\n')}

판정 절차:
1) anchor가 위 [책 맥락]의 실제 구절과 대응하는가? 대응하면 이 테마는 책에 근거한 것이다 → 기각하지 마라.
2) 기각(valid=false)은 다음을 **구체적 인용과 함께** 보일 수 있을 때만: anchor가 책 맥락에 없는 지어낸 구절이다 / description이 책 맥락의 특정 구절과 정면으로 어긋난다 / 테마명이 멤버 절반 이상과 무관하다.
3) 테마 전체는 타당한데 일부 멤버만 억지 편입이면 valid=true + 그 id를 dropMemberIds에.
출력 JSON: {"valid":true|false,"dropMemberIds":["n?"],"reason":"판정 근거 인용 포함 한 줄"}`;
        const craw = await llm({ system: '독서 위키 품질 검증자. 인용 근거 기반으로만 판정. JSON만 출력.', user: criticPrompt, temperature: 0, model: 'gpt-4o' });
        let verdict; try { verdict = JSON.parse(craw); } catch { verdict = { valid: false, reason: 'parse-fail' }; }
        if (!verdict.valid) { log.push(`[theme✗] "${t.name}" 기각 — ${verdict.reason}`); continue; }
        const keep = members.filter((m) => !(verdict.dropMemberIds || []).includes(m.id));
        if (keep.length < 2) { log.push(`[theme✗] "${t.name}" 기각(억지 멤버 제외 후 <2)`); continue; }
        const th = addConcept(t.name.trim(), root.id, null, t.description.trim());
        th.anchor = (t.anchor || '').trim();
        let moved = 0;
        for (const m of keep) if (safeReparent(m.id, th.id)) moved++;
        log.push(`[theme] "${t.name}"(${th.id}) ← ${keep.map((m) => m.title).join(', ')}${(verdict.dropMemberIds || []).length ? ` (억지 제외: ${verdict.dropMemberIds.join(',')})` : ''}`);
        log.push(`[theme.desc]   ↳ anchor: ${th.anchor || '(없음)'} | ${t.description.trim()}`);
        if (!moved) { nodes.delete(th.id); log.push(`[theme✗] "${t.name}" 롤백(깊이 초과로 이동 0)`); }
      }
    }
  }

  // ─── Phase 2 (v5/v6): 존중형 군집화 ──────────────────────────
  if (variant !== 'v7') {
    onProgress?.('phase 2 — 군집화');
    const orphans = concepts().filter((n) => n.parentId === root.id && childrenOf(n.id).length === 0);
    const existingThemes = concepts().filter((n) => n.parentId === root.id && childrenOf(n.id).length > 0);
    if (orphans.length) {
      const prompt = `[숨은 척추 — 참고만, 제목을 노드로 복붙 금지] 책 "${book.title}" 목차 흐름: ${book.toc.join(' · ')}

place 단계가 이미 만든 위계는 건드리지 않는다. 아래 [고아 개념]들만 상위 테마로 묶어라.
⚠ 무리한 편입 절대 금지 — 대부분의 고아는 최상위에 그대로 남는 게 정상이다. 억지로 다 묶지 마라.
- 편입은 그 고아가 기존 테마의 **명백한 하위 구성원**일 때만(themeId). 단지 관련·인접이면 편입하지 마라.
- 여러 고아(≥2)가 **하나의 자명한 상위 개념**으로 자연히 묶일 때만 새 테마 생성(newTheme). 테마명은 자식 이름과 달라야 하고 목차 복붙 금지.
- 확신이 조금이라도 없으면 둘 다 비워 최상위에 남겨라.

[기존 상위 테마]
${existingThemes.length ? existingThemes.map((n) => `${n.id} | ${n.title} — 자식: ${childrenOf(n.id).map((k) => k.title).join(', ')}`).join('\n') : '(없음)'}

[고아 개념]
${orphans.map((k) => `${k.id}: ${k.title} — ${k.gloss || ''}`).join('\n')}

출력 JSON: {"assign":[{"id":"고아 id","themeId":"기존 테마 id 또는 빈문자열","newTheme":"새 테마명 또는 빈문자열"}]}`;
      const raw = await llm({ system: SYS, user: prompt, temperature: 0.1 });
      let out; try { out = JSON.parse(raw); } catch { out = { assign: [] }; }
      const assigns = (out.assign || []).filter((a) => nodes.get(a.id)?.parentId === root.id);
      for (const a of assigns) {
        const leaf = nodes.get(a.id);
        if (a.themeId && nodes.get(a.themeId)?.kind === 'concept' && a.themeId !== leaf.id) {
          if (safeReparent(leaf.id, a.themeId)) log.push(`[cluster] "${leaf.title}" → 기존 테마 ${nodes.get(a.themeId).title}`);
          else log.push(`[cluster] "${leaf.title}" 편입 스킵(깊이 초과)`);
        }
      }
      const groups = new Map();
      for (const a of assigns) {
        const leaf = nodes.get(a.id); if (leaf.parentId !== root.id) continue;
        const key = (a.newTheme || '').trim();
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(leaf);
      }
      for (const [key, members] of groups) {
        const meaningful = members.filter((m) => m.title.trim() !== key);
        if (meaningful.length < 2) { log.push(`[cluster] 테마 "${key}" 스킵(고아 ${meaningful.length}개 → 최상위 유지)`); continue; }
        const t = addConcept(key, root.id, null, '테마');
        log.push(`[cluster] 새 테마 "${key}"(${t.id}) ← ${meaningful.map((m) => m.title).join(', ')}`);
        for (const m of meaningful) safeReparent(m.id, t.id);
      }
    }
  }

  const cnt = (t) => log.filter((l) => l.startsWith(`[${t}]`)).length;
  const maxDepth = Math.max(...[...nodes.values()].map((n) => n.level));
  const stats = {
    variant, conceptCount: concepts().length, maxDepth,
    merge: cnt('merge'), mergeGlobal: cnt('merge*'), child: cnt('child'),
    parent: cnt('parent'), attach: cnt('attach'), cluster: cnt('cluster'), flip: cnt('flip'),
    theme: cnt('theme'), themeRejected: cnt('theme✗'),
  };
  return { nodes, rootId: root.id, stats, log };
}

// ─── 직렬화: nodes Map → 저장 가능한 트리 JSON (emb 제외) ─────
export function serializeTree(nodes, rootId) {
  const plain = [...nodes.values()].map(({ emb, ...rest }) => rest);
  return { rootId, nodes: plain };
}

// ─── 안정성 지표: 메모 페이지 쌍의 관계 라벨 ─────────────────
// 개념 "이름"은 실행마다 달라질 수 있으므로, 항상 안정적인 메모 페이지를 기준으로
// 쌍 (p,q)의 트리 관계를 라벨링한다: merged | p⊃q | q⊃p | sibling | none
export function memoPairRelations(nodes, rootId) {
  const byPage = new Map(); // page → nodeIds[]
  for (const n of nodes.values()) {
    if (n.kind !== 'concept') continue;
    for (const p of n.sources) {
      if (!byPage.has(p)) byPage.set(p, []);
      byPage.get(p).push(n.id);
    }
  }
  const isAnc = (aId, bId) => { let c = nodes.get(bId); while (c && c.parentId) { if (c.parentId === aId) return true; c = nodes.get(c.parentId); } return false; };
  const pages = [...byPage.keys()].sort((a, b) => a - b);
  const rel = {};
  for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) {
    const p = pages[i], q = pages[j];
    const pn = byPage.get(p), qn = byPage.get(q);
    let label = 'none';
    if (pn.some((a) => qn.includes(a))) label = 'merged';
    else if (pn.some((a) => qn.some((b) => isAnc(a, b)))) label = 'p⊃q';
    else if (pn.some((a) => qn.some((b) => isAnc(b, a)))) label = 'q⊃p';
    else if (pn.some((a) => qn.some((b) => nodes.get(a).parentId === nodes.get(b).parentId && nodes.get(a).parentId !== rootId))) label = 'sibling';
    rel[`${p}-${q}`] = label;
  }
  return rel;
}
