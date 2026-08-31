// 빅콜 effort 실측 (BKT-381 0831) — 서버가 low 로 전환한 뒤 첫 실측.
// 서버 v3.5 프롬프트(functions/lib/ingest.js buildPrompt)를 자구 그대로 쓰고,
// claude CLI 의 --effort 로 low / medium 을 갈라 사고 토큰·시간·트리 모양을 잰다.
// API 의 output_config.effort 와 CLI --effort 는 같은 손잡이 — CLI 실측은 참고치,
// 최종 판정은 배포 함수의 usage 로그 (ba82e85).
//
// 사용: [BOOK=피로사회] [EFFORTS=low,medium] [REPEAT=1] node runBigCallEffort.mjs <라벨>
//   케이스: golden/app-cases/*.json (앱 실측 데이터) 우선

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { claudeCliTransport } from './lib/claudeCliTransport.mjs';

const IOS_LIB = '/Users/1522684/Developer/booktracking-ios/functions/lib';
const { buildPrompt } = await import(`${IOS_LIB}/ingest.js`);

const __dir = dirname(fileURLToPath(import.meta.url));
const N = (s) => String(s || '').normalize('NFC');
const nrmT = (s) => N(s).trim();
const label = process.argv[2] || '1';
const title = nrmT(process.env.BOOK || '피로사회');
const efforts = (process.env.EFFORTS || 'low,medium').split(',').map((s) => s.trim());
const REPEAT = Number(process.env.REPEAT || 1);

// runBigCallAssim 과 같은 케이스 로더 (앱 실측 케이스만 — 실전과 같은 재료)
async function loadCase() {
  const appDir = resolve(__dir, 'golden/app-cases');
  for (const f of await readdir(appDir)) {
    if (!f.endsWith('.json')) continue;
    const c = JSON.parse(await readFile(resolve(appDir, f), 'utf-8'));
    if (nrmT(c.book?.title) === title || nrmT(c.book?.title).includes(title)) {
      const rich = c.richMeta
        ? [(c.richMeta.toc || []).join('\n'), c.richMeta.bookIntro, c.richMeta.inBook].filter((s) => s && s.trim())
        : [];
      return { title: nrmT(c.book.title), rich, memos: c.book.memos.map((m, i) => ({
        id: m.id || `m${i}`, text: m.text, page: m.p ?? null,
        thoughts: m.myThought ? [m.myThought] : [],
      })) };
    }
  }
  throw new Error(`app-cases 에서 케이스를 못 찾음: ${title}`);
}

// 트리 모양 요약 — 품질의 빠른 대리 지표 (정밀 채점은 v13 채점기 몫)
function shape(parsed) {
  let concepts = 0, sentences = 0, maxDepth = 0, glossMissing = 0;
  const placed = new Set();
  const walk = (arr, d) => {
    for (const x of arr || []) {
      maxDepth = Math.max(maxDepth, d);
      if (x.kind === 'sentence') { sentences++; if (x.memoId) placed.add(x.memoId); }
      else { concepts++; if (!x.gloss) glossMissing++; }
      walk(x.children, d + 1);
    }
  };
  walk(parsed.tree, 1);
  return {
    root: (parsed.tree || []).length, concepts, sentences, maxDepth, glossMissing,
    contrasts: (parsed.contrasts || []).length, placedMemos: placed.size,
    thesis: !!parsed.thesis,
  };
}

const kase = await loadCase();
const prompt = buildPrompt(kase.title, kase.rich, kase.memos);
console.log(`케이스: ${kase.title} — 메모 ${kase.memos.length}건 · 프롬프트 ${prompt.length}자`);

const results = [];
for (const effort of efforts) {
  for (let r = 1; r <= REPEAT; r++) {
    let usage = null;
    const llm = claudeCliTransport({
      model: 'claude-sonnet-5', timeoutMs: 480000, effort,
      maxThinkingTokens: null, // 0 강제 해제 — effort 가 사고량을 정하게 둔다
      onUsage: (u) => { usage = u; },
    });
    const t0 = Date.now();
    let parsed = null, error = null;
    try {
      const raw = await llm({ user: prompt });
      // 서버 callBigCall 과 같은 파싱 방어 — 점검 노트가 앞에 붙는 케이스
      const txt = (raw.match(/\{[\s\S]*\}/) || ['{}'])[0];
      try { parsed = JSON.parse(txt); } catch {
        const i = txt.indexOf('{"thesis"');
        if (i >= 0) parsed = JSON.parse(txt.slice(i));
        else throw new Error(`파싱 실패: ${txt.slice(0, 120)}`);
      }
    } catch (e) { error = e.message.slice(0, 200); }
    const sec = Math.round((Date.now() - t0) / 100) / 10;
    const row = { effort, run: r, sec, usage, error, shape: parsed ? shape(parsed) : null };
    results.push(row);
    console.log(`[${effort} #${r}] ${sec}초 · out ${usage?.outputTokens ?? '?'}tok · $${usage?.costUsd?.toFixed?.(4) ?? '?'}${error ? ` · 실패: ${error}` : ` · 루트 ${row.shape.root} 개념 ${row.shape.concepts} 문장 ${row.shape.sentences} 깊이 ${row.shape.maxDepth}`}`);
  }
}

const out = { label: `bigcall-effort-${label}`, runAt: new Date().toISOString(), book: kase.title, nMemos: kase.memos.length, promptChars: prompt.length, results };
await writeFile(resolve(__dir, `runs/${out.label}.json`), JSON.stringify(out, null, 2));
console.log(`→ runs/${out.label}.json`);
