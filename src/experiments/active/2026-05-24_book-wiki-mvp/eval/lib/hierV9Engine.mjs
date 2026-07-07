// v9 동화 우선 위계 인제스트 엔진 (BKT-378)
// 설계 SSOT: eval/docs/hier-v9-assimilation-design.md
// 원칙: ① 온라인 패스는 add-only(동화 우선) ② 구조 변경은 통합 패스에서만
//       ③ 목차 = 확정 스켈레톤(부착은 페이지 단조 정렬 DP) ④ 기권(미분류)은 1급 기능
//       ⑤ 노드 제목 = lift된 표제어(자구 우선 명사구), 트리 작문 LLM 콜 = 0

// ─── 유틸 ─────────────────────────────────────────────────────
function cos(a, b) {
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return s / (Math.sqrt(na) * Math.sqrt(nb));
}
function parseJson(text) {
  try { return JSON.parse(text); } catch {
    const m = text.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]);
    throw new Error('LLM JSON 파싱 실패: ' + text.slice(0, 120));
  }
}
const ROLE_RANK = { '정의': 0, '독자 정리': 1, '주장': 2, '예시': 3, '장면': 3, '독자 생각': 4 };

// ─── 엔진 ─────────────────────────────────────────────────────
export function createEngine({ llm, embed, book, log = () => {}, params = {} }) {
  const P = {
    onlineAttachMin: 0.55,   // 온라인 장 추정: 최고점이 이보다 낮으면 미분류(보수적 — 통합 패스가 배치)
    onlineAttachMargin: 0.12,// 1·2위 점수차가 이보다 작으면 미분류(애매)
    abstainScore: 0.30,      // DP에서 기권 트랙의 고정 점수 (내용+prior 합산 대비)
    posPriorW: 0.35,         // 페이지 위치 prior 가중치
    flatMax: 0.55,           // 내용 점수 변별력 판정: 최고점이 이보다 낮고
    flatMargin: 0.15,        //   1·2위 차가 이보다 작으면 '평평' → 내용 점수 축소, prior 지배
    flatScale: 0.2,          // 평평한 내용 점수의 축소 배율
    assimCos: 0.60,          // 동화 후보 임베딩 하한
    overlayCos: 0.72,        // 오버레이 후보 하한
    overlayMax: 5,           // 오버레이 상한 (점수순)
    titleBoost: 0.3,         // 장 제목 자구 앵커 가산
    ...params,
  };

  // 상태
  const nodes = [];          // { id, chapterIdx, title, claim, role, memos:[{p,quote,lift}] }
  const shelf = [];          // 미분류 memo
  const linkQ = [];          // { aId, bId, score, status }
  const digest = [];         // 통합 패스 변경 로그
  let seq = 0;

  // 캐시 — 내용 키 기반이라 도착 순서와 무관 (설계의 '영구 캐시')
  const cache = { lift: new Map(), aff: new Map(), emb: new Map(), judge: new Map() };
  const stats = { llmCalls: 0, embCalls: 0 };

  async function llmJson({ system, user }) {
    stats.llmCalls++;
    return parseJson(await llm({ system, user }));
  }
  async function embCached(text) {
    if (!cache.emb.has(text)) { stats.embCalls++; cache.emb.set(text, await embed(text)); }
    return cache.emb.get(text);
  }

  // ─── 1. lift: 메모 1건 → {표제어, 논지, role, 예시 대상} ────────
  const LIFT_SYSTEM = `너는 독서 메모를 위키 개념으로 변환하는 사서다. 발췌 문장 1건을 아래 JSON으로 변환한다.
{"headword": "...", "claim": "...", "role": "...", "exampleOf": "..."}

규칙:
- headword(표제어): 2~10자 명사구. 반드시 문장의 자구에서 뽑되, 문장이 구체적 사물·일화로 일반 명제를 서술하는 경우(예시 구조)에는 문장이 가리키는 일반 개념으로 승격한다. "A와 B" 같은 합성 금지.
- claim(논지): 이 문장이 주장하는 바 한 문장. 발췌에 없는 내용 추가 금지.
- role: "정의"(개념을 정의) | "주장"(명제를 주장) | "예시"(구체 사물·일화로 개념을 운반; 소설의 장면 포함) | "독자 정리"(독자가 쓴 요약·도식) | "독자 생각"(독자의 의견).
- exampleOf: role=예시일 때 그 구체물 이름(예: "일본 자동차"). 아니면 "".

예시 판정 신호: 주어가 고유명사·구체물이고 그것으로 일반 명제를 서술("일본 자동차가 얌전하게 보이는 것은 욕망을 스캔했기 때문" → headword="욕망의 반영", role="예시", exampleOf="일본 자동차").`;

  async function lift(memo) {
    const key = `${memo.p}|${memo.text.slice(0, 40)}`;
    if (cache.lift.has(key)) return cache.lift.get(key);
    const out = await llmJson({
      system: LIFT_SYSTEM,
      user: `책: ${book.title} (${book.author})\n책 소개: ${book.summary}\n\n발췌 (p${memo.p}):\n${memo.text}${memo.my ? `\n\n독자 메모: ${memo.my}` : ''}`,
    });
    const v = {
      headword: String(out.headword || '').trim() || `p${memo.p} 발췌`,
      claim: String(out.claim || '').trim(),
      role: ROLE_RANK[out.role] != null ? out.role : '주장',
      exampleOf: String(out.exampleOf || '').trim(),
    };
    cache.lift.set(key, v);
    return v;
  }

  // ─── 2. 장 친화도: 메모 1건 × 목차 전체 → 점수 배열 ────────────
  async function affinity(memo, lifted) {
    const key = `${memo.p}|${lifted.headword}`;
    if (cache.aff.has(key)) return cache.aff.get(key);
    const out = await llmJson({
      system: `발췌가 책의 어느 장에서 나왔을지 확률 분포로 추정한다(합계 = 1). 장 제목이 포괄적이라도 발췌의 구체 소재(예: 정보, 미디어, 일본, 시각·그래픽, 욕망)가 특정 장의 고유 주제와 호응하면 그 장에 확률을 몰아라. 모든 장에 고르게 주는 것은 최악의 답이다. JSON: {"probs": [숫자, ...]} — 목차 순서대로 ${book.toc.length}개, 합계 1.`,
      user: `책: ${book.title}\n목차: ${book.toc.map((t, i) => `${i + 1}. ${t}`).join(' / ')}\n\n발췌 (p${memo.p}) — 표제어 "${lifted.headword}": ${lifted.claim}\n원문: ${memo.text.slice(0, 200)}`,
    });
    let raw = Array.isArray(out.probs) ? out.probs.map((x) => Math.max(0, Number(x) || 0)) : [];
    while (raw.length < book.toc.length) raw.push(0);
    raw = raw.slice(0, book.toc.length);
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    // 확률 → 점수 스케일 (top이 대략 0.5~1.0 대역에 오도록)
    let scores = raw.map((x) => Math.min(1, (x / sum) * 2.2));
    // 자구 앵커: 장 제목의 유의미 토큰(조사 제거)이 원문에 등장하면 가산 (결정적)
    book.toc.forEach((t, i) => {
      const tokens = t.split(/[\s—-]+/).map((w) => w.replace(/(의|이라는|라는)$/, '')).filter((w) => w.length >= 2 && !['그', '것'].includes(w));
      const hit = tokens.filter((w) => memo.text.includes(w)).length;
      if (hit >= 2 || tokens.some((w) => w.length >= 5 && memo.text.includes(w))) scores[i] = Math.min(1, scores[i] + P.titleBoost);
    });
    cache.aff.set(key, scores);
    return scores;
  }

  // ─── 3. 부착 DP: 페이지 정렬 메모열 ↔ 목차열 단조 정렬 ──────────
  // 반환: 각 메모의 chapterIdx (기권 = null). 점수가 같으면 결정적 tie-break.
  function attachDP(items) { // items: [{p, scores}] — 페이지 오름차순 정렬됨
    const n = items.length, k = book.toc.length;
    if (!n) return [];
    // 페이지 위치 prior: 책 진행도(페이지 분율)와 장 순서 분율의 정렬 보너스.
    // 내용 점수가 포화(여러 장 동점)일 때 위치가 결정적 tie-break이 된다 — 사람이 쪽수로 어림하는 것과 동일.
    const pMin = items[0].p, pMax = items[n - 1].p;
    const posPrior = (p, j) => {
      const pf = pMax > pMin ? (p - pMin) / (pMax - pMin) : 0.5;
      const cf = (j + 0.5) / k;
      return P.posPriorW * (1 - Math.abs(pf - cf));
    };
    // dp[i][j] = i번째까지 처리, 지금까지 배정된 최대 장 = j(0=없음)일 때 최고점
    const NEG = -1e9;
    const dp = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(NEG));
    const bk = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(null));
    dp[0][0] = 0;
    for (let i = 1; i <= n; i++) {
      // 내용 점수가 평평하면(변별력 없음) 축소 — 위치 prior가 지배 ("모르겠으면 쪽수로 어림")
      const raw = items[i - 1].scores;
      const srt = [...raw].sort((a, b) => b - a);
      const flat = srt[0] < P.flatMax && (srt[0] - (srt[1] ?? 0)) < P.flatMargin;
      const sc = raw.map((s, j) => (flat ? s * P.flatScale : s) + posPrior(items[i - 1].p, j));
      // prefix max of dp[i-1]
      const pref = new Array(k + 1); const prefArg = new Array(k + 1);
      let best = NEG, arg = 0;
      for (let j = 0; j <= k; j++) { if (dp[i - 1][j] > best) { best = dp[i - 1][j]; arg = j; } pref[j] = best; prefArg[j] = arg; }
      for (let j = 0; j <= k; j++) {
        // (a) 기권: 장 상태 유지
        if (dp[i - 1][j] + P.abstainScore > dp[i][j]) { dp[i][j] = dp[i - 1][j] + P.abstainScore; bk[i][j] = { assign: null, from: j }; }
        // (b) j장에 배정 (j>=1): 이전 최대 장 <= j
        if (j >= 1 && pref[j] + sc[j - 1] > dp[i][j]) { dp[i][j] = pref[j] + sc[j - 1]; bk[i][j] = { assign: j - 1, from: prefArg[j] }; }
      }
    }
    let j = 0; for (let x = 1; x <= k; x++) if (dp[n][x] > dp[n][j]) j = x;
    const out = new Array(n);
    for (let i = n; i >= 1; i--) { const b = bk[i][j]; out[i - 1] = b.assign; j = b.from; }
    return out;
  }

  // ─── 4. 동화 판정 ────────────────────────────────────────────
  async function judgeSame(a, b) { // a,b: {headword, claim, quote}
    const key = ['same', a.headword, b.headword, a.claim.slice(0, 30), b.claim.slice(0, 30)].sort().join('|');
    if (cache.judge.has(key)) return cache.judge.get(key);
    const out = await llmJson({
      system: `두 위키 항목이 같은 개념(동의어·같은 표제어로 병합해야 할 것)인지 판정한다. 같은 논지를 다른 말로 재진술하면 같은 개념이다. 같은 주제(테마)를 다루지만 논지가 다르면 false. 불확실하면 false(보수적). JSON: {"same": true|false, "reason": "..."}`,
      user: `A: "${a.headword}" — ${a.claim}\n근거: ${a.quote.slice(0, 150)}\n\nB: "${b.headword}" — ${b.claim}\n근거: ${b.quote.slice(0, 150)}`,
    });
    const v = !!out.same;
    cache.judge.set(key, v);
    return v;
  }

  function conceptEmbText(x) { return `${x.headword}: ${x.claim}`; }

  function pickTitle(memos) { // 병합·명명 규칙 (결정적): role 우선 → 이른 페이지
    const best = [...memos].sort((a, b) =>
      (ROLE_RANK[a.lift.role] - ROLE_RANK[b.lift.role]) || (a.p - b.p))[0];
    return { title: best.lift.headword, claim: best.lift.claim, role: best.lift.role };
  }

  // ─── 온라인 패스: 메모 1건 인제스트 (add-only) ──────────────────
  async function ingest(memo) {
    const lifted = await lift(memo);
    const scores = await affinity(memo, lifted);
    // 온라인 장 추정: 단독 argmax + 확신 게이트 (전역 단조 검증은 통합 패스가)
    const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
    const [top, second] = [order[0], order[1] || [0, -1]];
    const entry = { p: memo.p, quote: memo.text, my: memo.my || '', lift: lifted, scores };

    if (top[0] < P.onlineAttachMin || top[0] - second[0] < P.onlineAttachMargin) {
      shelf.push(entry);
      log(`[온라인] p${memo.p} "${lifted.headword}" → 미분류 (top ${top[0].toFixed(2)} margin ${(top[0] - second[0]).toFixed(2)})`);
      return { action: 'shelf' };
    }
    const chapterIdx = top[1];
    // 동화 시도: 같은 장의 기존 개념과 매칭
    const cands = nodes.filter((nd) => nd.chapterIdx === chapterIdx);
    if (cands.length) {
      const ev = await embCached(conceptEmbText(lifted));
      let best = null, bs = -1;
      for (const nd of cands) {
        const s = cos(ev, await embCached(conceptEmbText({ headword: nd.title, claim: nd.claim })));
        if (s > bs) { bs = s; best = nd; }
      }
      if (best && bs >= P.assimCos) {
        const same = await judgeSame(
          { headword: lifted.headword, claim: lifted.claim, quote: memo.text },
          { headword: best.title, claim: best.claim, quote: best.memos[0].quote });
        if (same) {
          best.memos.push(entry); // add-only: 제목·위치 불변
          log(`[온라인] p${memo.p} "${lifted.headword}" +동화→ "${best.title}" (cos ${bs.toFixed(2)})`);
          return { action: 'assimilate', node: best.id };
        }
      }
    }
    const node = { id: `n${++seq}`, chapterIdx, title: lifted.headword, claim: lifted.claim, role: lifted.role, memos: [entry] };
    nodes.push(node);
    log(`[온라인] p${memo.p} "${lifted.headword}" → 신규 노드 (${book.toc[chapterIdx]})`);
    return { action: 'new', node: node.id };
  }

  // ─── 통합 패스: 유일하게 구조를 바꿀 수 있는 시점 ─────────────────
  async function consolidate() {
    digest.length = 0;
    // 1) 부착 전역 재정렬 (DP) — 미분류 포함 전 메모
    const all = [];
    for (const nd of nodes) for (const m of nd.memos) all.push({ ...m, _node: nd });
    for (const m of shelf) all.push({ ...m, _node: null });
    all.sort((a, b) => a.p - b.p || a.quote.localeCompare(b.quote));
    const assign = attachDP(all);
    const moves = [];
    all.forEach((m, i) => {
      const cur = m._node ? m._node.chapterIdx : null;
      if (assign[i] !== cur) moves.push({ m, to: assign[i] });
    });
    for (const { m, to } of moves) {
      if (m._node) {
        m._node.memos = m._node.memos.filter((x) => !(x.p === m.p && x.quote === m.quote));
      } else shelf.splice(shelf.findIndex((x) => x.p === m.p && x.quote === m.quote), 1);
      const entry = { p: m.p, quote: m.quote, my: m.my, lift: m.lift, scores: m.scores };
      if (to == null) {
        shelf.push(entry);
        digest.push(`p${m.p} "${m.lift.headword}" → 미분류로 이동(전역 정렬 근거 부족)`);
      } else {
        const node = { id: `n${++seq}`, chapterIdx: to, title: m.lift.headword, claim: m.lift.claim, role: m.lift.role, memos: [entry] };
        nodes.push(node);
        digest.push(`p${m.p} "${m.lift.headword}" → ${book.toc[to]}로 이동(단조 정렬)`);
      }
    }
    for (let i = nodes.length - 1; i >= 0; i--) if (!nodes[i].memos.length) nodes.splice(i, 1);

    // 2) 장내 동의어 병합 — 임베딩 후보 → 보수적 판정 → 결정적 제목 규칙
    for (let ci = 0; ci < book.toc.length; ci++) {
      const group = nodes.filter((nd) => nd.chapterIdx === ci).sort((a, b) => a.memos[0].p - b.memos[0].p);
      for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
        const A = group[i], B = group[j];
        if (!A.memos.length || !B.memos.length) continue;
        // 동일 표제어 = 자동 병합 (결정적). 그 외엔 임베딩 후보 → 보수적 판정.
        if (A.title !== B.title) {
          const s = cos(await embCached(conceptEmbText({ headword: A.title, claim: A.claim })),
                        await embCached(conceptEmbText({ headword: B.title, claim: B.claim })));
          if (s < P.assimCos) continue;
          const same = await judgeSame(
            { headword: A.title, claim: A.claim, quote: A.memos[0].quote },
            { headword: B.title, claim: B.claim, quote: B.memos[0].quote });
          if (!same) continue;
        }
        A.memos.push(...B.memos); B.memos = [];
        const t = pickTitle(A.memos);
        if (t.title !== A.title) digest.push(`병합 후 제목: "${A.title}"+"${B.title}" → "${t.title}" (role=${t.role} 우선)`);
        else digest.push(`병합: "${B.title}" → "${A.title}"`);
        A.title = t.title; A.claim = t.claim; A.role = t.role;
      }
    }
    for (let i = nodes.length - 1; i >= 0; i--) if (!nodes[i].memos.length) nodes.splice(i, 1);

    // 3) 테마 승격 — v9.0 미구현(근거 게이트 통과 사례가 실험상 희소). 로그만.
    // 4) 오버레이 — 장 경계를 넘는 같은/유사 표제어 → 확정
    linkQ.length = 0;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const A = nodes[i], B = nodes[j];
      if (A.chapterIdx === B.chapterIdx) continue;
      const s = cos(await embCached(conceptEmbText({ headword: A.title, claim: A.claim })),
                    await embCached(conceptEmbText({ headword: B.title, claim: B.claim })));
      if (s >= P.overlayCos) linkQ.push({ a: A.title, b: B.title, aId: A.id, bId: B.id, score: s, status: 'confirmed' });
    }
    linkQ.sort((a, b) => b.score - a.score);
    linkQ.splice(P.overlayMax);
    if (linkQ.length) digest.push(`오버레이 ${linkQ.length}건: ${linkQ.map((l) => `${l.a}↔${l.b}`).join(', ')}`);
    return digest.slice();
  }

  // ─── 지표·직렬화 ─────────────────────────────────────────────
  function relations() { // 페이지쌍 관계 라벨 (v8 지표와 호환): merged / sibling / none
    const where = new Map(); // p → {node, chapter}
    for (const nd of nodes) for (const m of nd.memos) where.set(m.p, { node: nd.id, ch: nd.chapterIdx });
    const pages = [...new Set([...where.keys(), ...shelf.map((m) => m.p)])].sort((a, b) => a - b);
    const rel = {};
    for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) {
      const a = where.get(pages[i]), b = where.get(pages[j]);
      const k = `${pages[i]}-${pages[j]}`;
      rel[k] = !a || !b ? 'none' : a.node === b.node ? 'merged' : a.ch === b.ch ? 'sibling' : 'none';
    }
    return rel;
  }

  function snapshot() {
    return {
      nodes: nodes.map((nd) => ({ id: nd.id, chapter: book.toc[nd.chapterIdx], chapterIdx: nd.chapterIdx, title: nd.title, claim: nd.claim, role: nd.role, memos: nd.memos.map((m) => ({ p: m.p, headword: m.lift.headword, role: m.lift.role, exampleOf: m.lift.exampleOf })) })),
      shelf: shelf.map((m) => ({ p: m.p, headword: m.lift.headword })),
      overlay: linkQ.map((l) => ({ a: l.a, b: l.b, score: +l.score.toFixed(3) })),
      stats: { ...stats },
    };
  }

  function renderTree() {
    const lines = [`■ ${book.title}`];
    for (let ci = 0; ci < book.toc.length; ci++) {
      const group = nodes.filter((nd) => nd.chapterIdx === ci).sort((a, b) => Math.min(...a.memos.map((m) => m.p)) - Math.min(...b.memos.map((m) => m.p)));
      if (!group.length) continue; // fog-of-war: 미물질화 장은 출력 안 함
      lines.push(`├─ ${book.toc[ci]}`);
      for (const nd of group) {
        const ex = nd.memos.filter((m) => m.lift.exampleOf).map((m) => m.lift.exampleOf);
        lines.push(`│   • ${nd.title} · ${nd.memos.map((m) => 'p' + m.p).join(',')}${ex.length ? ` (예시: ${[...new Set(ex)].join(', ')})` : ''}`);
      }
    }
    if (shelf.length) lines.push(`└─ ⚠ 미분류 · ${shelf.map((m) => `p${m.p}(${m.lift.headword})`).join(', ')}`);
    if (linkQ.length) lines.push(`오버레이: ${linkQ.map((l) => `${l.a}↔${l.b}`).join(' / ')}`);
    return lines.join('\n');
  }

  return { ingest, consolidate, relations, snapshot, renderTree, cache, stats,
    get nodes() { return nodes; }, get shelf() { return shelf; }, get overlay() { return linkQ; }, get digest() { return digest; } };
}
