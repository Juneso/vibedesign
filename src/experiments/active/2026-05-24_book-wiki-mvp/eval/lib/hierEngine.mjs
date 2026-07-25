// 위계 인제스트 엔진 — protoHierIngestV5 로직을 variant 파라미터로 재사용 가능하게 추출.
// variant:
//  - 'v5' : V5 그대로 (place 4택 = merge/child/parent/attach, 존중형 cluster)
//  - 'v6' : V5 + A(치환 테스트 프롬프트) + B(child/parent 양방향 교차검증, 불일치→attach)
//  - 'v7' : V6 + 테마 주역화 — Phase2 전면 재설계:
//           · 테마마다 name+description(책이 이 테마로 말하는 것) 필수, 책 summary+toc 앵커링
//           · 테마별 독립 critic 반증(책 핵심 부합? 억지 멤버?) — 탈락 테마 해체
//           · 같은 메모 출신 개념쌍은 sim 문턱 무시하고 동의어 검사
//           · 고아→고아 중첩 구멍 제거(테마 생성 경로로만 수직 이동)
//  - 'v8' : planIngest(알라딘 리치데이터 → 개념 페이지 + ## 개요) 위에 V7 테마 로직을 얹는 통합.
//           · Phase 1 대체: miniExtract 루프 대신 planIngest 1회 호출 (gpt-4o 필수)
//           · 개념 노드 gloss = planIngest ## 개요 디스크립션 (리치데이터 기반)
//           · Phase 1.5(동의어 병합) + Phase 2(하이브리드 anchor 테마 + critic): v7 그대로 재사용
// 사용: runHierIngest({ book, memos, llm, embedFn, variant, planIngestFn? })  → { nodes, rootId, stats, log }
//
// ⚠ 구조도 동기화: 이 엔진의 단계·프롬프트·파라미터를 바꾸면 반드시
//   eval/pipelines/hier-ingest-v7.json (eval 대시보드 왼쪽 구조도)도 같이 갱신할 것.
//   v8은 eval/pipelines/hier-ingest-v8.json 참조.

import { RELATION_NAMES, relationGuide, memberSpec, MEMBER_SPEC, PAIRED_RELATIONS } from './relationVocab.mjs';

const MAX_LEVEL = 3;

const cos = (a, b) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return s / (Math.sqrt(na) * Math.sqrt(nb)); };

export async function runHierIngest({ book, memos, llm, embedFn, variant = 'v5', planIngestFn, onProgress, forceMode }) {
  let SEQ = 0; const id = () => `n${++SEQ}`;
  const nodes = new Map(); const log = [];
  const root = { id: id(), title: book.title, parentId: null, level: 0, kind: 'root', sources: [], emb: null };
  nodes.set(root.id, root);
  const concepts = () => [...nodes.values()].filter((n) => n.kind === 'concept');
  const childrenOf = (pid) => [...nodes.values()].filter((n) => n.parentId === pid);
  // 위계 판정(고아/테마 여부, 프롬프트의 "하위:" 나열)은 개념 자식만 본다.
  // 문장 노드까지 세면 문장이 달린 키워드가 전부 "테마"로 오인되고,
  // 고아 구제 단계도 대상이 사라져 무력화된다.
  const conceptChildrenOf = (pid) => childrenOf(pid).filter((n) => n.kind === 'concept');
  const ancestry = (n) => { const path = []; let c = n; while (c && c.parentId) { c = nodes.get(c.parentId); if (c && c.kind === 'concept') path.unshift(c.title); } return path.join(' › ') || '(최상위)'; };
  const isAncestor = (aId, bId) => { let c = nodes.get(bId); while (c && c.parentId) { if (c.parentId === aId) return true; c = nodes.get(c.parentId); } return false; };
  function addConcept(title, parentId, emb, gloss) {
    const lvl = nodes.get(parentId).level + 1;
    const n = { id: id(), title, parentId, level: lvl, kind: 'concept', sources: [], emb, gloss };
    nodes.set(n.id, n); return n;
  }
  // 메모 한 건 = 문장 노드 한 개. 키워드(개념)의 자식으로 붙어 출처를 그대로 들고 있다.
  // 개념과 달리 위계 연산(병합·테마·채택)의 대상이 아니다 — kind 로 구분된다.
  function addSentence(title, parentId, { memoId, p, tocAnchor, gloss }) {
    const lvl = nodes.get(parentId).level + 1;
    const n = { id: id(), title, parentId, level: lvl, kind: 'sentence', sources: p ? [p] : [], emb: null, gloss, memoId, tocAnchor };
    nodes.set(n.id, n); return n;
  }
  function reparent(nodeId, newParentId) {
    nodes.get(nodeId).parentId = newParentId;
    const relevel = (nid) => { const x = nodes.get(nid); x.level = nodes.get(x.parentId).level + 1; childrenOf(nid).forEach((k) => relevel(k.id)); };
    relevel(nodeId);
  }
  // 문장 노드는 표현용 잎이라 위계 깊이로 세지 않는다 —
  // 세면 MAX_LEVEL 에 걸려 테마 편성·상위 채택이 막힌다.
  const subtreeDepth = (nid) => { const kids = childrenOf(nid).filter((k) => k.kind !== 'sentence'); return kids.length ? 1 + Math.max(...kids.map((k) => subtreeDepth(k.id))) : 0; };
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

  // v8: planIngest 1회 호출 → 개념 페이지(## 개요 포함) → 노드화
  let v8PageCount = 0;
  let planAnalyses = []; // v11 이 메모별 역할(thesis·keyConcepts·bookContextLink)을 위계 축으로 재사용한다
  if (variant === 'v8' || variant === 'v10' || variant === 'v11') {
    if (!planIngestFn) throw new Error(`${variant} requires planIngestFn`);
    // memos에 id 부여 (planIngest가 소비하는 형식: id='m'+p)
    const memosWithId = memos.map((m) => ({ ...m, id: `m${m.p}`, chapter: m.chapter || '', myThought: m.my || '' }));
    onProgress?.('phase 1 — planIngest 호출(gpt-4o)...');
    const out = await planIngestFn({ memos: memosWithId, book, existingPages: [], contexts: [], profile: {} });
    planAnalyses = out.analyses || [];
    log.push(`[plan] planIngest 완료 · patches=${out.patches?.length ?? 0} analyses=${out.analyses?.length ?? 0}`);

    // ## 개요 파서 (protoRealMeta 와 동일)
    const overview = (body = '') => {
      const m = body.match(/##\s*개요\s*([\s\S]*?)(\n##\s|$)/);
      return (m ? m[1] : body).trim().replace(/\[\^[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    };
    // pageOf: memo id → 페이지 번호
    const pageOf = (memoId) => Number(String(memoId).replace(/^m/, ''));

    // create 패치 → 개념 노드
    for (const pt of out.patches || []) {
      const pd = pt.pageDraft; if (!pd || pt.action !== 'create') continue;
      const gloss = overview(pd.body || '');
      const src = [...new Set((pd.sources || []).filter((s) => s.kind === 'memo').map((s) => pageOf(s.id)))].filter(Boolean);
      const emb = await embedFn(`${pd.title}: ${gloss}`);
      const n = addConcept(pd.title, root.id, emb, gloss);
      n.sources.push(...src);
      v8PageCount++;
      log.push(`[plan] 페이지→노드 "${pd.title}" · 개요 ${gloss.slice(0, 50)}… · 소스 p${src.join(',p') || '(없음)'}`);
    }

    // analyses → 문장 노드. 메모의 thesis 는 책 맥락에 앵커된 1~2문장이므로,
    // 버리지 않고 해당 키워드의 자식으로 전부 남긴다.
    // (이전에는 패치에 커버되지 않은 메모만 *개념 노드로 승격*시켰다 —
    //  커버된 메모의 thesis 는 버려졌고, 승격된 것들은 키워드 수를 불렸다.)
    let attached = 0, madeConcept = 0;
    const pageHost = new Map(); // 페이지 → 그 메모를 소스로 가진 개념
    for (const c of concepts()) for (const p of c.sources) if (!pageHost.has(p)) pageHost.set(p, c);

    for (const a of out.analyses || []) {
      const p = pageOf(a.memoId);
      const text = String(a.thesis || '').trim();
      if (!text) continue;

      // 붙일 키워드 찾기: ① keyConcepts 이름 일치 ② 페이지 일치 ③ 의미상 최근접.
      // ⚠ 페이지 일치를 1순위로 두면 내용 검증 없이 무관한 메모를 흡수한다 —
      //   "대등 욕망"에 68혁명·기초소득 문장이 붙은 실측 사례. planIngest 가 키워드 소스
      //   페이지를 느슨하게 주장할 수 있으므로, 페이지 호스트가 의미상 크게 밀리면 최근접으로 교체.
      const e = await embedFn(text);
      const pool = concepts().filter((c) => c.emb);
      const semHost = pool.length ? pool.reduce((best, c) => (!best || cos(e, c.emb) > cos(e, best.emb) ? c : best), null) : null;
      let host = concepts().find((c) => (a.keyConcepts || []).some((k) => c.title === k))
        || pageHost.get(p);
      if (host && semHost && host.emb && cos(e, semHost.emb) - cos(e, host.emb) > 0.05) host = semHost;
      if (!host) host = semHost;
      // 최근접이라도 유사도가 낮으면 억지로 붙이지 않는다 — "대등 욕망"에 기초소득·68혁명
      // 문장이 흡수된 실측 원인. 그 메모의 keyConcept 로 새 키워드를 세우는 쪽이 맞다.
      const ATTACH_MIN = 0.3;
      if (host && host.emb && cos(e, host.emb) < ATTACH_MIN && (a.keyConcepts || []).length) {
        const title = a.keyConcepts[0];
        const kw = addConcept(title, root.id, await embedFn(`${title}: ${text}`), '');
        kw.sources.push(p);
        pageHost.set(p, kw);
        log.push(`[plan] 유사도 미달(${cos(e, host.emb).toFixed(2)} < ${ATTACH_MIN}) → 키워드 신설 "${title}"`);
        host = kw;
        madeConcept++;
      }

      // 개념이 하나도 없을 때만(패치 전멸) 최소한의 키워드를 만든다
      if (!host) {
        const title = (a.keyConcepts || [])[0] || text.slice(0, 14) || '기타';
        host = addConcept(title, root.id, await embedFn(`${title}: ${text}`), text);
        host.sources.push(p);
        pageHost.set(p, host);
        madeConcept++;
        continue; // 이 경우 개념 자체가 그 문장이라 자식을 또 만들지 않는다
      }

      if (!host.sources.includes(p)) host.sources.push(p);
      addSentence(text, host.id, {
        memoId: a.memoId, p, tocAnchor: a.tocAnchor || '',
        gloss: [a.thesis, a.bookContextLink].filter(Boolean).join(' '),
      });
      attached++;
    }
    log.push(`[plan] 문장 노드 ${attached}개 부착 · 개념 신설 ${madeConcept}개`);

    // ─── Phase 1.2: 과부하 키워드 분할 ───────────────────────────
    // 키워드 하나가 메모를 너무 많이 흡수하면(예: 23개 중 12개) 그건 요약이 아니라
    // 잡동사니 서랍이다. 문장이 SPLIT_MAX 를 넘으면 새 키워드로 쪼갠다.
    // 위계를 깊게 만들지 않도록 *형제*로 만든다 — 깊이는 테마 단계가 담당한다.
    const SPLIT_MAX = Number(process.env.SPLIT_MAX || 6);
    const sentencesOf = (nid) => childrenOf(nid).filter((k) => k.kind === 'sentence');
    for (const kw of concepts()) {
      const sents = sentencesOf(kw.id);
      if (sents.length <= SPLIT_MAX) continue;
      onProgress?.(`phase 1.2 — "${kw.title}" 분할(${sents.length}문장)`);
      // 분할 후 키워드당 문장이 SPLIT_MAX 이하가 되는 최소 개수 — 더 잘게 쪼개면 1문장 키워드가 쏟아진다
      const want = Math.min(4, Math.max(2, Math.ceil(sents.length / SPLIT_MAX)));
      const raw = await llm({
        system: '한 키워드에 메모가 과하게 몰렸다. 메모들을 의미가 통하는 하위 키워드로 나눈다. 모든 메모를 빠짐없이 배정하고, 억지 분류 대신 자연스러운 묶음을 만든다. JSON만 출력.',
        user: `책: ${book.title}\n현재 키워드: ${kw.title}\n설명: ${kw.gloss || ''}\n\n[메모 문장]\n${sents.map((s, i) => `${i}: ${s.title}`).join('\n')}\n\n이 문장들을 **정확히 ${want}개** 키워드로 나눠라. 각 키워드에 문장이 **최소 2개** 들어가야 한다(1개짜리 금지). 각 키워드는:\n- name: 짧은 명사구. "${kw.title}" 를 그대로 쓰지 말 것.\n- overview: 2~3문장. 이 키워드가 무엇인지 **책의 맥락에서** 설명. "이 책은 …" 처럼 책 전체 주제와 연결할 것.\n- idx: 위 번호 배열 (모든 번호가 정확히 한 번씩 배정돼야 함)\n출력 JSON: {"groups":[{"name":"...","overview":"...","idx":[0,1]}]}`,
        temperature: 0.1,
      });
      let groups = [];
      try { groups = (JSON.parse(raw).groups || []).filter((g) => g.name && (g.idx || []).length); } catch { /* 파싱 실패 시 분할 포기 */ }

      // ⚠ 프롬프트의 개수 요청은 지켜지지 않는다(2개 요청에 7개가 오기도 한다).
      //   검증 없이 받으면 문장 1개짜리 키워드가 쏟아져 되레 키워드 폭발이 된다.
      //   ① 문장 2개 미만 그룹은 버린다(그 문장은 원래 키워드에 남는다)
      //   ② 큰 그룹부터 want 개까지만 채택한다
      const MIN_GROUP = 2;
      groups = groups
        .filter((g) => (g.idx || []).length >= MIN_GROUP)
        .sort((a, b) => (b.idx || []).length - (a.idx || []).length)
        .slice(0, want);
      if (groups.length < 2) { log.push(`[split] "${kw.title}" 분할 포기(유효 그룹 ${groups.length}) — 유지`); continue; }

      const used = new Set();
      for (const g of groups) {
        const picked = (g.idx || []).map(Number).filter((i) => sents[i] && !used.has(i));
        if (!picked.length) continue;
        picked.forEach((i) => used.add(i));
        const gloss = String(g.overview || '').trim();
        const node = addConcept(String(g.name).trim(), kw.parentId, await embedFn(`${g.name}: ${gloss}`), gloss);
        for (const i of picked) {
          reparent(sents[i].id, node.id);
          for (const p of sents[i].sources) if (!node.sources.includes(p)) node.sources.push(p);
        }
      }
      // 배정 안 된 문장은 원래 키워드에 남긴다(유실 방지)
      const left = sents.filter((_, i) => !used.has(i));
      kw.sources = [...new Set(left.flatMap((s) => s.sources))];
      log.push(`[split] "${kw.title}" ${sents.length}문장 → 새 키워드 ${groups.length}개 · 잔류 ${left.length}`);
      if (!left.length && !conceptChildrenOf(kw.id).length) nodes.delete(kw.id); // 빈 껍데기 제거
    }
    log.push(`[plan] Phase1 완료 · 개념 노드 ${concepts().length}개 (planIngest 페이지 ${v8PageCount}개)`);

  } else {
    // v5/v6/v7: 기존 extract/place 루프
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
  }

  // ─── Phase 1.5: 동의어 병합 패스 (V5와 동일) ─────────────────
  {
    onProgress?.('phase 1.5 — 동의어 병합');
    const cs = concepts().filter((n) => n.emb);
    const pairs = [];
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const sim = cos(cs[i].emb, cs[j].emb);
      // v7/v8: 같은 메모에서 나온 개념쌍은 extract 자기중복 가능성이 높다 — sim 문턱 무시하고 검사
      const sameMemo = (variant === 'v7' || variant === 'v8' || variant === 'v10' || variant === 'v11') && cs[i].sources.some((p) => cs[j].sources.includes(p));
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

  // ─── Phase 2 (v10): 책의 논지 전개 방식에 맞춘 위계 (BKT-380) ──────
  // v7/v8 은 "테마"라는 한 가지 모양으로만 상위를 만든다. 책마다 이야기를 풀어가는
  // 방식이 다른데(통시·분류·비교…) 결과가 늘 같은 모양이면 책의 척추가 드러나지 않는다.
  // 예: 사상사를 시간 순으로 훑는 책인데 루소·칸트가 키워드로 올라오지 못하고 문장에만 남는다.
  let v10Mode = null;
  if (variant === 'v10') {
    const ORDERED = new Set(['통시', '과정', '인과']); // 순서가 의미를 갖는 방식 → 번호를 붙인다
    const MODES = RELATION_NAMES; // 단일 소스: lib/relationVocab.mjs
    const rich = [book.summary, book.aladin?.intro, book.aladin?.publisherIntro, book.aladin?.excerpts]
      .filter(Boolean).join('\n').slice(0, 3000);
    const kws = concepts().filter((n) => n.parentId === root.id);
    const kwLine = kws.map((n) => `${n.id} | ${n.title} — ${(n.gloss || '').slice(0, 70)} [p${[...new Set(n.sources)].sort((a, b) => a - b).join(',')}]`).join('\n');

    // 1) 전개 방식 판정 — 키워드가 아니라 **목차의 형태**에서 읽는다.
    //    첫 실행에서 5회 중 5회가 "분석/분류(high)"로 쏠렸다(서양미술사조차 통시가 안 나옴).
    //    키워드는 판정 근거에서 빼고, 목차 장 제목의 구조 신호(시대·연도·계보=통시,
    //    병렬 범주=분류, "~란 무엇인가"=분석…)를 근거로 삼되 근거 장 제목을 인용하게 강제한다.
    //    인용이 실제 목차와 대조되지 않으면 코드에서 확신도를 강등 — "high 과신" 방어.
    // forceMode 가 주어지면 판정을 건너뛴다(판정 A/B용 수동 오버라이드).
    onProgress?.('phase 2 — 전개 방식 판정');
    const nrm = (s) => String(s || '').normalize('NFC').replace(/\s+/g, '').toLowerCase();
    const toc = (book.toc || []).map(String).filter(Boolean);
    const modeRaw = forceMode ? JSON.stringify({ mode: forceMode, confidence: 'high', reason: '수동 지정(A/B)' }) : await llm({
      system: '비문학 책이 내용을 풀어가는 방식을 목차와 책 소개에서 판정한다. 가장 강한 신호는 목차 장 제목의 구조다: 시대·연도·인물 계보가 이어지면 통시, 병렬 범주 나열이면 분류, "~란 무엇인가"·구성 요소 해부면 분석, 두 대상이 오가면 비교. 통시·과정·인과처럼 순서가 성립하면 그것을 우선하라 — 순서는 다른 방식이 흉내낼 수 없는 정보다. tocEvidence 에는 판단 근거가 된 목차 장 제목을 그대로 옮겨 적어라(목차가 없으면 빈 배열). 부차적으로 섞인 방식이 있으면 secondaryMode 로 표시하라. JSON만 출력.',
      user: `책: ${book.title}\n\n[목차]\n${toc.map((t, i) => `${i + 1}. ${t}`).join('\n') || '(없음)'}\n\n[책 소개·서평]\n${rich || '(없음)'}\n\n[관계 어휘 — 정의와 오용 주의]\n${relationGuide()}\n출력 JSON: {"mode":"후보 중 하나","secondaryMode":"후보 중 하나 또는 null","confidence":"high|med|low","tocEvidence":["근거가 된 목차 장 제목"],"reason":"한 줄"}`,
      temperature: 0,
    });
    let m = {}; try { m = JSON.parse(modeRaw); } catch { /* 판정 실패 */ }
    v10Mode = MODES.includes(m.mode) ? { mode: m.mode, secondaryMode: MODES.includes(m.secondaryMode) ? m.secondaryMode : null, confidence: m.confidence || 'low', reason: m.reason || '', tocEvidence: Array.isArray(m.tocEvidence) ? m.tocEvidence : [] } : null;
    // 근거 검증: 목차가 있는데 인용한 장 제목이 실제 목차와 하나도 안 맞으면 지어낸 근거 → low 강등.
    if (v10Mode && toc.length && !forceMode) {
      const hit = v10Mode.tocEvidence.filter((e) => toc.some((t) => nrm(t).includes(nrm(e)) || nrm(e).includes(nrm(t))));
      if (!hit.length) { v10Mode.confidence = 'low'; log.push('[v10] tocEvidence 가 실제 목차와 불일치 → confidence 강등(low)'); }
    }
    log.push(`[v10] 전개 방식 판정: ${v10Mode ? `${v10Mode.mode}${v10Mode.secondaryMode ? `(+${v10Mode.secondaryMode})` : ''} (${v10Mode.confidence}) — ${v10Mode.reason}` : '판정 실패'}`);

    // ⚠ 판정이 틀리면 구조가 통째로 어긋난다. 확신이 낮으면 상위를 만들지 않고 평면으로 둔다.
    if (v10Mode && v10Mode.confidence === 'low') {
      log.push('[v10] confidence=low → 위계 구성 생략(평면 유지)');
    } else if (v10Mode && kws.length >= 3) {
      const ordered = ORDERED.has(v10Mode.mode);
      onProgress?.(`phase 2 — ${v10Mode.mode} 위계 구성`);
      const want = Math.min(5, Math.max(2, Math.round(kws.length / 3)));
      const guide = ordered
        ? `이 책은 "${v10Mode.mode}" 방식이다. 키워드를 **책이 전개되는 순서대로** 묶어 단계를 만들어라. 단계 이름은 그 시기·국면을 가리키는 짧은 명사구(예: "고대의 투모스", "근대 시민혁명").`
        : `이 책은 "${v10Mode.mode}" 방식이다. 그 방식에 맞는 축으로 키워드를 묶어라(분류=갈래, 비교/대조=견주는 대상, 인과=원인과 결과, 정의/분석=구성 요소).`;
      const stageRaw = await llm({
        system: '키워드를 책의 전개 방식에 맞는 상위 묶음으로 편성한다. 목차가 있으면 묶음은 목차의 장 흐름에 정렬돼야 한다. 억지로 다 묶지 말고, 어울리지 않는 키워드는 남겨라. JSON만 출력.',
        user: `책: ${book.title}\n\n[목차]\n${toc.join(' · ') || '(없음)'}\n\n[책 소개·서평]\n${rich.slice(0, 1500) || '(없음)'}\n\n[키워드]\n${kwLine}\n\n${guide}\n묶음은 **정확히 ${want}개**, 각 묶음에 키워드 **최소 2개**. 어디에도 안 맞는 키워드는 memberIds 에서 빼라.\n각 묶음: name(짧은 명사구) · description(2~3문장, 이 책이 이 단계/축으로 무엇을 말하는지) · memberIds\n${ordered ? '순서대로 배열하라 — 배열 순서가 곧 책의 전개 순서다. 키워드 옆 [p숫자]가 책 속 위치이니 순서 판단에 활용하라.' : ''}\n출력 JSON: {"stages":[{"name":"...","description":"...","memberIds":["n?"]}]}`,
        temperature: 0.1,
      });
      let stages = []; try { stages = (JSON.parse(stageRaw).stages || []); } catch { /* 파싱 실패 */ }

      // ⚠ 개수·크기 제약은 프롬프트로 지켜지지 않는다(이번 세션에서 2개 요청에 7개가 온 적 있다).
      //   코드로 강제: 유효 멤버 2개 이상 · want 개까지 · 멤버 중복 금지.
      const used = new Set();
      const valid = [];
      for (const st of stages) {
        const ids = (st.memberIds || []).filter((id) => kws.some((k) => k.id === id) && !used.has(id));
        if (ids.length < 2 || !st.name) continue;
        ids.forEach((id) => used.add(id));
        valid.push({ ...st, ids });
        if (valid.length >= want) break;
      }
      // 순서형 검증(공짜): 메모의 페이지 번호로 단계 순서가 진짜인지 확인한다.
      // 통시가 진짜면 단계별 중앙 페이지가 대체로 단조증가한다. 뒤로 크게 되돌아가는
      // 역전이 있으면 "순서인 척하는 가짜 단계"(존중정치학 강제 통시에서 실측) → 평면 유지.
      if (ordered && valid.length >= 2) {
        const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
        const meds = valid.map((st) => median(st.ids.flatMap((id) => nodes.get(id).sources)));
        const inversions = meds.filter((v, i) => i > 0 && v < meds[i - 1] - 15).length;
        if (inversions > 0) {
          log.push(`[v10] 순서 검증 실패(페이지 역전 ${inversions}건: ${meds.join('→')}) — 가짜 순서로 판단, 평면 유지`);
          valid.length = 0;
        } else {
          log.push(`[v10] 순서 검증 통과(단계 중앙 페이지 ${meds.join('→')})`);
        }
      }

      if (valid.length < 2) {
        log.push(`[v10] 단계 편성 포기(유효 ${valid.length}개) — 평면 유지`);
      } else {
        const norm = (s) => String(s || '').normalize('NFC').replace(/\s+/g, '').toLowerCase();
        valid.forEach((st, i) => {
          const name = String(st.name).trim();
          // ⚠ LLM 이 단계 이름으로 기존 키워드명을 재사용한다("인정 욕구" 단계 + "인정 욕구" 키워드).
          //   같은 이름이 두 노드로 뜨면 중복으로 보이므로, 이름이 겹치는 키워드가 멤버에 있으면
          //   새 노드를 만들지 않고 그 키워드를 단계로 승격해 나머지를 그 아래로 넣는다.
          const dupId = st.ids.find((id) => norm(nodes.get(id).title) === norm(name));
          let node;
          if (dupId) {
            node = nodes.get(dupId);
            if (ordered) node.title = `${i + 1} · ${node.title}`;
            if (st.description && !node.gloss) node.gloss = String(st.description).trim();
          } else {
            node = addConcept(ordered ? `${i + 1} · ${name}` : name, root.id, null, String(st.description || '').trim());
          }
          node.stageIndex = ordered ? i + 1 : null;
          for (const id of st.ids) if (id !== dupId) safeReparent(id, node.id);
          for (const id of st.ids) for (const p of nodes.get(id).sources) if (!node.sources.includes(p)) node.sources.push(p);
        });
        log.push(`[v10] ${v10Mode.mode} → 단계 ${valid.length}개 편성 · 미편입 키워드 ${kws.length - used.size}개`);

        // 3) 국소 방식 2층 위계 — 책은 한 방식으로만 전개되지 않는다(통시 뼈대 + 단계 안 분석).
        //    키워드가 몰린 단계(6개+)는 그 안에서 부차 방식의 축으로 한 번 더 묶는다.
        //    run 7 의 "미술의 본질" 16개 덤핑 버킷이 이 단계의 표적. MAX_LEVEL=3 안에 들어간다.
        // ⚠ 2차 배정(2.7) 전에는 단계당 키워드가 2~3개뿐이라 발동 기준에 안 걸린다(run 12 실측)
        //   → 함수로 묶고 2.7 이후에 호출한다.
        const SUB_MIN = 6;
        const runSubgrouping = async () => {
        for (const stNode of [...nodes.values()].filter((n) => n.kind === 'concept' && n.parentId === root.id && n.stageIndex !== undefined)) {
          const members = conceptChildrenOf(stNode.id);
          if (members.length < SUB_MIN) continue;
          onProgress?.(`phase 2.5 — "${stNode.title}" 내부 축 편성(${members.length}개)`);
          const memberLine = members.map((n) => `${n.id} | ${n.title} — ${(n.gloss || '').slice(0, 60)}`).join('\n');
          const localHint = v10Mode.secondaryMode ? `이 책의 부차 전개 방식은 "${v10Mode.secondaryMode}"다. 우선 그 축을 검토하라.` : '';
          const subRaw = await llm({
            system: '한 단계 안에 몰린 키워드를, 그 단계 내부의 전개 축(분석=구성 요소, 분류=갈래, 비교=견주는 대상…)으로 2~3개 하위 묶음으로 나눈다. 축이 정말 없으면 빈 배열을 내라 — 억지로 나누는 것이 안 나누는 것보다 나쁘다. JSON만 출력.',
            user: `책: ${book.title}\n단계: ${stNode.title} — ${(stNode.gloss || '').slice(0, 200)}\n${localHint}\n\n[이 단계의 키워드]\n${memberLine}\n\n하위 묶음 2~3개, 각 묶음 키워드 최소 2개. 어디에도 안 맞으면 빼라.\n출력 JSON: {"groups":[{"name":"짧은 명사구","description":"1~2문장","memberIds":["n?"]}]}`,
            temperature: 0.1,
          });
          let groups = []; try { groups = (JSON.parse(subRaw).groups || []); } catch { /* 파싱 실패 */ }
          const subUsed = new Set();
          let made = 0;
          for (const g of groups.slice(0, 3)) {
            const ids = (g.memberIds || []).filter((id) => members.some((mn) => mn.id === id) && !subUsed.has(id));
            if (ids.length < 2 || !g.name) continue;
            // 하위 묶음이 단계 전체를 삼키면 층만 늘어난다 — 전체와 같으면 만들지 않는다.
            if (ids.length >= members.length) continue;
            const dupId = ids.find((id) => norm(nodes.get(id).title) === norm(String(g.name).trim()));
            let sub;
            if (dupId) { sub = nodes.get(dupId); if (g.description && !sub.gloss) sub.gloss = String(g.description).trim(); }
            else sub = addConcept(String(g.name).trim(), stNode.id, null, String(g.description || '').trim());
            for (const id of ids) { if (id !== dupId) safeReparent(id, sub.id); subUsed.add(id); }
            for (const id of ids) for (const p of nodes.get(id).sources) if (!sub.sources.includes(p)) sub.sources.push(p);
            made++;
          }
          if (made) log.push(`[v10] "${stNode.title}" 내부 축 ${made}개 편성(키워드 ${subUsed.size}/${members.length})`);
          // 미발동이 "축 없음 판단"인지 "검증 탈락"인지 구분되지 않으면 디버깅이 안 된다(run 9에서 실측).
          else log.push(`[v10] "${stNode.title}" 내부 축 미편성 — LLM 제안 ${groups.length}개, 검증 통과 0개`);
        }
        };

        // 4) 미편입 2차 배정 — 단계가 선 뒤에도 루트에 남은 키워드가 절반이면 위계가 무의미하다
        //    (서양미술사 16/29, 피로사회 13/14 실측). LLM 재질의 대신 임베딩 근접 단계로 붙인다.
        //    문턱 미달이면 그대로 둔다 — 억지 편입이 미편입보다 나쁘다는 원칙은 유지.
        const stageNodes = [...nodes.values()].filter((n) => n.kind === 'concept' && n.parentId === root.id && n.stageIndex !== undefined);
        const leftovers = kws.filter((k) => !used.has(k.id) && nodes.get(k.id)?.parentId === root.id);
        if (stageNodes.length >= 2 && leftovers.length && embedFn) {
          onProgress?.(`phase 2.7 — 미편입 ${leftovers.length}개 근접 단계 배정`);
          const ASSIGN_MIN = 0.35;   // 코사인 단독 배정의 문턱
          const COS_FLOOR = 0.2;     // 페이지 적합 배정의 의미 바닥(엉뚱 배정 방지)
          const SPREAD_MAX = 60;     // 이보다 페이지 산포가 크면 책 전반 관통 개념 → 구간 신호 없음
          const sEmbs = [];
          for (const s of stageNodes) sEmbs.push(await embedFn(`${s.title.replace(/^\d+ · /, '')} — ${(s.gloss || '').slice(0, 200)}`));
          // 순서형에서 "단계 순서 = 책 순서"는 페이지 단조성으로 이미 검증한 불변식이다.
          // 그 불변식을 배정에 재사용: 산포가 좁은 키워드는 중앙 페이지가 속하는(가까운) 단계로.
          // 코사인은 의미가 완전히 어긋난 배정을 막는 바닥 검사로만 쓴다("중세 미술→근대" 오배치 방지).
          const ranges = ordered ? stageNodes.map((s) => (s.sources.length ? [Math.min(...s.sources), Math.max(...s.sources)] : null)) : null;
          let moved = 0, byPage = 0;
          for (const k of leftovers) {
            const kn = nodes.get(k.id);
            const e = await embedFn(`${kn.title} — ${(kn.gloss || '').slice(0, 200)}`);
            const ps = [...new Set(kn.sources)].sort((a, b) => a - b);
            const med = ps.length ? ps[Math.floor(ps.length / 2)] : null;
            const spread = ps.length ? ps[ps.length - 1] - ps[0] : Infinity;
            let bi = -1;
            if (ordered && med != null && spread <= SPREAD_MAX) {
              let bd = Infinity;
              ranges.forEach((r, idx) => {
                if (!r) return;
                const d = med < r[0] ? r[0] - med : med > r[1] ? med - r[1] : 0;
                if (d < bd) { bd = d; bi = idx; }
              });
              if (bi >= 0 && cos(e, sEmbs[bi]) < COS_FLOOR) bi = -1; // 페이지는 맞지만 의미가 엉뚱하면 포기
              if (bi >= 0) byPage++;
            }
            if (bi < 0) {
              let best = -1;
              sEmbs.forEach((se, idx) => { const s = cos(e, se); if (s > best) { best = s; bi = idx; } });
              if (best < ASSIGN_MIN) bi = -1;
            }
            if (bi >= 0 && safeReparent(k.id, stageNodes[bi].id)) {
              for (const p of kn.sources) if (!stageNodes[bi].sources.includes(p)) stageNodes[bi].sources.push(p);
              moved++;
            }
          }
          log.push(`[v10] 미편입 2차 배정: ${moved}/${leftovers.length}개 이동(페이지 적합 ${byPage} · 코사인 ${moved - byPage})`);
        }
        await runSubgrouping(); // 2층 위계는 단계가 채워진 뒤에야 의미가 있다
      }
    }
  }

  // ─── Phase 2 (v11): 관계 축 위계 — 전개 방식을 "핵심 개념에 대한 관계"로 (BKT-380) ──
  // v10 은 책 전체에 방식 하나를 골랐지만 전개 방식은 원래 대목 단위 속성이다.
  // 존중정치학: 어떤 대목은 정체성 정치의 기원을(통시), 어떤 대목은 개념 구조를(분석) 말한다.
  // → 핵심 개념 1개를 세우고, 그 아래를 "X의 개념(분석) · X의 기원(통시) …" 관계 축으로 편성.
  // 각 문장이 책 전체에서 맡는 역할은 planIngest 의 analyses(thesis·keyConcepts·bookContextLink)가
  // 이미 담고 있다 — 지금까지 문장 텍스트로만 쓰이고 축 신호로는 버려지던 정보다.
  if (variant === 'v11') {
    const MODES = RELATION_NAMES; // 단일 소스: lib/relationVocab.mjs
    const nrm = (s) => String(s || '').normalize('NFC').replace(/\s+/g, '').toLowerCase();
    const rich = [book.summary, book.aladin?.intro, book.aladin?.publisherIntro, book.aladin?.excerpts]
      .filter(Boolean).join('\n').slice(0, 3000);
    const toc = (book.toc || []).map(String).filter(Boolean);
    const sentOf = (nid) => childrenOf(nid).filter((k) => k.kind === 'sentence');

    // 0) keyConcepts 승격 — planIngest 가 메모마다 뽑았지만 키워드가 되지 못한 개념을 발굴한다.
    //    (존중정치학에서 키워드가 5개↔18개로 출렁이는 문제의 완충: 루소·칸트·투모스류가 여기서 살아난다)
    let promoted = 0;
    const promotedNames = [];
    const kcCount = new Map();
    for (const a of planAnalyses) for (const k of (a.keyConcepts || [])) {
      const key = nrm(k); if (!key) continue;
      if (!kcCount.has(key)) kcCount.set(key, { n: 0, name: k, memoIds: [] });
      const e = kcCount.get(key); e.n++; e.memoIds.push(a.memoId);
    }
    for (const e of [...kcCount.values()].sort((a, b) => b.n - a.n)) {
      if (e.n < 2) continue;
      if (concepts().some((c) => nrm(c.title) === nrm(e.name))) continue;
      const sentNodes = [...nodes.values()].filter((n) => n.kind === 'sentence' && e.memoIds.includes(n.memoId));
      // 호스트에 문장이 3개 이상 몰려 있을 때만 빼온다 — 호스트를 비우면서까지 옮기지 않는다
      const movable = sentNodes.filter((s) => sentOf(s.parentId).length >= 3);
      if (movable.length < 2) continue;
      const kw = addConcept(e.name, root.id, await embedFn(e.name), '');
      for (const s of movable) {
        s.parentId = kw.id; s.level = kw.level + 1;
        const p = s.sources?.[0]; if (p != null && !kw.sources.includes(p)) kw.sources.push(p);
      }
      promoted++;
      promotedNames.push(`${e.name}(${e.n}회·문장 ${movable.length})`);
    }
    if (promoted) log.push(`[v11] keyConcepts 승격 ${promoted}개: ${promotedNames.join(' · ')}`);

    // 1) 핵심 개념 + 관계 축 판정 — 메모들의 thesis 가 "무엇에 대해 어떤 역할을 하는지"를 근거로
    onProgress?.('phase 2 — 핵심 개념·관계 축 판정');
    const kwList = () => concepts().filter((n) => n.parentId === root.id);
    const kwLine = () => kwList().map((n) => `${n.id} | ${n.title} — ${(n.gloss || '').slice(0, 60)} [p${[...new Set(n.sources)].sort((a, b) => a - b).join(',')}]`).join('\n');
    const thesisLine = planAnalyses.map((a) => `- ${a.thesis}${a.bookContextLink ? ` (맥락: ${String(a.bookContextLink).slice(0, 80)})` : ''}`).join('\n').slice(0, 4500);
    // ── 재료에 맞는 구조 단계 ─────────────────────────────────
    // 유저는 메모 3개일 때도, 30개일 때도 이 위키를 본다. 재료가 없는데 구조를 세우면
    // 억지가 생긴다(공정하다는 착각 8메모: core 2개 × 축 2개를 채우려다 "정치적 담론의
    // 정의 · 정의 ← 기후변화와 정치" 같은 이름-자식 불일치 발생).
    // 키워드 수에 따라 만들 수 있는 구조의 크기를 단계적으로 제한한다 —
    // 메모가 쌓이면 구조도 함께 자란다.
    const kwNow = kwList().length;
    const stage = kwNow < 5 ? { name: '씨앗', cores: 0, facets: 0 }
      : kwNow < 10 ? { name: '새싹', cores: 1, facets: 2 }
      : kwNow < 16 ? { name: '자람', cores: 2, facets: Math.floor(kwNow / 2) }
      : { name: '무성', cores: 5, facets: Math.floor(kwNow / 2) };
    log.push(`[v11] 구조 단계 "${stage.name}" — 키워드 ${kwNow}개 → 핵심 개념 최대 ${stage.cores}개 · 축 최대 ${stage.facets}개`);
    if (!stage.cores) {
      log.push('[v11] 아직 구조를 세우지 않는다 — 키워드가 적어 위계를 만들면 억지가 된다. 메모가 쌓이면 자동으로 세워진다.');
      v10Mode = { mode: '평면(재료 부족)', confidence: 'high', reason: `키워드 ${kwNow}개` };
    } else {

    // 핵심 개념은 1개 고정이 아니다 — 책이 정말로 여러 기둥 위에 서 있으면(예: 사피엔스의
    // 인지혁명·농업혁명·과학혁명) 1~5개까지 허용한다. 단 "정말 핵심일 때만"을 명시하고,
    // 확신 낮은 core 와 축 2개 미만 core 는 코드에서 걸러 남발을 막는다.
    const facetRaw = await llm({
      system: `책의 전개 방식을 책 전체 라벨이 아니라 "핵심 개념에 대한 관계"로 파악한다. 이 책을 떠받치는 핵심 개념을 세우고(보통 1개 — 책이 정말로 여러 기둥 위에 서 있을 때만 최대 5개), 각 핵심 개념마다 수집된 문장들이 그 개념에 대해 맡는 역할을 관계 축으로 나눈다 — 예: "X의 개념"(분석), "X의 기원"(통시), "X의 구성 요소"(분석), "X와 Y의 대립"(대조), "X의 현대적 양상"(예시). 축 이름은 이 책의 실제 내용을 가리키는 구체적 명사구여야 하고, relation 은 후보 중 하나다.
⚠ core 를 2개 이상 세울 때는 **서로 다른 기둥일 때만**이다. 같은 것을 다른 말로 부르는 개념(예: 인정 / 정체성 / 존엄 처럼 그 책 안에서 사실상 한 덩어리로 쓰이는 말들)은 **하나의 core 로 합치고** 나머지는 그 core 의 축으로 내려라. core 마다 why 에 "이 개념이 왜 기둥인지"를 수집된 문장을 근거로 한 줄 적어라.
핵심 개념이라 부를 만한 것이 없는 책(백과사전식·통시 일변)이면 cores 를 빈 배열로 내라. JSON만 출력.`,
      user: `책: ${book.title}\n\n[목차]\n${toc.join(' · ') || '(없음)'}\n\n[책 소개·서평]\n${rich || '(없음)'}\n\n[수집된 문장(메모별 핵심 주장)]\n${thesisLine || '(없음)'}\n\nrelation 후보는 아래 어휘 중 하나다.\n[관계 어휘 — 정의와 오용 주의]\n${relationGuide()}\n출력 JSON: {"cores":[{"name":"핵심 개념","confidence":"high|med|low","why":"이 개념이 이 책의 기둥인 이유 한 줄(수집된 문장 근거)","facets":[{"name":"구체적 축 이름","relation":"후보 중 하나","description":"1~2문장"}]}]} (core 1~5개 · core당 축 2~5개)`,
      temperature: 0,
    });
    let fj = {}; try { fj = JSON.parse(facetRaw); } catch { /* 판정 실패 */ }
    // 하위 호환: 구형 {core, coreConfidence, facets} 응답도 cores 배열로 정규화
    let cores = Array.isArray(fj.cores) ? fj.cores : (fj.core ? [{ name: fj.core, confidence: fj.coreConfidence, facets: fj.facets }] : []);
    const rawCores = cores.map((c) => ({
      name: String(c.name || '').trim(), confidence: c.confidence || 'low', why: String(c.why || '').trim(),
      facets: (c.facets || []).filter((f) => f.name && MODES.includes(f.relation)).slice(0, 5),
    }));
    // 탈락 사유를 남긴다 — 왜 이 core 가 살고 저 core 가 죽었는지 로그만 보고 알 수 있어야 한다.
    for (const c of rawCores) {
      const bad = !c.name ? '이름 없음' : c.confidence === 'low' ? '확신 low' : c.facets.length < 2 ? `축 ${c.facets.length}개(2개 미만)` : null;
      if (bad) log.push(`[v11✗] core 후보 "${c.name || '?'}" 탈락 — ${bad}`);
    }
    cores = rawCores.filter((c) => c.name && c.confidence !== 'low' && c.facets.length >= 2);
    if (cores.length > stage.cores) {
      log.push(`[v11] 구조 단계 "${stage.name}" 상한 적용: 핵심 개념 ${cores.length}개 제안 → ${stage.cores}개만 채택(${cores.slice(stage.cores).map((c) => c.name).join(', ')} 제외)`);
      cores = cores.slice(0, stage.cores);
    }

    // 축도 단계 상한을 넘지 않게 자른다 — 자식 2개쯤을 받아야 성립하므로 축 수는 재료에 묶인다.
    {
      const capTotal = Math.max(2, stage.facets);
      let total = cores.reduce((s, c) => s + c.facets.length, 0);
      if (total > capTotal) {
        for (let i = cores.length - 1; i >= 0 && total > capTotal; i--) {
          while (cores[i].facets.length > 2 && total > capTotal) { cores[i].facets.pop(); total--; }
        }
        // core 가 1개뿐이면 2개 하한도 단계 상한까지 낮춘다
        if (total > capTotal && cores.length === 1) {
          while (cores[0].facets.length > capTotal) { cores[0].facets.pop(); total--; }
        }
        log.push(`[v11] 축 상한 적용: 축 최대 ${capTotal}개 (제안 초과분 잘라냄)`);
      }
    }

    // core 끼리 사실상 같은 말이면 합친다 — 존중정치학에서 "정체성의 정치"와 "인정의 정치"가
    // 따로 서 버렸다(그 책에서 인정·정체성·존엄은 한 덩어리). 뒤에 온 core 의 축을 앞 core 로 넘긴다.
    if (cores.length > 1) {
      const cEmb = [];
      for (const c of cores) cEmb.push(await embedFn(`${c.name} ${c.why || ''}`));
      const merged = [];
      for (let i = 0; i < cores.length; i++) {
        const dupTo = merged.findIndex((_, j) => cos(cEmb[i], cEmb[cores.indexOf(merged[j])]) >= 0.72);
        if (dupTo >= 0) {
          merged[dupTo].facets = [...merged[dupTo].facets, ...cores[i].facets].slice(0, 5);
          log.push(`[v11] core 병합: "${cores[i].name}" → "${merged[dupTo].name}" (사실상 같은 개념 · 축은 흡수)`);
        } else merged.push(cores[i]);
      }
      cores = merged;
    }

    if (!cores.length) {
      log.push(`[v11] 핵심 개념 불성립(유효 core 0개) — 평면 유지`);
      v10Mode = { mode: '관계축 불성립', confidence: 'low', reason: '핵심 개념 없음 또는 전부 low' };
    } else {
      for (const c of cores) {
        log.push(`[v11] 핵심 개념 "${c.name}" (${c.confidence})${c.why ? ` — 근거: ${c.why}` : ''}`);
        log.push(`[v11] └ "${c.name}" 제안 축 ${c.facets.length}개: ${c.facets.map((f) => `${f.name}(${f.relation})`).join(' · ')}`);
      }

      // 2) 배정 — 각 키워드가 어느 core 의 어느 축 역할인지. 전체 축을 f0..fN 으로 펼쳐 1회 호출.
      onProgress?.('phase 2 — 관계 축 배정');
      const flatFacets = cores.flatMap((c, ci) => c.facets.map((f) => ({ ...f, core: c.name, ci })));
      const roleLine = kwList().map((n) => {
        const roles = sentOf(n.id).map((s) => String(s.gloss || s.title).slice(0, 70)).slice(0, 3).join(' / ');
        return `${n.id} | ${n.title}${roles ? ` — 문장 역할: ${roles}` : ''}`;
      }).join('\n');
      // ⚠ 축은 관계를 선언하는데 멤버는 아무거나 들어오던 문제(실측: "~의 대조" 축에 견주는
      //   대상이 아니라 인접 개념이 배정). 축마다 "이 관계의 자식은 무엇이어야 하는가"를
      //   명세로 붙여 준다 — 대조면 맞세워지는 양쪽, 인과면 원인과 결과, 분석이면 구성 요소.
      const assignRaw = await llm({
        system: `키워드를 핵심 개념의 관계 축에 배정한다. **축의 관계가 요구하는 역할에 맞는 키워드만** 넣어라 — 주제가 비슷하다고 넣는 것이 아니다. 대조·비교 축에는 실제로 맞세워지는 양쪽이, 인과 축에는 원인 쪽과 결과 쪽이, 분석 축에는 구성 요소가 들어와야 한다. 판단 근거는 키워드에 딸린 문장이 책에서 맡는 역할이다.
동시에, **역할이 맞는 키워드는 하나도 빠뜨리지 마라** — 목록의 키워드를 전부 훑고 어느 축의 역할에 해당하는지 판단하라. 축당 1개만 넣고 나머지를 남기는 식은 잘못이다. 정말 어느 역할에도 안 맞는 것만 남긴다.
⚠ 대조·비교·인과 축에서 **짝이 되는 양쪽이 실제로 각각 키워드로 존재할 때만** 둘을 넣어라. 그 관계가 한 문장 안에서 완결되는 경우(예: "시장 규범이 비시장 규범을 밀어낸다" 한 문장에 양쪽이 다 있는 경우)에는 **짝을 억지로 맞추지 말고 해당 키워드 하나만** 넣어라 — 그러면 그 축은 문장을 직접 거느리는 키워드가 된다. 짝이 아닌 것을 짝으로 묶는 것이 가장 나쁘다.
역할이 맞는 키워드가 최소 개수만큼 없으면 그 축은 비워 두어라(빈 축은 코드가 없앤다) — 억지로 채우지도 마라. JSON만 출력.`,
        user: `핵심 개념: ${cores.map((c) => c.name).join(' · ')}

[관계 축 — 각 축에 들어와야 하는 것]
${flatFacets.map((f, i) => `f${i} | [${f.core}] ${f.name} (${f.relation}) — ${f.description || ''}\n     └ 이 축의 자식: ${memberSpec(f.relation)}`).join('\n')}

[키워드와 문장 역할]
${roleLine}

각 키워드는 한 축에만. 역할이 안 맞으면 어느 축에도 넣지 마라.
출력 JSON: {"assign":[{"facet":"f0","memberIds":["n?"],"why":"이들이 이 관계의 자식인 이유 한 줄"}]}`,
        temperature: 0.1,
      });
      let asn = []; try { asn = (JSON.parse(assignRaw).assign || []); } catch { /* 파싱 실패 */ }

      // 3) 트리 구성: root → 핵심 개념(들) → 축(관계 라벨) → 키워드 → 문장
      const coreNodes = [];
      for (const c of cores) {
        const dup = kwList().find((k) => nrm(k.title) === nrm(c.name));
        coreNodes.push(dup || addConcept(c.name, root.id, await embedFn(c.name), ''));
      }
      const usedIds = new Set();
      const facetNodes = [];
      for (const a of asn) {
        const fi = Number(String(a.facet).replace(/^f/, ''));
        const f = flatFacets[fi]; if (!f) continue;
        const coreNode = coreNodes[f.ci];
        const ids = (a.memberIds || []).filter((id) => !coreNodes.some((cn) => cn.id === id) && kwList().some((k) => k.id === id) && !usedIds.has(id));
        if (!ids.length) { log.push(`[v11✗] 축 "${f.name}" 무산 — 배정할 키워드 없음`); continue; }
        // 관계가 요구하는 최소 자식 수를 코드로 강제한다 — 대조 축에 한쪽만 있으면 대조가 아니다.
        const need = MEMBER_SPEC[f.relation]?.min || 1;
        if (ids.length < need) {
          // 다만 대조·인과·비교는 한 문장 안에서 완결되는 일이 흔하다("A가 B를 밀어낸다").
          // 그럴 때 자식 키워드 둘을 억지로 채우면 짝이 아닌 것이 짝으로 묶인다 —
          // 축 자체를 "관계 키워드"로 세우고 그 문장들을 바로 밑에 다는 편이 정직하다.
          if (PAIRED_RELATIONS.has(f.relation) && ids.length === 1) {
            const src = nodes.get(ids[0]);
            const sents = sentOf(src.id);
            // ⚠ 전환 직전에 의미 검증을 한다. 배정이 애초에 틀렸을 때("능력주의와 패배자의 반응"
            //   축에 '정보 부족' 키워드가 배정된 실측) 전환이 그 오류를 구조로 굳혀 버린다.
            //   축 이름과 실제 문장이 겉돌면 전환하지 않고 무산시킨다.
            const axisEmb = await embedFn(`${f.name} ${f.description || ''}`);
            const fit = sents.length ? cos(axisEmb, await embedFn(sents.map((s) => s.title).join(' ').slice(0, 500))) : 0;
            const FIT_MIN = 0.3;
            if (sents.length && fit < FIT_MIN) {
              log.push(`[v11✗] 축 "${f.name}·${f.relation}" 무산 — 관계 키워드 전환을 시도했으나 문장이 축 이름과 겉돈다(적합도 ${fit.toFixed(2)} < ${FIT_MIN} · 배정된 키워드 "${src.title}")`);
              continue;
            }
            if (sents.length && !conceptChildrenOf(src.id).length) {
              const rn = addConcept(`${String(f.name).trim()} · ${f.relation}`, coreNode.id, axisEmb, String(f.description || '').trim());
              rn.relation = f.relation; rn.relationLeaf = true;
              for (const s of sents) { s.parentId = rn.id; s.level = rn.level + 1; }
              for (const p of src.sources) { if (!rn.sources.includes(p)) rn.sources.push(p); if (!coreNode.sources.includes(p)) coreNode.sources.push(p); }
              nodes.delete(src.id); usedIds.add(src.id);
              facetNodes.push(rn);
              log.push(`[v11] 관계 키워드 "${f.name}·${f.relation}" ← 문장 ${sents.length}개 직접 부착 (짝이 될 키워드가 "${src.title}" 하나뿐 — 관계가 문장 안에서 완결된 경우)`);
              continue;
            }
          }
          log.push(`[v11✗] 축 "${f.name}·${f.relation}" 무산 — ${f.relation} 관계는 자식 ${need}개가 필요한데 ${ids.length}개(${ids.map((id) => nodes.get(id).title).join(', ')})`);
          continue;
        }
        const fn = addConcept(`${String(f.name).trim()} · ${f.relation}`, coreNode.id, await embedFn(`${f.name} ${f.description || ''}`), String(f.description || '').trim());
        fn.relation = f.relation;
        const took = [];
        for (const id of ids) if (safeReparent(id, fn.id)) {
          usedIds.add(id); took.push(nodes.get(id).title);
          for (const p of nodes.get(id).sources) if (!fn.sources.includes(p)) fn.sources.push(p);
        }
        if (!conceptChildrenOf(fn.id).length) { nodes.delete(fn.id); log.push(`[v11✗] 축 "${f.name}" 무산 — 키워드 이동 실패`); continue; }
        for (const p of fn.sources) if (!coreNode.sources.includes(p)) coreNode.sources.push(p);
        facetNodes.push(fn);
        log.push(`[v11] 축 "${f.name}·${f.relation}" [${f.core}] ← 키워드 ${took.length}개: ${took.join(', ')}`);
      }
      // 제안됐으나 배정에서 아예 언급조차 안 된 축도 조용히 사라지면 안 된다
      for (let fi = 0; fi < flatFacets.length; fi++) {
        if (asn.some((a) => Number(String(a.facet).replace(/^f/, '')) === fi)) continue;
        log.push(`[v11✗] 축 "${flatFacets[fi].name}" 무산 — 배정 단계에서 미언급`);
      }

      // 4) 미편입 2차 배정 — 축의 *추상 이름*과의 코사인으로 넣던 것을 걷어낸다.
      //    "자유" vs "정체성과 민주주의 · 대조" 같은 비교는 주제 근접도일 뿐 "이게 대조 대상인가"를
      //    재지 못한다(실측 0.35~0.41 은 사실상 잡음). 대신 ① 관계 역할을 아는 LLM 이 판단하고,
      //    ② 실패 시에는 축의 *실제 멤버 무게중심*과 비교한다(추상 라벨보다 훨씬 나은 신호).
      let moved = 0;
      const movedDetail = [];
      const leftovers = kwList().filter((k) => !coreNodes.some((cn) => cn.id === k.id) && !usedIds.has(k.id));
      // 쌍으로 의미가 정해지는 축(대조·비교·인과…)은 2차 편입 대상에서 제외한다.
      // 그 축의 자식은 서로를 규정하므로 나중에 하나 더 끼워 넣으면 관계가 깨진다
      // (실측: "진본성과의 대조" 축에 대조 대상이 아닌 '영화'·'정신의 분산'이 2차로 들어감).
      const openFacets = facetNodes.filter((fn) => !PAIRED_RELATIONS.has(fn.relation));
      const closedCount = facetNodes.length - openFacets.length;
      if (closedCount) log.push(`[v11] 2차 배정 제외 축 ${closedCount}개 — ${facetNodes.filter((f) => PAIRED_RELATIONS.has(f.relation)).map((f) => f.title).join(', ')} (쌍으로 뜻이 정해지는 관계라 뒤에 끼워 넣지 않는다)`);
      if (leftovers.length && openFacets.length) {
        onProgress?.('phase 2 — 미편입 키워드 역할 판단');
        const axisLine = openFacets.map((fn, i) => {
          const mem = conceptChildrenOf(fn.id).map((c) => c.title).join(', ');
          return `f${i} | ${fn.title} — 지금 자식: ${mem || '(없음)'}\n     └ 이 축의 자식이어야 할 것: ${memberSpec(fn.relation)}`;
        }).join('\n');
        const leftLine = leftovers.map((k) => {
          const roles = sentOf(k.id).map((s) => String(s.gloss || s.title).slice(0, 70)).slice(0, 2).join(' / ');
          return `${k.id} | ${k.title}${roles ? ` — 문장 역할: ${roles}` : ''}`;
        }).join('\n');
        const leftRaw = await llm({
          system: '아직 자리를 못 찾은 키워드를 관계 축에 넣을지 판단한다. **그 축의 관계가 요구하는 역할에 맞을 때만** 넣어라 — 주제가 비슷하다는 이유로 넣지 마라. 맞는 축이 없으면 facet 을 null 로 두어 핵심 개념 직속에 남긴다. 그게 억지로 넣는 것보다 낫다. JSON만 출력.',
          user: `[관계 축과 현재 자식]\n${axisLine}\n\n[자리를 못 찾은 키워드]\n${leftLine}\n\n출력 JSON: {"place":[{"id":"n?","facet":"f0 또는 null","why":"역할이 맞는 이유 한 줄"}]}`,
          temperature: 0.1,
        });
        let place = []; try { place = (JSON.parse(leftRaw).place || []); } catch { /* 파싱 실패 → 폴백 */ }
        const decided = new Set();
        for (const p of place) {
          const k = leftovers.find((x) => x.id === p.id); if (!k) continue;
          decided.add(k.id);
          const fi = p.facet == null || p.facet === 'null' ? -1 : Number(String(p.facet).replace(/^f/, ''));
          const fn = openFacets[fi];
          const target = fn && nodes.has(fn.id) ? fn : nodes.get(coreNodes[0].id);
          if (safeReparent(k.id, target.id)) {
            moved++;
            movedDetail.push(`${k.title}→${target.title}${fn ? ` (${String(p.why || '역할 판단').slice(0, 40)})` : ' (맞는 축 없음 · 핵심 직속)'}`);
            for (const pg of k.sources) if (!target.sources.includes(pg)) target.sources.push(pg);
          }
        }
        // LLM 이 언급조차 안 한 키워드는 멤버 무게중심 코사인으로 처리(문턱 0.45), 미달이면 핵심 직속
        for (const k of leftovers) {
          if (decided.has(k.id)) continue;
          const e = k.emb || await embedFn(`${k.title} ${(k.gloss || '').slice(0, 100)}`);
          let best = -1, bf = null;
          for (const fn of openFacets) {
            const mem = conceptChildrenOf(fn.id).filter((c) => c.emb);
            if (!mem.length) continue;
            const s = mem.reduce((acc, c) => acc + cos(e, c.emb), 0) / mem.length; // 멤버 평균
            if (s > best) { best = s; bf = fn; }
          }
          const target = best >= 0.45 && bf ? bf : nodes.get(coreNodes[0].id);
          if (safeReparent(k.id, target.id)) {
            moved++;
            movedDetail.push(`${k.title}→${target.title}(멤버 유사도 ${best > 0 ? best.toFixed(2) : '—'})`);
            for (const pg of k.sources) if (!target.sources.includes(pg)) target.sources.push(pg);
          }
        }
      }
      if (movedDetail.length) log.push(`[v11] 2차 배정 ${moved}개: ${movedDetail.join(' · ')}`);

      // 4.5) 남은 키워드로 축 2라운드 — 관계 축은 소수만 정확히 담는 그릇이라, 엄격하게 만들수록
      //      자리를 못 찾는 키워드가 쌓인다(피로사회 14개가 core 직속에 실측). 이들은 관계로
      //      설명되는 게 아니라 묶어 줄 주제 축이 없었을 뿐이다 — 남은 것만 보고 축을 더 제안받는다.
      for (const cn of coreNodes.filter((c) => nodes.has(c.id))) {
        const orphans = conceptChildrenOf(cn.id).filter((k) => !conceptChildrenOf(k.id).length && !k.relation);
        if (orphans.length < 4) continue;
        onProgress?.(`phase 2 — "${cn.title}" 남은 키워드 ${orphans.length}개 축 2라운드`);
        const oLine = orphans.map((k) => {
          const roles = sentOf(k.id).map((s) => String(s.gloss || s.title).slice(0, 60)).slice(0, 2).join(' / ');
          return `${k.id} | ${k.title}${roles ? ` — ${roles}` : ''}`;
        }).join('\n');
        const existing = conceptChildrenOf(cn.id).filter((f) => f.relation).map((f) => f.title).join(' · ') || '(없음)';
        const r2Raw = await llm({
          system: '핵심 개념 아래에서 아직 자리를 못 찾은 키워드들만 보고, 이들을 담을 관계 축을 추가로 제안한다. 이미 있는 축과 겹치지 않아야 하고, 각 축은 그 관계가 요구하는 자식을 실제로 갖춰야 한다. 남은 키워드가 정말 한 덩어리로 안 묶이면 빈 배열을 내라. JSON만 출력.',
          user: `핵심 개념: ${cn.title}\n이미 선 축: ${existing}\n\n[아직 자리를 못 찾은 키워드]\n${oLine}\n\nrelation 후보와 각 관계가 요구하는 자식:\n${RELATION_NAMES.map((r) => `- ${r}: ${memberSpec(r)}`).join('\n')}\n\n축 1~3개. 출력 JSON: {"facets":[{"name":"구체적 축 이름","relation":"후보 중 하나","description":"1~2문장","memberIds":["n?"]}]}`,
          temperature: 0.1,
        });
        let r2 = []; try { r2 = (JSON.parse(r2Raw).facets || []); } catch { /* 파싱 실패 */ }
        const r2Used = new Set();
        // 2라운드도 구조 단계 상한을 지켜야 한다 — 안 그러면 새싹 단계 책에 축이 계속 늘어난다
        const roomLeft = Math.max(0, stage.facets - facetNodes.filter((f) => nodes.has(f.id)).length);
        if (!roomLeft) { log.push(`[v11] 2라운드 생략 — "${stage.name}" 단계의 축 상한 ${stage.facets}개를 이미 채웠다`); continue; }
        for (const f of r2.slice(0, Math.min(3, roomLeft))) {
          if (!f.name || !MODES.includes(f.relation)) continue;
          const ids = (f.memberIds || []).filter((id) => orphans.some((o) => o.id === id) && !r2Used.has(id));
          const need = MEMBER_SPEC[f.relation]?.min || 1;
          if (ids.length < need) { log.push(`[v11✗] 2라운드 축 "${f.name}·${f.relation}" 무산 — 자식 ${need}개 필요, ${ids.length}개`); continue; }
          const fn = addConcept(`${String(f.name).trim()} · ${f.relation}`, cn.id, await embedFn(`${f.name} ${f.description || ''}`), String(f.description || '').trim());
          fn.relation = f.relation;
          const took = [];
          for (const id of ids) if (safeReparent(id, fn.id)) {
            r2Used.add(id); took.push(nodes.get(id).title);
            for (const p of nodes.get(id).sources) if (!fn.sources.includes(p)) fn.sources.push(p);
          }
          if (!conceptChildrenOf(fn.id).length) { nodes.delete(fn.id); continue; }
          facetNodes.push(fn);
          log.push(`[v11] 2라운드 축 "${f.name}·${f.relation}" ← 키워드 ${took.length}개: ${took.join(', ')}`);
        }
        const still = conceptChildrenOf(cn.id).filter((k) => !conceptChildrenOf(k.id).length && !k.relation).length;
        if (still) log.push(`[v11] "${cn.title}" 직속 잔류 ${still}개 — 어느 축에도 묶이지 않았다`);
      }

      // 4.8) 쌍 검증 — 대조·비교·인과 축의 자식이 *실제로 그 관계의 양쪽인지* 확인한다.
      //      개수만 강제하면 짝이 아닌 둘이 짝으로 묶인다("성과사회와 타자성의 상실 · 대조"
      //      ← 타자성, 자본주의 — 자본주의는 타자성의 대조쌍이 아니다). 한 번의 호출로 전부 검사.
      const pairedNodes = facetNodes.filter((fn) => nodes.has(fn.id) && PAIRED_RELATIONS.has(fn.relation) && conceptChildrenOf(fn.id).length >= 2);
      if (pairedNodes.length) {
        onProgress?.('phase 2 — 관계 쌍 검증');
        const pLine = pairedNodes.map((fn, i) => `p${i} | ${fn.title} — 자식: ${conceptChildrenOf(fn.id).map((c) => c.title).join(', ')}`).join('\n');
        const vRaw = await llm({
          system: '관계 축의 자식들이 그 관계의 양쪽으로 실제로 성립하는지 검증한다. 대조·비교면 정말 맞세워지는 두 대상인지, 인과면 한쪽이 원인이고 다른 쪽이 결과인지 본다. 주제가 같은 영역이라는 이유로 통과시키지 마라. 성립하지 않으면 남길 자식(keep)만 고르고 나머지는 빼라. JSON만 출력.',
          user: `[검증할 축과 자식]\n${pLine}\n\n각 축에 대해: ok(양쪽이 성립하면 true) · keep(성립하지 않을 때 남길 자식 이름들 — 보통 관계의 주인공 1개) · why(한 줄)\n출력 JSON: {"checks":[{"id":"p0","ok":true,"keep":[],"why":"..."}]}`,
          temperature: 0,
        });
        let checks = []; try { checks = (JSON.parse(vRaw).checks || []); } catch { /* 파싱 실패 → 검증 생략 */ }
        for (const ck of checks) {
          const pi = Number(String(ck.id).replace(/^p/, ''));
          const fn = pairedNodes[pi];
          if (!fn || !nodes.has(fn.id) || ck.ok !== false) continue;
          const keepSet = new Set((ck.keep || []).map(nrm));
          const kids = conceptChildrenOf(fn.id);
          const evicted = kids.filter((c) => !keepSet.has(nrm(c.title)));
          if (!evicted.length || evicted.length === kids.length) continue; // 전부 빼면 축이 빈다 — 그냥 둔다
          const parent = nodes.get(fn.parentId);
          for (const c of evicted) safeReparent(c.id, parent.id);
          log.push(`[v11] 쌍 검증 실패 "${fn.title}" — ${evicted.map((c) => c.title).join(', ')} 를 뺐다(${String(ck.why || '').slice(0, 60)})`);
          // 한쪽을 빼면 자식이 최소 개수 아래로 떨어진다 — 규칙을 어긴 축을 그대로 두지 않는다.
          // 남은 하나의 문장을 축으로 흡수해 "관계 키워드"로 만든다(축 이름이 곧 관계 서술).
          const rest = conceptChildrenOf(fn.id);
          if (rest.length < (MEMBER_SPEC[fn.relation]?.min || 2) && rest.length === 1) {
            const only = rest[0];
            const sents = sentOf(only.id);
            if (sents.length && !conceptChildrenOf(only.id).length) {
              for (const s of sents) { s.parentId = fn.id; s.level = fn.level + 1; }
              for (const p of only.sources) if (!fn.sources.includes(p)) fn.sources.push(p);
              nodes.delete(only.id);
              fn.relationLeaf = true;
              log.push(`[v11] → "${fn.title}" 은 관계 키워드로 전환 — 짝이 없어져 "${only.title}" 의 문장 ${sents.length}개를 직접 거느린다`);
            }
          }
        }
      }

      // 4.9) 헛도는 축 정리 — 자식이 하나뿐이고 그 이름이 축 이름과 사실상 같으면
      //      ("능력주의의 개념 · 정의" ← 능력주의) 층만 하나 낀 것이다. 축을 없애고
      //      키워드를 핵심 개념 직속으로 올린다.
      for (const fn of [...facetNodes]) {
        if (!nodes.has(fn.id)) continue;
        const ch = conceptChildrenOf(fn.id);
        if (ch.length !== 1) continue;
        const axisName = fn.title.replace(/ · [^·]+$/, '');
        const a = nrm(axisName), b = nrm(ch[0].title);
        if (!(a.includes(b) || b.includes(a))) continue;
        const parent = nodes.get(fn.parentId);
        if (safeReparent(ch[0].id, parent.id)) {
          for (const s of sentOf(fn.id)) { s.parentId = ch[0].id; s.level = ch[0].level + 1; }
          nodes.delete(fn.id);
          facetNodes.splice(facetNodes.indexOf(fn), 1);
          log.push(`[v11] 축 해체: "${fn.title}" — 자식이 "${ch[0].title}" 하나이고 이름이 겹쳐 층만 늘리고 있었다 → "${parent.title}" 직속으로`);
        }
      }

      // 5) core 실속 검증 — 배정 전 검증(확신도·제안 축 수)만으로는 부족하다. 제안은 그럴듯한데
      //    실제로는 축 1개·키워드 2개만 받은 core 가 기둥 행세를 했다(존중정치학 "인정의 정치" 실측).
      //    알맹이를 못 받은 core 는 해체해 그 내용물을 가장 가까운 core 밑으로 옮긴다.
      const MIN_FACETS = 2, MIN_KWS = 3;
      if (coreNodes.length > 1) {
        for (const cn of [...coreNodes]) {
          const fs = conceptChildrenOf(cn.id);
          const kws = fs.reduce((s, f) => s + conceptChildrenOf(f.id).length, 0) + fs.filter((f) => !f.relation).length;
          if (fs.length >= MIN_FACETS && kws >= MIN_KWS) continue;
          const others = coreNodes.filter((o) => o.id !== cn.id && nodes.has(o.id));
          if (!others.length) continue;
          let best = -1, to = null;
          for (const o of others) { const s = cos(cn.emb, o.emb); if (s > best) { best = s; to = o; } }
          for (const child of childrenOf(cn.id)) safeReparent(child.id, to.id);
          for (const p of cn.sources) if (!to.sources.includes(p)) to.sources.push(p);
          nodes.delete(cn.id);
          coreNodes.splice(coreNodes.indexOf(cn), 1);
          log.push(`[v11] core 해체: "${cn.title}" (축 ${fs.length}개·키워드 ${kws}개로 기둥 미달) → "${to.title}" 밑으로 이동`);
        }
      }
      log.push(`[v11] core ${coreNodes.length}개 · 축 ${facetNodes.filter((f) => nodes.has(f.id)).length}개 편성 · 배정 ${usedIds.size} + 2차 ${moved}`);
      const fjCoreNames = cores.map((c) => c.name).join('+');

      // 5) 순서형 축 내부 시대 편성 — v10 의 "책 전체 통시"는 사실 "통시 축 하나가 큰 경우"의
      //    특수형이다. 라우팅(책 유형별 엔진 분기) 대신, 통시·과정·인과 축에 키워드가 몰리면
      //    그 축 안에서만 v10 의 시대 단계 + 페이지 단조성 검증을 재사용한다.
      //    (서양미술사: "각 시대 미술의 특징" 축 안에 1·고대 → … → 5·근대가 선다)
      // ⚠ 시대 편성 허가는 결과 검증만으론 안 된다 — [p] 힌트를 주고 "순서대로 묶어라"
      //   하면 모델은 페이지순 정렬로 항상 단조성을 통과시킨다(run 8·9 실측: 피로사회
      //   분석 축에 "1·신경성 질환→2·사회 구조" 가짜 시대). 독립 신호가 필요하다.
      //   목차 형태 판정은 5회 실행 전부 안정적이었다(서양미술사=통시, 나머지=분석) —
      //   책 자체가 시간 순으로 흐를 때만 축 내부 시대 편성을 허가한다.
      let allowStaging = false;
      if (toc.length && facetNodes.some((f) => conceptChildrenOf(f.id).length >= 4)) {
        const tRaw = await llm({
          system: '비문학 책의 목차 장 제목 구조만 보고 책이 시간 순(시대·연대·인물 계보·발전 과정)으로 전개되는지 판정한다. tocEvidence 에 근거 장 제목을 그대로 옮겨 적어라. JSON만 출력.',
          user: `책: ${book.title}\n\n[목차]\n${toc.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n출력 JSON: {"chronological":true|false,"confidence":"high|med|low","tocEvidence":["장 제목"]}`,
          temperature: 0,
        });
        let tj = {}; try { tj = JSON.parse(tRaw); } catch { /* 판정 실패 */ }
        const ev = (Array.isArray(tj.tocEvidence) ? tj.tocEvidence : []).filter((x) => toc.some((t) => nrm(t).includes(nrm(x)) || nrm(x).includes(nrm(t))));
        allowStaging = tj.chronological === true && tj.confidence !== 'low' && ev.length > 0;
        log.push(`[v11] 목차 시간순 판정: ${tj.chronological} (${tj.confidence}) → 시대 편성 ${allowStaging ? '허가' : '차단'}`);
      }
      for (const fn of (allowStaging ? facetNodes : [])) {
        const members = conceptChildrenOf(fn.id);
        if (members.length < 4) continue;
        onProgress?.(`phase 2.5 — "${fn.title}" 시대 편성(${members.length}개)`);
        const mLine = members.map((n) => `${n.id} | ${n.title} [p${[...new Set(n.sources)].sort((a, b) => a - b).join(',')}]`).join('\n');
        const wantS = Math.min(5, Math.max(2, Math.round(members.length / 3)));
        const stRaw = await llm({
          system: '키워드를 책이 전개되는 순서대로 시기·국면 단계로 묶는다. 키워드 옆 [p숫자]가 책 속 위치다. 억지로 다 묶지 말고 안 맞으면 빼라. JSON만 출력.',
          user: `책: ${book.title}\n축: ${fn.title}\n\n[키워드]\n${mLine}\n\n단계는 정확히 ${wantS}개, 각 단계 키워드 최소 2개, 순서대로 배열(배열 순서=책의 전개 순서). 단계 이름은 시기·국면을 가리키는 짧은 명사구.\n출력 JSON: {"stages":[{"name":"...","memberIds":["n?"]}]}`,
          temperature: 0.1,
        });
        let sts = []; try { sts = (JSON.parse(stRaw).stages || []); } catch { /* 파싱 실패 */ }
        const su = new Set();
        const sv = [];
        for (const st of sts) {
          const ids = (st.memberIds || []).filter((id) => members.some((mn) => mn.id === id) && !su.has(id));
          if (ids.length < 2 || !st.name) continue;
          ids.forEach((id) => su.add(id));
          sv.push({ ...st, ids });
          if (sv.length >= wantS) break;
        }
        // 페이지 단조성 검증 — 가짜 순서면 편성하지 않는다 (v10 과 동일 원칙)
        const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
        const meds = sv.map((st) => median(st.ids.flatMap((id) => nodes.get(id).sources)));
        const inv = meds.filter((v, i) => i > 0 && v < meds[i - 1] - 15).length;
        if (sv.length < 2 || inv > 0) {
          log.push(`[v11] "${fn.title}" 시대 편성 포기(유효 ${sv.length} · 역전 ${inv})`);
          continue;
        }
        sv.forEach((st, i) => {
          // MAX_LEVEL(3)을 한 층 넘는 구조라 safeReparent 대신 reparent — 문장 제외 실깊이 4는 의도된 예외
          const sn = addConcept(`${i + 1} · ${String(st.name).trim()}`, fn.id, null, '');
          sn.stageIndex = i + 1;
          for (const id of st.ids) { reparent(id, sn.id); for (const p of nodes.get(id).sources) if (!sn.sources.includes(p)) sn.sources.push(p); }
        });
        // 검증을 통과했다면 이 축의 실제 성격은 통시다 — 라벨을 결과에 맞춘다
        if (fn.relation !== '통시' && fn.relation !== '과정' && fn.relation !== '인과') {
          fn.title = fn.title.replace(/ · [^·]+$/, ' · 통시');
          fn.relation = '통시';
        }
        log.push(`[v11] "${fn.title}" 시대 ${sv.length}단계 편성(페이지 ${meds.join('→')})`);
      }
      v10Mode = { mode: `관계축:${fjCoreNames}`, confidence: cores[0].confidence, reason: cores.flatMap((c) => c.facets.map((f) => `${f.name}(${f.relation})`)).join(' · ') };
    }
    } // 구조 단계 게이트(stage.cores > 0)
  }

  // ─── Phase 2 (v7/v8): 테마 주역화 — Description 필수 + 책 논지 앵커링 + critic 반증 ──
  if (variant === 'v7' || variant === 'v8') {
    onProgress?.('phase 2 — 테마 생성(v7)');
    // 테마 anchor 의 ground truth = 실제 책 리치데이터(알라딘 책소개·출판사서평·책속에서·추천사) + 요약 + 목차.
    // summary 하나만 쓰면 그 요약이 편향될 때 앵커 검증이 자기충족적이 된다 → 출판사 원문까지 근거로 제공.
    const richBlock = [
      `책: ${book.title} (${book.author} · ${book.category})`,
      book.summary ? `핵심 논지: ${book.summary}` : '',
      book.aladin?.intro ? `책 소개(알라딘): ${book.aladin.intro}` : '',
      book.aladin?.publisherIntro ? `출판사 서평: ${book.aladin.publisherIntro}` : '',
      book.aladin?.excerpts ? `책 속에서: ${book.aladin.excerpts}` : '',
      book.aladin?.recommend ? `추천사: ${book.aladin.recommend}` : '',
      `목차 흐름: ${book.toc.join(' · ')}`,
    ].filter(Boolean).join('\n');
    // 멤버(및 그 하위) 서브트리가 걸친 서로 다른 메모 페이지 수 — 독자-근거 테마의 반복성 지표.
    const subtreeSources = (nid) => {
      const acc = new Set();
      const walk = (id) => { for (const p of nodes.get(id)?.sources || []) acc.add(p); childrenOf(id).forEach((k) => walk(k.id)); };
      walk(nid); return acc;
    };
    const themeMemoCount = (mems) => { const s = new Set(); for (const m of mems) for (const p of subtreeSources(m.id)) s.add(p); return s.size; };
    const rootKids = concepts().filter((n) => n.parentId === root.id);
    if (rootKids.length >= 3) {
      const desc = (n) => {
        const kids = conceptChildrenOf(n.id); // 문장 노드는 위계가 아니므로 프롬프트에 넣지 않는다
        const pages = [...subtreeSources(n.id)].sort((a, b) => a - b);
        return `${n.id}: ${n.title} — ${n.gloss || ''}${kids.length ? ` (하위: ${kids.map((k) => k.title).join(', ')})` : ''}${pages.length ? ` [메모 p${pages.join(',p')}]` : ''}`;
      };
      const genPrompt = `[책 맥락 — 테마의 1차 근거]
${richBlock}

아래는 한 독자가 이 책에서 수집한 개념들이다(각 개념 뒤 [메모 pN]은 그 개념이 나온 실제 메모 페이지).
**이 책을 읽은 독자의 머릿속에 자연스럽게 생기는 이해의 큰 축**만 테마로 만들어라.

테마의 근거는 두 종류가 있다(하이브리드):
- anchorType="book": 위 [책 맥락]에 근거가 있을 때 — 그 구절을 anchor에 **그대로 인용**.
- anchorType="reader": 책 소개문엔 없지만 **독자가 여러 메모에서 반복적으로 파고든 축**일 때 — anchor에 그 축을 한 문장으로 쓰고, 근거가 되는 멤버 메모들이 최소 3개의 서로 다른 페이지에 걸쳐야 한다.

규칙:
- 책과 무관한 일반 분류("기타", "다양한 관점", "삶의 지혜" 류) 절대 금지 — book이든 reader든 이 책의 실제 내용/독자의 실제 메모에 뿌리내려야 한다.
- 테마마다 description 필수: 이 책이 이 테마로 무엇을 말하는지 + 왜 이 멤버들이 여기 묶이는지, 2~3문장.
- ⚠ memberIds 2개 미만 테마는 출력 금지. 어울리는 테마가 없는 개념은 그냥 남겨라(억지 편입 금지). 다 묶일 필요 없다.
- 테마명은 멤버 이름 복사·목차 제목 복붙 금지. 멤버들을 실제로 아우르는 이름.

[개념들]
${rootKids.map(desc).join('\n')}

출력 JSON: {"themes":[{"name":"테마명","anchorType":"book|reader","anchor":"book이면 책 맥락 인용 / reader면 독자가 반복한 축 한 문장","description":"2~3문장","memberIds":["n?","n?"]}]}`;
      const raw = await llm({ system: SYS, user: genPrompt, temperature: 0.1 });
      let out; try { out = JSON.parse(raw); } catch { out = { themes: [] }; }

      // 테마별 독립 critic — 반증 시도. author≠reviewer.
      for (const t of out.themes || []) {
        const members = (t.memberIds || []).map((mid) => nodes.get(mid)).filter((x) => x && x.kind === 'concept' && x.parentId === root.id);
        if (members.length < 2 || !t.name?.trim() || !t.description?.trim()) {
          log.push(`[theme✗] "${t.name || '?'}" 스킵(멤버<2 또는 name/description 누락)`); continue;
        }
        // 하이브리드 검증에 쓸 코드 계산값 — LLM 자기선언(anchorType)을 그대로 믿지 않는다.
        const memoSpan = themeMemoCount(members); // 멤버들이 걸친 서로 다른 메모 페이지 수
        const READER_MIN = 3;
        const criticPrompt = `아래 "테마"가 이 독자의 위키에 남길 만한 우산 개념인지 검증하라. 판정은 반드시 **인용 근거**로 한다 — 분위기로 판단하지 마라.
테마의 정당성 근거는 두 갈래 중 **하나만** 충족해도 유효하다(하이브리드):

[책 맥락]
${richBlock}

[제안된 테마] ${t.name}  (제안된 근거 유형: ${t.anchorType || '미지정'})
[테마의 근거 주장(anchor)] ${t.anchor || '(없음)'}
[테마 설명] ${t.description}
[멤버들]
${members.map((m) => { const ps = [...subtreeSources(m.id)].sort((a, b) => a - b); return `${m.id}: ${m.title} — ${m.gloss || ''}${ps.length ? ` [메모 p${ps.join(',p')}]` : ''}`; }).join('\n')}
[코드 계산] 이 테마 멤버들이 걸친 서로 다른 메모 페이지 수 = ${memoSpan}개

판정 절차 (아래 A 또는 B 중 하나라도 성립하면 valid=true):
A) 책-근거: anchor가 위 [책 맥락]의 실제 구절과 대응한다. → 유효.
B) 독자-근거: 책 맥락엔 없더라도, 멤버들이 **서로 다른 메모 ${READER_MIN}개 이상**(코드 계산값 ${memoSpan}≥${READER_MIN})에 걸쳐 있고, 테마명이 그 멤버들을 실제로 아우른다. → 유효. (독자가 반복해서 파고든 진짜 축)
기각(valid=false)은 A·B 둘 다 실패할 때만: 책 맥락에도 없고(A✗) 멤버 메모 span도 ${READER_MIN} 미만이거나 테마명이 멤버 절반 이상과 무관(B✗). 또는 description이 책 맥락과 정면으로 어긋날 때.
일부 멤버만 억지 편입이면 valid=true + 그 id를 dropMemberIds에.
출력 JSON: {"valid":true|false,"basis":"book|reader|none","dropMemberIds":["n?"],"reason":"판정 근거 한 줄"}`;
        const craw = await llm({ system: '독서 위키 품질 검증자. 책-근거 또는 독자-근거(메모 반복) 중 하나면 유효. 인용·수치 근거로만 판정. JSON만 출력.', user: criticPrompt, temperature: 0, model: 'gpt-4o' });
        let verdict; try { verdict = JSON.parse(craw); } catch { verdict = { valid: false, reason: 'parse-fail' }; }
        if (!verdict.valid) { log.push(`[theme✗] "${t.name}" 기각 — ${verdict.reason}`); continue; }
        const keep = members.filter((m) => !(verdict.dropMemberIds || []).includes(m.id));
        if (keep.length < 2) { log.push(`[theme✗] "${t.name}" 기각(억지 멤버 제외 후 <2)`); continue; }
        const th = addConcept(t.name.trim(), root.id, null, t.description.trim());
        th.anchor = (t.anchor || '').trim();
        th.anchorBasis = verdict.basis || t.anchorType || 'book'; // book | reader
        let moved = 0;
        for (const m of keep) if (safeReparent(m.id, th.id)) moved++;
        log.push(`[theme] "${t.name}"(${th.id}) [${th.anchorBasis}·메모${memoSpan}] ← ${keep.map((m) => m.title).join(', ')}${(verdict.dropMemberIds || []).length ? ` (억지 제외: ${verdict.dropMemberIds.join(',')})` : ''}`);
        log.push(`[theme.desc]   ↳ anchor: ${th.anchor || '(없음)'} | ${t.description.trim()}`);
        if (!moved) { nodes.delete(th.id); log.push(`[theme✗] "${t.name}" 롤백(깊이 초과로 이동 0)`); }
      }
    }
  }

  // ─── Phase 2 (v5/v6): 존중형 군집화 ──────────────────────────
  if (variant !== 'v7' && variant !== 'v8') {
    onProgress?.('phase 2 — 군집화');
    const orphans = concepts().filter((n) => n.parentId === root.id && conceptChildrenOf(n.id).length === 0);
    const existingThemes = concepts().filter((n) => n.parentId === root.id && conceptChildrenOf(n.id).length > 0);
    if (orphans.length) {
      const prompt = `[숨은 척추 — 참고만, 제목을 노드로 복붙 금지] 책 "${book.title}" 목차 흐름: ${book.toc.join(' · ')}

place 단계가 이미 만든 위계는 건드리지 않는다. 아래 [고아 개념]들만 상위 테마로 묶어라.
⚠ 무리한 편입 절대 금지 — 대부분의 고아는 최상위에 그대로 남는 게 정상이다. 억지로 다 묶지 마라.
- 편입은 그 고아가 기존 테마의 **명백한 하위 구성원**일 때만(themeId). 단지 관련·인접이면 편입하지 마라.
- 여러 고아(≥2)가 **하나의 자명한 상위 개념**으로 자연히 묶일 때만 새 테마 생성(newTheme). 테마명은 자식 이름과 달라야 하고 목차 복붙 금지.
- 확신이 조금이라도 없으면 둘 다 비워 최상위에 남겨라.

[기존 상위 테마]
${existingThemes.length ? existingThemes.map((n) => `${n.id} | ${n.title} — 자식: ${conceptChildrenOf(n.id).map((k) => k.title).join(', ')}`).join('\n') : '(없음)'}

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
    ...(variant === 'v8' || variant === 'v10' || variant === 'v11' ? { pages: v8PageCount } : {}),
  };
  return { nodes, rootId: root.id, stats, log, mode: v10Mode };
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
