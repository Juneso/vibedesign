// 문학(소설) 전용 인제스트 엔진 — literature-v1 (BKT-380)
//
// 비문학 엔진(hierEngine v8~v11)은 "개념 포함관계"가 뼈대지만 소설 메모는
// 논지가 아니라 울림 있는 문장(인용·밑줄)이다. 여기서는:
//  - 1차 축 = 모티프(책을 관통하며 반복되는 심상·주제). 그 아래 문장은 페이지순
//    정렬 — 소설에선 페이지 순서가 곧 서사 진행이라 변화 아크가 공짜로 드러난다.
//  - 인물·정서는 위계가 아니라 문장 노드의 속성(speaker/emotion/arc).
//    단, 한 인물에 문장이 몰리면(조르바처럼 인물이 곧 책인 경우) 모티프와
//    나란히 상위로 승격한다.
//  - 환각 방지: 줄거리 추론 금지 — 분석 근거는 메모 문면 + 알라딘 리치데이터뿐.
//  - 억지 편입 금지 원칙 유지: 모티프에 안 맞는 메모는 root 직속에 남긴다.
//
// 사용: runLitIngest({ book, memos, llm, embedFn, planLitFn, onProgress })
//       → { nodes, rootId, stats, log, mode }  (hierEngine serializeTree 호환)

const cos = (a, b) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return s / (Math.sqrt(na) * Math.sqrt(nb)); };
const nrm = (s) => String(s || '').normalize('NFC').replace(/\s+/g, '').toLowerCase();

// ─── 지연 재임베딩 ───────────────────────────────────────────
// serializeTree 는 용량 때문에 emb 를 빼고 저장한다. 그래서 **저장된 트리를 불러오면
// 모든 노드에 emb 가 없다.** 없는 채로 유사도를 재면 전부 -1 이 되어 후보 하한(0.2)에
// 걸리고, 후보 목록이 비면 모델은 NEW 밖에 못 고른다 — 넣는 문장마다 새 축이 생겨
// 위계가 평평해진다. eval 은 부트→증분이 한 프로세스라 안 드러나지만, 앱은 문장 추가가
// 세션을 넘나들어 반드시 드러난다 (BKT-383).
//
// ⚠️ **임베딩 문자열은 한 곳에서만 만든다.** consolidateSeeds 와 assimilateLitMemo 가
//    서로 다른 문자열을 쓰면 같은 노드가 실행 시점마다 다른 벡터를 갖게 되고,
//    유사도가 조용히 틀어진다 — 에러 없이 판정만 나빠지므로 알아채기 어렵다.
const motifEmbText = (m) => `${m.title}: ${m.gloss || ''}`;

async function ensureMotifEmbs(motifs, embedFn) {
  if (!embedFn) return;
  for (const m of motifs) if (!m.emb) m.emb = await embedFn(motifEmbText(m));
}

// ─── Phase 1: 문학 분석 (gpt-4o, 러너에서 cachedPlanIngest 로 감싼다) ──────
// 비문학 planIngest 의 thesis(핵심 주장) 대신 speaker·emotion·resonance·motifs 를 뽑는다.
export async function planIngestLit({ memos, book, llm, canon }) {
  const rich = [book.summary, book.aladin?.intro, book.aladin?.publisherIntro, book.aladin?.excerpts]
    .filter(Boolean).join('\n').slice(0, 3000);
  const memoLine = memos.map((m) => `- id:${m.id} p${m.p}: ${m.text}${m.myThought ? `\n  (내 생각: ${m.myThought})` : ''}`).join('\n');
  // 정본 모티프 앵커(사이클 3, golden/lit-canon-motifs.json) — 이름 일반화·과병합 완충.
  // ⚠ 억지 편입 금지 게이트: 메모에 실제 근거가 있을 때만 채택하게 프롬프트로 강제한다.
  //   정본을 그대로 베끼면 모든 유저의 위키가 똑같아진다 — 앵커는 어휘·경계 참고용이다.
  const canonBlock = canon ? `
[참고 — 이 책에 대한 일반적 해석의 축 (앵커)]
${(canon.themes || []).map((t) => `- ${t.name}: ${t.desc || ''}`).join('\n')}
${(canon.symbols || []).length ? `반복 심상: ${canon.symbols.join(' · ')}` : ''}
⚠ 위 축은 참고일 뿐이다. **메모에 실제 근거가 있는 축만** 후보로 삼고, 메모가 다루지 않는 축은 무시하라. 메모가 위 축과 다른 고유한 축을 이루면 그쪽을 우선하라. 이름은 위 축의 어휘를 참고하되 메모의 표현이 더 구체적이면 메모 쪽을 쓴다.` : '';
  const raw = await llm({
    system: '너는 소설 독서 메모를 분석하는 문학 편집자다. 책의 줄거리를 아는 척 추론하지 마라 — 판단 근거는 오직 메모 문면과 제공된 책 소개뿐이다. JSON만 출력.',
    user: `책: ${book.title}${book.author ? ` (${book.author})` : ''}

[책 소개·리치데이터 — 유일하게 허용된 책 배경 근거]
${rich || '(없음)'}

[독자가 밑줄 그은 메모]
${memoLine}
${canonBlock}

두 가지를 산출하라.

1) motifCandidates — 이 메모들을 관통하며 **반복되는** 심상·주제 3~6개.
   - name: 짧은 명사구. **메모에 실제로 등장하는 책 고유의 심상·표현을 이름에 우선 사용하라**
     (예: "내면의 갈등"(백과사전식) 대신 "두 세계", "변화와 성장" 대신 "알을 깨고 나오는 새").
     어느 책에나 붙일 수 있는 일반명사 이름은 실패다. 목차·줄거리 복붙도 금지.
   - description: 1~2문장. 이 모티프가 메모들 속에서 어떻게 나타나는지.
   - ${memos.length >= 6 ? '메모 1개에만 걸리는 모티프는 만들지 마라.' : '메모가 아직 적으니 1개짜리 모티프도 허용된다 — 앞으로 쌓일 메모의 씨앗이 될 축을 세워라.'}

2) analyses — 메모마다:
   - memoId: 위 id 그대로
   - speaker: 이 문장을 말하거나 서술하는 목소리. 셋 중 하나다:
     · 인물 이름 — 메모 문면의 단서로 화자를 특정할 수 있을 때. 단서에는 이름 부름·호칭·대화 구조가 포함된다
       (예: "조르바, 인간이 똥이고…"라고 부르는 말에 답하는 대사 → 화자는 조르바). 이런 단서가 있으면 자신 있게 인물 이름을 써라.
     · "서술자" — 지문, 내면 서술, 1인칭 화자의 사유. 따옴표 없는 문장은 대부분 여기다.
     · "미상" — 따옴표 대사인데 위 단서가 전혀 없을 때만. **미상은 최후 수단이다** — 단서가 있는데 미상으로 도망치지 마라.
       단, 문면 단서 없이 책 줄거리 지식만으로 주인공에게 귀속시키는 것도 금지.
   - emotion: 정서 톤 한 단어 (예: 불안, 해방감, 그리움, 냉소)
   - resonance: 독자가 왜 이 문장에 밑줄 그었을지 한 줄 가설 — 반드시 문면에서 읽히는 것만.
   - motifs: 위 motifCandidates 의 name 중 **이 메모가 관련되는 모든 축**(최대 3개). 하나만 고르려고 아끼지 마라 — 표가 갈리면 축이 성립하지 못한다. 정말 안 맞으면 빈 배열.

출력 JSON: {"motifCandidates":[{"name":"...","description":"..."}],"analyses":[{"memoId":"...","speaker":"...","emotion":"...","resonance":"...","motifs":["..."]}]}`,
    temperature: 0.1,
  });
  try { return JSON.parse(raw); } catch { return { motifCandidates: [], analyses: [] }; }
}

export async function runLitIngest({ book, memos, llm, embedFn, planLitFn, canon, llmConsol, onProgress }) {
  // 모티프 확정 콜: 기본 gpt-4o (mini 는 미배정 판단을 에코로 무시 — 실측 3회).
  // llmConsol 주입 시 그 transport 사용 — Kimi K2.5 등 OpenAI 호환 API A/B 용.
  const consol = llmConsol || ((args) => llm({ ...args, model: 'gpt-4o' }));
  let SEQ = 0; const id = () => `n${++SEQ}`;
  const nodes = new Map(); const log = [];
  const root = { id: id(), title: book.title, parentId: null, level: 0, kind: 'root', sources: [], emb: null };
  nodes.set(root.id, root);
  const childrenOf = (pid) => [...nodes.values()].filter((n) => n.parentId === pid);
  const sentOf = (pid) => childrenOf(pid).filter((n) => n.kind === 'sentence');
  const addConcept = (title, gloss, emb, extra = {}) => {
    const n = { id: id(), title, parentId: root.id, level: 1, kind: 'concept', sources: [], emb, gloss, ...extra };
    nodes.set(n.id, n); return n;
  };
  const addSentence = (a, parentId) => {
    const n = {
      id: id(), title: a.text, parentId, level: nodes.get(parentId).level + 1, kind: 'sentence',
      sources: a.p ? [a.p] : [], emb: null, memoId: a.memoId, gloss: a.resonance || '',
      speaker: a.speaker || '서술자', emotion: a.emotion || '', motif: a.motifName || '', arc: a.arc || '',
    };
    nodes.set(n.id, n);
    const host = nodes.get(parentId);
    if (a.p && host.kind === 'concept' && !host.sources.includes(a.p)) host.sources.push(a.p);
    return n;
  };

  // ─── Phase 1: planIngestLit (gpt-4o, 캐시) ─────────────────
  onProgress?.('phase 1 — planIngestLit 호출(gpt-4o)...');
  const memosWithId = memos.map((m) => ({ ...m, id: m.id || `m${m.p}`, myThought: m.myThought || m.my || '' }));
  const plan = await planLitFn({ memos: memosWithId, book });
  const candidates = (plan.motifCandidates || []).filter((c) => c.name);
  const analyses = (plan.analyses || []).filter((a) => a.memoId);
  log.push(`[plan] 모티프 후보 ${candidates.length}개 · 분석 ${analyses.length}/${memos.length}건`);

  // 분석에 페이지·원문 텍스트·arc 를 붙인다. arc = 메모 페이지 구간 내 상대 위치
  // (책 총 페이지를 모르므로 메모 span 기준 — 소설에선 페이지 순서가 곧 서사 진행)
  const byId = new Map(memosWithId.map((m) => [m.id, m]));
  const pages = memosWithId.map((m) => m.p).filter((p) => p != null);
  const [minP, maxP] = [Math.min(...pages), Math.max(...pages)];
  // 수필·에세이는 독립된 글 모음이라 페이지 순서 ≠ 서사 진행 — 아크 라벨이 오해를 만든다
  const isEssay = /수필|에세이/.test(book.category || '');
  const arcOf = (p) => {
    if (isEssay || p == null || maxP === minP) return '';
    const r = (p - minP) / (maxP - minP);
    return r < 0.33 ? '초반' : r < 0.67 ? '중반' : '종반';
  };
  const items = [];
  for (const a of analyses) {
    const m = byId.get(a.memoId); if (!m) continue;
    items.push({ ...a, p: m.p, text: m.text, arc: arcOf(m.p), motifs: (a.motifs || []).filter(Boolean) });
  }
  // planIngestLit 이 빠뜨린 메모도 유실하지 않는다
  for (const m of memosWithId) if (!items.some((x) => x.memoId === m.id)) {
    items.push({ memoId: m.id, p: m.p, text: m.text, speaker: '서술자', emotion: '', resonance: '', motifs: [], arc: arcOf(m.p) });
  }

  // ─── Phase 2: 모티프 확정 (mini 1콜 + 코드 검증) ────────────
  // 후보×배정 현황을 주고 동의어 병합·약한 모티프 정리를 맡기되,
  // 개수·크기 제약은 프롬프트로 지켜지지 않으므로(비문학 실측) 코드로 강제한다.
  onProgress?.('phase 2 — 모티프 확정');
  const memberOf = (name) => items.filter((x) => x.motifs.some((mm) => nrm(mm) === nrm(name)));
  const candLine = candidates.map((c, i) =>
    `c${i} | ${c.name} — ${c.description || ''}\n${memberOf(c.name).map((x) => `    · p${x.p} ${String(x.text).slice(0, 60)}`).join('\n') || '    (배정 메모 없음)'}`).join('\n');
  // 어느 후보에도 안 걸린 문장을 확정 단계에 함께 보여준다 — 사후 임베딩 "구제"보다
  // 초기 형성에서 LLM 판단으로 배정되는 쪽이 정확하다 (조르바 잔류 5~7 실측의 처방).
  // "강한 후보"(2메모+) 기준으로 판단 — 탈락 예정인 약한 후보만 가리킨 메모도 미배정으로 취급해야
  // 확정 단계에서 살아남을 모티프에 실릴 기회를 얻는다 (전체 후보 기준으로 하면 그 메모들이 누락된다).
  const strong = new Set(candidates.filter((c) => memberOf(c.name).length >= 2).map((c) => nrm(c.name)));
  const unassigned = items.filter((x) => !x.motifs.some((mm) => strong.has(nrm(mm))));
  log.push(`[consol] 강한 후보 ${strong.size}/${candidates.length} · 확정 콜에 미배정 ${unassigned.length}건 제시(${unassigned.map((x) => x.memoId).join(',')})`);
  const unassignedLine = unassigned.map((x) => `- ${x.memoId} p${x.p}: ${String(x.text).slice(0, 70)}`).join('\n');
  const raw = await consol({
    system: '소설 독서 메모의 모티프 목록을 확정한다. 같은 것을 가리키는 모티프는 병합하고, 메모가 2개 미만 걸리는 모티프는 버린다. 메모를 억지로 채워 넣지 마라. JSON만 출력.',
    user: `책: ${book.title}\n\n[모티프 후보와 배정된 메모]\n${candLine}\n${unassigned.length ? `\n[모티프가 없는 문장 — 하나씩 반드시 판단하라]\n${unassignedLine}\n이 문장들은 motifs 의 memoIds 에 넣지 말고, **placements 배열에 문장마다 정확히 한 건씩** 판정하라:
- action="attach": 기존 모티프가 그 설명대로 이미 다루는 주제일 때. motif=그 모티프 이름. **①이 성립하면 new 로 가지 마라** (예: "위대한 사상은 속이 빈 인형" → '체험과 관념의 대립' attach).
- action="new": 기존 어느 모티프도 다루지 않는 새 축일 때만. motif=새 축 이름(짧은 명사구). 문장 1개짜리 축도 된다 — 앞으로 쌓일 메모의 씨앗. 단 문장마다 신설하면 잡동사니다.
- action="drop": 문맥 없는 파편일 때만. 격언·핵심 사유 문장을 drop 하는 것은 실패다.\n` : ''}\n최종 모티프를 확정하라. 각 모티프: name(후보 이름을 다듬어도 됨) · description(1~2문장) · mergedFrom(합친 후보 c번호들) · memoIds(위에 배정된 메모의 memoId — 병합 시 합치기).\n규칙:\n- [모티프가 없는 문장] 섹션이 있으면 그 문장들을 하나씩 판단한 결과가 motifs 에 반영돼야 한다 — 입력 후보를 그대로 복사한 출력은 실패다.\n- **메모 1개짜리 후보를 그냥 버리지 마라.** 서로 합치거나 이웃 후보에 합쳐 메모 2개 이상이 되는지 먼저 검토하고, 정말 어디에도 못 합칠 때만 버린다(예: "이루어질 수 없는 사랑"+"사회적 제약"이 실은 한 축인 경우).\n- **과병합 금지**: 병합은 두 후보가 **같은 심상·주제**를 가리킬 때만이다. 서로 다른 주제를 개수 채우기 편의로 합치지 마라 — 책의 핵심 축이 다른 축에 삼켜져 사라지는 것이 최악의 실패다.\n- 이름 자기검증: 각 이름이 문장들의 **정서 톤**(무의미·고독·슬픔 따위)이 아니라 **반복되는 심상·주제**를 가리키는지 확인하라. 정서 단어가 이름의 중심이면 심상·주제로 바꿔라.${canon ? `\n- 참고 — 이 책의 일반적 해석 축: ${(canon.themes || []).map((t) => t.name).join(' · ')}. 후보가 이 중 하나와 같은 것을 가리키면 그 어휘를 참고해 이름을 다듬어라. 단, 배정된 메모가 실제로 다루는 범위를 넘어서 이름을 부풀리지 마라.` : ''}\n출력 JSON: {"motifs":[{"name":"...","description":"...","mergedFrom":["c0"],"memoIds":["m27"]}],"placements":[{"memoId":"m70","action":"attach|new|drop","motif":"모티프 이름"}]}`,
    temperature: 0.1,
  });
  let finals = [], placements = [];
  try { const pj = JSON.parse(raw); finals = pj.motifs || []; placements = pj.placements || []; } catch { /* 파싱 실패 → 후보 그대로 */ }
  if (!finals.length) finals = candidates.map((c) => ({ name: c.name, description: c.description, mergedFrom: [] }));

  // ⚠ 멤버십은 LLM 이 돌려준 memoIds 를 믿지 않고 코드가 analyses 에서 직접 도출한다 —
  //   파일럿에서 mini 가 실제 id 와 안 맞는 memoIds 를 돌려줘 모티프가 전멸했다.
  //   mini 의 역할은 병합(mergedFrom)·이름·설명 결정까지만.
  const normId = (v) => { const s = String(v ?? '').trim(); return /^m\d+$/.test(s) ? s : /^\d+$/.test(s) ? `m${s}` : s; };
  // 메모가 적을 땐(증분 수집 초기) 1메모 모티프도 씨앗으로 세운다 —
  // 유저는 문장을 하나씩 쌓으므로 2문장짜리 노트에서도 결과가 나와야 한다.
  const MIN_MOTIF = memos.length >= 6 ? 2 : 1;
  const usedMemo = new Set();
  const motifNodes = [];
  for (const f of finals) {
    const srcNames = [f.name, ...(f.mergedFrom || []).map((ci) => candidates[Number(String(ci).replace(/^c/, ''))]?.name)].filter(Boolean);
    const derived = [...new Set(srcNames.flatMap((nm) => memberOf(nm).map((x) => x.memoId)))];
    const returned = [...new Set((f.memoIds || []).map(normId))].filter((mid) => items.some((x) => x.memoId === mid));
    const extra = returned.filter((mid) => !derived.includes(mid));
    if (extra.length) log.push(`[consol] "${f.name}" 확정 단계 추가 배정: ${extra.join(',')}`);
    const mids = [...new Set([...derived, ...returned])].filter((mid) => !usedMemo.has(mid));
    // 확정 단계에서 "새로 세워진" 축(강한 후보 출신이 아닌 것)은 1메모여도 씨앗으로 허용 —
    // LLM 이 미배정 문장을 하나씩 판단해 세운 축이고, 유저는 메모를 하나씩 쌓으므로
    // 이 씨앗이 다음 메모의 자리가 된다. (조르바 m164 영혼·관능, m165 배움 실측)
    const isSeed = !srcNames.some((nm) => strong.has(nrm(nm)));
    const minHere = isSeed ? 1 : MIN_MOTIF;
    if (mids.length < minHere || !f.name) { log.push(`[motif✗] "${f.name || '?'}" 탈락(유효 메모 ${mids.length})`); continue; }
    if (isSeed && mids.length < MIN_MOTIF) log.push(`[motif~] "${f.name}" 씨앗 모티프(메모 ${mids.length})`);
    const gloss = String(f.description || '').trim();
    const node = addConcept(String(f.name).trim(), gloss, await embedFn(`${f.name}: ${gloss}`));
    for (const mid of mids.sort((a, b) => (byId.get(a)?.p || 0) - (byId.get(b)?.p || 0))) {
      usedMemo.add(mid);
      addSentence({ ...items.find((x) => x.memoId === mid), motifName: node.title }, node.id);
    }
    motifNodes.push(node);
    log.push(`[motif] "${node.title}" ← 메모 ${mids.length}개 (p${node.sources.sort((a, b) => a - b).join(',p')})`);
  }

  // ─── Phase 2.3: placements 집행 — 미배정 문장의 문장별 판정(attach|new|drop)을 코드가 적용 ──
  // "목록을 알아서 고쳐라"는 편집 지시는 샘플마다 준수율이 출렁였다(43 균형→45 전부 신설→46 전부 편입 실측).
  // 문장별 폐쇄형 분류로 좁히고 집행·검증은 코드가 한다 — 비문학의 "제약은 코드로 강제" 원칙.
  {
    const findMotif = (name) => motifNodes.find((n) => nodes.has(n.id) && nrm(n.title) === nrm(name));
    const newGroups = new Map(); // 신설 이름 → memoIds (같은 이름은 한 노드로)
    let attached = 0, dropped = 0;
    for (const pl of placements) {
      const mid = normId(pl.memoId);
      const x = items.find((i) => i.memoId === mid);
      if (!x || usedMemo.has(mid)) continue;
      const action = String(pl.action || '').toLowerCase();
      if (action === 'attach' && pl.motif && findMotif(pl.motif)) {
        const node = findMotif(pl.motif);
        usedMemo.add(mid);
        addSentence({ ...x, motifName: node.title }, node.id);
        attached++;
      } else if (action === 'new' && pl.motif) {
        const key = nrm(pl.motif);
        if (!newGroups.has(key)) newGroups.set(key, { name: String(pl.motif).trim(), mids: [] });
        newGroups.get(key).mids.push(mid);
      } else if (action === 'drop') {
        dropped++; // 백스톱(2.5)으로 넘어간다 — 코사인이 잡으면 살고, 아니면 root 잔류
      }
    }
    for (const g of newGroups.values()) {
      const node = addConcept(g.name, '', await embedFn(g.name));
      for (const mid of g.mids.sort((a, b) => (byId.get(a)?.p || 0) - (byId.get(b)?.p || 0))) {
        if (usedMemo.has(mid)) continue;
        usedMemo.add(mid);
        addSentence({ ...items.find((i) => i.memoId === mid), motifName: node.title }, node.id);
      }
      motifNodes.push(node);
      log.push(`[motif~] "${g.name}" 씨앗 신설(placements · 메모 ${g.mids.length})`);
    }
    if (placements.length) log.push(`[placements] 판정 ${placements.length}건 — attach ${attached} · new ${newGroups.size}축 · drop ${dropped}`);
  }

  // ─── Phase 2.5: 미배정 메모 — 임베딩 근접 모티프(≥0.3), 미달이면 root 직속 ──
  const orphans = items.filter((x) => !usedMemo.has(x.memoId));
  let adopted = 0;
  for (const x of orphans) {
    let host = null;
    if (motifNodes.length) {
      // ① 이 메모가 planIngestLit 에서 가리킨 후보가 최종 모티프에 병합돼 살아남았으면 그쪽으로
      //    (다중 배정 도입 후에도 후보 일부가 탈락하면 고아가 된다 — 조르바 잔류 7 실측)
      host = motifNodes.find((n) => nodes.has(n.id) && x.motifs.some((mm) => nrm(mm) === nrm(n.title))) || null;
      if (!host) {
        // ② 임베딩 근접 — 문장 원문에 resonance(밑줄 이유)를 붙이면 모티프 설명과 어휘가 겹쳐 매칭이 잘 된다.
        //    코사인은 보수적으로(0.3) — 억지 편입은 초기 모티프를 잘 세우는 것보다 못하다.
        const e = await embedFn([x.text, x.resonance].filter(Boolean).join(' '));
        let best = -1;
        for (const n of motifNodes) { if (!nodes.has(n.id)) continue; const s = cos(e, n.emb); if (s > best) { best = s; host = n; } }
        if (best < 0.3) host = null;
      }
    }
    // ③ 그래도 못 찾으면 root 에 버리지 않고 그 문장의 씨앗 모티프를 세운다 —
    //    독자가 밑줄 그은 문장은 전부 위키에 자리가 있어야 한다(증분 수집 원칙).
    //    이름은 planIngestLit 이 이미 부여한 후보명 우선, 없으면 mini 이름짓기(단순 생성이라 mini 로 충분).
    if (!host) {
      let name = (x.motifs || [])[0];
      if (!name) {
        const nameRaw = await llm({
          system: '문학 문장 하나의 핵심 심상·주제를 짧은 명사구 하나로 짓는다. JSON만 출력.',
          user: `책: ${book.title}\n문장: ${String(x.text).slice(0, 300)}\n출력 JSON: {"name":"짧은 명사구"}`,
          temperature: 0.1,
        });
        try { name = String(JSON.parse(nameRaw).name || '').trim(); } catch { /* 실패 시 root */ }
      }
      if (name) {
        host = addConcept(name, '', await embedFn(name));
        motifNodes.push(host);
        log.push(`[motif~] "${name}" 씨앗 신설(잔류 방지 · p${x.p})`);
      }
    }
    addSentence({ ...x, motifName: host?.title || '' }, host ? host.id : root.id);
    if (host) adopted++;
  }
  if (orphans.length) log.push(`[orphan] 미배정 ${orphans.length}개 — 근접 편입 ${adopted} · root 잔류 ${orphans.length - adopted}`);
  // 편입 후에도 페이지순 유지 — 문장 노드 자체엔 순서가 없으므로 직렬화 순서로 보장하지 않고
  // 대시보드가 sources/p 로 정렬한다. (노드 배열 순서 의존 방지)

  // ─── Phase 3: 모티프 내부 목소리 분기 — 인물은 축이 아니라 "모티프에 대한 대응·견해" ──
  // 인물을 상위로 승격하면 같은 모티프가 1차 축과 인물 아래에 중복으로 서고(자유와 해방 ×2 실측),
  // 한 인물 중심 소설(죄와 벌)에선 인물 키워드가 정보가 없다. 구조를 뒤집는다:
  // 책 → 모티프 → [목소리(인물별 견해) — 서로 다른 목소리가 2개 이상일 때만] → 문장.
  // 누군가에게 책을 설명하듯: 모티프를 나열하고, 인물의 실제 발언·행동으로 구체화한다.
  let voiceBranches = 0;
  for (const motifNode of motifNodes.filter((n) => nodes.has(n.id))) {
    const sents = sentOf(motifNode.id);
    const bySp = new Map();
    for (const s of sents) {
      const key = nrm(s.speaker || '서술자');
      if (!bySp.has(key)) bySp.set(key, { name: s.speaker || '서술자', sents: [] });
      bySp.get(key).sents.push(s);
    }
    // 2문장 이상인 목소리가 2개 이상일 때만 분기 — 목소리가 하나뿐이면(단일 주인공 소설) 층을 늘리지 않는다.
    // "미상"(화자 특정 불가)은 분기 대상이 아니다 — 모티프 직속에 남긴다. 억지 귀속이 오인보다 낫지 않다.
    const groups = [...bySp.values()].filter((g) => g.sents.length >= 2 && nrm(g.name) !== nrm('미상'));
    if (bySp.size < 2 || groups.length < 2) continue;
    for (const g of groups) {
      const v = addConcept(g.name, `${g.name}의 발언·시선으로 본 '${motifNode.title}'`, null, { role: 'voice' });
      v.parentId = motifNode.id; v.level = motifNode.level + 1;
      for (const s of g.sents.sort((a, b) => (a.sources[0] || 0) - (b.sources[0] || 0))) {
        s.parentId = v.id; s.level = v.level + 1;
        const p = s.sources[0]; if (p != null && !v.sources.includes(p)) v.sources.push(p);
      }
      voiceBranches++;
    }
    log.push(`[voice] "${motifNode.title}" 목소리 분기: ${groups.map((g) => `${g.name}(${g.sents.length})`).join(' · ')}`);
    // 1문장짜리 목소리는 모티프 직속에 남는다 (1문장 노드 금지 원칙)
  }

  const sentences = [...nodes.values()].filter((n) => n.kind === 'sentence');
  const stats = {
    variant: 'literature-v1',
    motifs: motifNodes.filter((n) => nodes.has(n.id)).length,
    voices: voiceBranches,
    sentences: sentences.length,
    rootSentences: sentences.filter((n) => n.parentId === root.id).length,
  };
  return {
    nodes, rootId: root.id, stats, log,
    mode: { mode: '모티프 축', confidence: motifNodes.length >= 2 ? 'high' : 'low', reason: motifNodes.map((n) => n.title).join(' · ') || '모티프 불성립' },
  };
}

// ─── 동화 모드 (증분) — 기존 모티프 트리를 고정 컨텍스트로 주고 새 메모 1개만 배정 ──
// 실서비스 시나리오: 유저는 메모를 하나씩 쌓는다. 전량 재인제스트는 재현성이 35~39%로
// 출렁이지만(stability-1 실측), 동화는 기존 축이 고정이라 출렁일 여지가 배정 1건뿐이다.
// 판정은 폐쇄형(attach|new)이라 mini 로 충분한지가 검증 대상 — confidence 낮으면 4o 에스컬레이션.
// 집행·검증·목소리 재분기는 전부 코드(비문학 v9 동화 우선과 같은 경로).

const nextId = (nodes) => {
  let mx = 0;
  for (const k of nodes.keys()) { const n = Number(String(k).replace(/^n/, '')); if (n > mx) mx = n; }
  return () => `n${++mx}`;
};

// 목소리 층을 전부 걷어내고 다시 세운다 — 증분 후 분기 조건(2목소리×2문장)이 새로 성립/해소될 수 있다.
export function rebranchVoices(nodes, rootId) {
  for (const v of [...nodes.values()].filter((n) => n.role === 'voice')) {
    for (const s of [...nodes.values()].filter((n) => n.parentId === v.id)) { s.parentId = v.parentId; s.level = v.level; }
    nodes.delete(v.id);
  }
  const id = nextId(nodes);
  let branches = 0;
  for (const motifNode of [...nodes.values()].filter((n) => n.kind === 'concept' && n.parentId === rootId && n.role !== 'voice')) {
    const sents = [...nodes.values()].filter((n) => n.parentId === motifNode.id && n.kind === 'sentence');
    const bySp = new Map();
    for (const s of sents) {
      const key = nrm(s.speaker || '서술자');
      if (!bySp.has(key)) bySp.set(key, { name: s.speaker || '서술자', sents: [] });
      bySp.get(key).sents.push(s);
    }
    const groups = [...bySp.values()].filter((g) => g.sents.length >= 2 && nrm(g.name) !== nrm('미상'));
    if (bySp.size < 2 || groups.length < 2) continue;
    for (const g of groups) {
      const v = {
        id: id(), title: g.name, parentId: motifNode.id, level: motifNode.level + 1, kind: 'concept',
        sources: [], emb: null, gloss: `${g.name}의 발언·시선으로 본 '${motifNode.title}'`, role: 'voice',
      };
      nodes.set(v.id, v);
      for (const s of g.sents) {
        s.parentId = v.id; s.level = v.level + 1;
        const p = s.sources[0]; if (p != null && !v.sources.includes(p)) v.sources.push(p);
      }
      branches++;
    }
  }
  return branches;
}

// 아크 라벨 재계산 — 증분으로 페이지 범위(min/max)가 바뀌면 기존 문장의 초반/중반/종반도 달라진다.
export function recomputeArcs(nodes, isEssay) {
  const sents = [...nodes.values()].filter((n) => n.kind === 'sentence');
  const pages = sents.map((s) => s.sources[0]).filter((p) => p != null);
  if (!pages.length) return;
  const [minP, maxP] = [Math.min(...pages), Math.max(...pages)];
  for (const s of sents) {
    const p = s.sources[0];
    s.arc = (isEssay || p == null || maxP === minP) ? '' : ((p - minP) / (maxP - minP)) < 0.33 ? '초반' : ((p - minP) / (maxP - minP)) < 0.67 ? '중반' : '종반';
  }
}

// ─── 씨앗 통합 — 파편화·재현성의 공통 뿌리(씨앗 남발) 처방 ──────────────
// 증분 동화가 쌓이면 사실상 같은/포함 관계인 모티프가 나란히 선다(run 74~75 실측 12~14개).
// 코드가 임베딩 유사도 ≥0.5 쌍만 추려서 mini 에 쌍별 폐쇄 판정을 맡긴다:
//   same — 같은 심상 → 병합(문장 많은 쪽이 승자)
//   sub  — 한쪽이 다른 쪽의 하위 측면 → 병합하지 않고 **하위 모티프로 편입**(2층 위계)
//   distinct — 별개 → 그대로 (judged 셋에 기록해 재판정 방지)
export async function consolidateSeeds({ nodes, rootId, book, llm, embedFn, judged = new Set(), maxPairs = 4 }) {
  const rootMotifs = () => [...nodes.values()].filter((n) => n.kind === 'concept' && n.parentId === rootId && n.role !== 'voice');
  // 적응형 통합 강도 — 통합이 가장 필요한(씨앗이 흩어진) 실행일수록 유사도 게이트에 걸리는
  // 쌍이 적어지는 악순환(run 78: new 9건 → 통합 1건 → 11축). 트리가 과편화 상태면
  // 문을 넓힌다: 게이트 0.5→0.4, 판정쌍 상한 4→8. 병합/하위/별개 판단 기준 자체는 그대로
  // ("애매하면 distinct") — 나쁜 실행만 끌어올리고 좋은 실행은 건드리지 않는다.
  const sentTotal = [...nodes.values()].filter((n) => n.kind === 'sentence').length;
  const overFragmented = rootMotifs().length > Math.max(5, Math.ceil(sentTotal / 3));
  const simGate = overFragmented ? 0.4 : 0.5;
  if (overFragmented) maxPairs = Math.max(maxPairs, 8);
  const kidsOf = (nid) => [...nodes.values()].filter((n) => n.parentId === nid);
  const sentCount = (m) => {
    let c = 0;
    const walk = (nid) => { for (const k of kidsOf(nid)) { if (k.kind === 'sentence') c++; else walk(k.id); } };
    walk(m.id); return c;
  };
  const examples = (m) => {
    const out = [];
    const walk = (nid) => { for (const k of kidsOf(nid)) { if (k.kind === 'sentence') out.push(k); else walk(k.id); } };
    walk(m.id);
    return out.slice(0, 2).map((s) => `「${String(s.title).slice(0, 60)}」`).join(' ');
  };
  const relevel = (nid, level) => { const n = nodes.get(nid); n.level = level; for (const k of kidsOf(nid)) relevel(k.id, level + 1); };

  await ensureMotifEmbs(rootMotifs(), embedFn);
  const ms = rootMotifs();
  const pairs = [];
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
    const key = [nrm(ms[i].title), nrm(ms[j].title)].sort().join('|');
    if (judged.has(key) || !ms[i].emb || !ms[j].emb) continue;
    const sim = cos(ms[i].emb, ms[j].emb);
    if (sim >= simGate) pairs.push({ a: ms[i], b: ms[j], sim, key });
  }
  pairs.sort((x, y) => y.sim - x.sim);

  const gone = new Set(); const actions = [];
  for (const p of pairs.slice(0, maxPairs)) {
    if (gone.has(p.a.id) || gone.has(p.b.id)) continue;
    judged.add(p.key);
    let out = null;
    try {
      out = JSON.parse(await llm({
        system: '한 소설 위키의 모티프 두 개의 관계를 판정한다. JSON만 출력.',
        user: `책: ${book.title}

A: ${p.a.title}${p.a.gloss ? ` — ${p.a.gloss}` : ''}\n   예시: ${examples(p.a) || '(없음)'}
B: ${p.b.title}${p.b.gloss ? ` — ${p.b.gloss}` : ''}\n   예시: ${examples(p.b) || '(없음)'}

관계를 하나만 골라라:
- "same" — 사실상 같은 심상·주제를 다른 말로 부른 것.
- "sub" — 한쪽이 다른 쪽의 **하위 측면**(더 구체적인 갈래)일 때. parent="A"|"B" (더 넓은 쪽).
- "distinct" — 서로 다른 축. 애매하면 distinct 다 — 억지 병합이 최악이다.

출력 JSON: {"relation":"same|sub|distinct","parent":"A|B"}`,
        temperature: 0.1,
      }));
    } catch { continue; }
    const rel = String(out?.relation || '').toLowerCase();
    if (rel === 'same') {
      const [win, lose] = sentCount(p.a) >= sentCount(p.b) ? [p.a, p.b] : [p.b, p.a];
      for (const k of kidsOf(lose.id)) { k.parentId = win.id; relevel(k.id, win.level + 1); }
      for (const s of lose.sources) if (!win.sources.includes(s)) win.sources.push(s);
      nodes.delete(lose.id); gone.add(lose.id);
      actions.push(`[consol] "${lose.title}" → "${win.title}" 병합`);
    } else if (rel === 'sub' && (out.parent === 'A' || out.parent === 'B')) {
      const [par, child] = out.parent === 'A' ? [p.a, p.b] : [p.b, p.a];
      // 2층 위계까지만 — 하위 모티프가 또 하위를 갖는 건 금지(대시보드 가독성)
      if (kidsOf(child.id).some((k) => k.kind === 'concept' && k.role !== 'voice')) continue;
      child.parentId = par.id; relevel(child.id, par.level + 1);
      for (const s of child.sources) if (!par.sources.includes(s)) par.sources.push(s);
      gone.add(child.id);
      actions.push(`[consol] "${child.title}" ⊂ "${par.title}" 하위 편입`);
    }
  }
  return actions;
}

// 새 메모 1개를 기존 트리에 동화한다. nodes 를 직접 변형.
// llm = 판정 모델(mini 검증 대상), llmEsc = 저신뢰 에스컬레이션(4o), 없으면 에스컬레이션 안 함.
// 반환: { action:'attach'|'new', motif, escalated, confidence }
export async function assimilateLitMemo({ nodes, rootId, book, memo, llm, llmEsc, embedFn }) {
  const motifs = [...nodes.values()].filter((n) => n.kind === 'concept' && n.parentId === rootId && n.role !== 'voice');
  const sentsOf = (m) => {
    const direct = [...nodes.values()].filter((n) => n.kind === 'sentence' && n.parentId === m.id);
    const viaVoice = [...nodes.values()].filter((n) => n.role === 'voice' && n.parentId === m.id)
      .flatMap((v) => [...nodes.values()].filter((n) => n.kind === 'sentence' && n.parentId === v.id));
    return [...direct, ...viaVoice];
  };
  // ⚠ mini 는 attach|new 경계를 프롬프트 뉘앙스로 못 잡는다 — run 68(16/16 attach) ↔ run 70(16/16 new)
  //   진자 실측. 추상적 경계 판단 대신: 코드가 임베딩으로 후보를 상위 K개로 좁혀서 주고,
  //   LLM 은 "이 후보들의 예시 문장 옆에 놓이는가"라는 구체적 비교 선택만 한다.
  const e = embedFn ? await embedFn(memo.text) : null;
  // 저장된 트리를 불러온 직후엔 emb 가 없다. 여기서 되살리지 않으면 후보가 0개가 되어
  // 매 문장이 NEW 가 된다 — ensureMotifEmbs 주석 참조 (BKT-383).
  await ensureMotifEmbs(motifs, embedFn);
  const ranked = e
    ? motifs.map((m) => ({ m, sim: m.emb ? cos(e, m.emb) : -1 })).sort((a, b) => b.sim - a.sim)
    : motifs.map((m) => ({ m, sim: -1 }));
  const top = ranked.slice(0, 3).filter((r) => r.sim >= 0.2 || !e);
  const candLine = top.map((r, k) =>
    `후보${k + 1} | ${r.m.title}${r.m.gloss ? ` — ${r.m.gloss}` : ''}\n${sentsOf(r.m).slice(0, 3).map((s) => `    · p${s.sources[0] ?? '?'} ${String(s.title).slice(0, 70)}`).join('\n')}`).join('\n');
  const prompt = {
    system: '소설 독서 메모 1개를 기존 위키의 모티프 축에 배정하는 문학 편집자다. 책 줄거리를 아는 척 추론하지 마라 — 근거는 메모 문면뿐. JSON만 출력.',
    user: `책: ${book.title}${book.author ? ` (${book.author})` : ''}

[새 메모] p${memo.p}: ${memo.text}${memo.myThought ? `\n(내 생각: ${memo.myThought})` : ''}

[가까운 기존 모티프 후보 — 예시 문장 포함]
${candLine || '(없음)'}

판정 기준: 이 메모를 각 후보의 **예시 문장들 옆에 놓았을 때** 같은 심상·주제의 연속으로 읽히는가?
- 그런 후보가 있으면 choice=그 후보의 이름 그대로.
- 어느 후보와도 다른 심상이면 choice="NEW", newName=새 축 이름(짧은 명사구 — 정서 단어 말고 심상·주제, 메모 속 책 고유의 표현 우선).
그리고 speaker(인물 이름|서술자|미상 — 문면 단서 있을 때만 인물, 따옴표 없으면 대부분 서술자), emotion(정서 한 단어), resonance(밑줄 이유 한 줄), confidence(0~1).

출력 JSON: {"choice":"후보 이름 또는 NEW","newName":"...","speaker":"...","emotion":"...","resonance":"...","confidence":0.9}`,
    temperature: 0.1,
  };
  let out = null, escalated = false;
  const ask = async (fn) => { try { return JSON.parse(await fn(prompt)); } catch { return null; } };
  out = await ask(llm);
  const findHost = (o) => o && o.choice && nrm(o.choice) !== nrm('NEW')
    ? top.find((r) => nrm(r.m.title) === nrm(o.choice))?.m || motifs.find((m) => nrm(m.title) === nrm(o.choice)) || null
    : null;
  // 에스컬레이션: 파싱 실패 · 후보 밖 이름 · 저신뢰 · NEW 인데 최근접 축과 임베딩상 매우 가까움(중복 신설 게이트)
  const bad = (o) => !o || !o.choice
    || (nrm(o.choice) !== nrm('NEW') && !findHost(o))
    || (Number(o.confidence ?? 1) < 0.6)
    || (nrm(o.choice) === nrm('NEW') && top.length && top[0].sim >= 0.5);
  if (bad(out) && llmEsc) { out = (await ask(llmEsc)) || out; escalated = true; }

  const id = nextId(nodes);
  let host = findHost(out), action = 'new';
  if (host) action = 'attach';
  else {
    // 씨앗 신설 — 이름이 안 왔으면 문장 조각을 이름으로 쓰지 않고(run 72 "그런데 당신은 이 폐허에서…" 실측)
    // 이름짓기 콜로 폴백. gloss 는 resonance 로 채운다 — 비면 다음 메모 판정 때 이 씨앗이
    // 후보로 제시돼도 정보가 없어 다시 붙지 못한다(씨앗이 자라지 못하는 구조).
    let name = String(out?.newName || '').trim();
    if (!name || name.length > 25 || /["'“”,.?!]/.test(name)) {
      const nameRaw = await llm({
        system: '문학 문장 하나의 핵심 심상·주제를 짧은 명사구 하나로 짓는다. 정서 단어 말고 심상·주제. JSON만 출력.',
        user: `책: ${book.title}\n문장: ${String(memo.text).slice(0, 300)}\n출력 JSON: {"name":"짧은 명사구"}`,
        temperature: 0.1,
      });
      try { name = String(JSON.parse(nameRaw).name || '').trim() || name; } catch { /* 원래 값 유지 */ }
      if (!name) name = String(memo.text).slice(0, 20);
    }
    const gloss = String(out?.resonance || '').trim();
    host = {
      id: id(), title: name, parentId: rootId, level: 1, kind: 'concept', sources: [],
      emb: embedFn ? await embedFn(`${name}: ${gloss}`) : null, gloss,
    };
    nodes.set(host.id, host);
  }
  const s = {
    id: id(), title: memo.text, parentId: host.id, level: host.level + 1, kind: 'sentence',
    sources: memo.p != null ? [memo.p] : [], emb: null, memoId: memo.id, gloss: out?.resonance || '',
    speaker: out?.speaker || '서술자', emotion: out?.emotion || '', motif: host.title, arc: '',
  };
  nodes.set(s.id, s);
  if (memo.p != null && !host.sources.includes(memo.p)) host.sources.push(memo.p);
  return { action, motif: host.title, escalated, confidence: Number(out?.confidence ?? 0) };
}

