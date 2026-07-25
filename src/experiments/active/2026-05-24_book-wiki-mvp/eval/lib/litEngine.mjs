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
   - 메모 1개에만 걸리는 모티프는 만들지 마라.

2) analyses — 메모마다:
   - memoId: 위 id 그대로
   - speaker: 이 문장을 말하거나 서술하는 목소리. 문면에서 인물이 확실할 때만 인물 이름, 아니면 "서술자".
   - emotion: 정서 톤 한 단어 (예: 불안, 해방감, 그리움, 냉소)
   - resonance: 독자가 왜 이 문장에 밑줄 그었을지 한 줄 가설 — 반드시 문면에서 읽히는 것만.
   - motifs: 위 motifCandidates 의 name 중 **이 메모가 관련되는 모든 축**(최대 3개). 하나만 고르려고 아끼지 마라 — 표가 갈리면 축이 성립하지 못한다. 정말 안 맞으면 빈 배열.

출력 JSON: {"motifCandidates":[{"name":"...","description":"..."}],"analyses":[{"memoId":"...","speaker":"...","emotion":"...","resonance":"...","motifs":["..."]}]}`,
    temperature: 0.1,
  });
  try { return JSON.parse(raw); } catch { return { motifCandidates: [], analyses: [] }; }
}

export async function runLitIngest({ book, memos, llm, embedFn, planLitFn, canon, onProgress }) {
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
  const arcOf = (p) => {
    if (p == null || maxP === minP) return '';
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
  const raw = await llm({
    system: '소설 독서 메모의 모티프 목록을 확정한다. 같은 것을 가리키는 모티프는 병합하고, 메모가 2개 미만 걸리는 모티프는 버린다. 메모를 억지로 채워 넣지 마라. JSON만 출력.',
    user: `책: ${book.title}\n\n[모티프 후보와 배정된 메모]\n${candLine}\n\n최종 모티프를 확정하라. 각 모티프: name(후보 이름을 다듬어도 됨) · description(1~2문장) · mergedFrom(합친 후보 c번호들) · memoIds(위에 배정된 메모의 memoId — 병합 시 합치기).\n규칙:\n- **메모 1개짜리 후보를 그냥 버리지 마라.** 서로 합치거나 이웃 후보에 합쳐 메모 2개 이상이 되는지 먼저 검토하고, 정말 어디에도 못 합칠 때만 버린다(예: "이루어질 수 없는 사랑"+"사회적 제약"이 실은 한 축인 경우).\n- **과병합 금지**: 병합은 두 후보가 **같은 심상·주제**를 가리킬 때만이다. 서로 다른 주제를 개수 채우기 편의로 합치지 마라 — 책의 핵심 축이 다른 축에 삼켜져 사라지는 것이 최악의 실패다.\n- 이름 자기검증: 각 이름이 문장들의 **정서 톤**(무의미·고독·슬픔 따위)이 아니라 **반복되는 심상·주제**를 가리키는지 확인하라. 정서 단어가 이름의 중심이면 심상·주제로 바꿔라.${canon ? `\n- 참고 — 이 책의 일반적 해석 축: ${(canon.themes || []).map((t) => t.name).join(' · ')}. 후보가 이 중 하나와 같은 것을 가리키면 그 어휘를 참고해 이름을 다듬어라. 단, 배정된 메모가 실제로 다루는 범위를 넘어서 이름을 부풀리지 마라.` : ''}\n출력 JSON: {"motifs":[{"name":"...","description":"...","mergedFrom":["c0"],"memoIds":["m27"]}]}`,
    temperature: 0.1,
  });
  let finals = []; try { finals = (JSON.parse(raw).motifs || []); } catch { /* 파싱 실패 → 후보 그대로 */ }
  if (!finals.length) finals = candidates.map((c) => ({ name: c.name, description: c.description, mergedFrom: [] }));

  // ⚠ 멤버십은 LLM 이 돌려준 memoIds 를 믿지 않고 코드가 analyses 에서 직접 도출한다 —
  //   파일럿에서 mini 가 실제 id 와 안 맞는 memoIds 를 돌려줘 모티프가 전멸했다.
  //   mini 의 역할은 병합(mergedFrom)·이름·설명 결정까지만.
  const normId = (v) => { const s = String(v ?? '').trim(); return /^m\d+$/.test(s) ? s : /^\d+$/.test(s) ? `m${s}` : s; };
  const usedMemo = new Set();
  const motifNodes = [];
  for (const f of finals) {
    const srcNames = [f.name, ...(f.mergedFrom || []).map((ci) => candidates[Number(String(ci).replace(/^c/, ''))]?.name)].filter(Boolean);
    const derived = [...new Set(srcNames.flatMap((nm) => memberOf(nm).map((x) => x.memoId)))];
    const returned = [...new Set((f.memoIds || []).map(normId))].filter((mid) => items.some((x) => x.memoId === mid));
    const mids = [...new Set([...derived, ...returned])].filter((mid) => !usedMemo.has(mid));
    if (mids.length < 2 || !f.name) { log.push(`[motif✗] "${f.name || '?'}" 탈락(유효 메모 ${mids.length})`); continue; }
    const gloss = String(f.description || '').trim();
    const node = addConcept(String(f.name).trim(), gloss, await embedFn(`${f.name}: ${gloss}`));
    for (const mid of mids.sort((a, b) => (byId.get(a)?.p || 0) - (byId.get(b)?.p || 0))) {
      usedMemo.add(mid);
      addSentence({ ...items.find((x) => x.memoId === mid), motifName: node.title }, node.id);
    }
    motifNodes.push(node);
    log.push(`[motif] "${node.title}" ← 메모 ${mids.length}개 (p${node.sources.sort((a, b) => a - b).join(',p')})`);
  }

  // ─── Phase 2.5: 미배정 메모 — 임베딩 근접 모티프(≥0.3), 미달이면 root 직속 ──
  const orphans = items.filter((x) => !usedMemo.has(x.memoId));
  let adopted = 0;
  for (const x of orphans) {
    let host = null;
    if (motifNodes.length) {
      const e = await embedFn(x.text);
      let best = -1;
      for (const n of motifNodes) { const s = cos(e, n.emb); if (s > best) { best = s; host = n; } }
      if (best < 0.3) host = null;
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
    // 2문장 이상인 목소리가 2개 이상일 때만 분기 — 목소리가 하나뿐이면(단일 주인공 소설) 층을 늘리지 않는다
    const groups = [...bySp.values()].filter((g) => g.sents.length >= 2);
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
