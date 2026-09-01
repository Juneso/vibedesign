// 문학 빅콜 사고량 A/B (BKT-381 0901) — 죄와벌 실사용에서 low 사고(391tok)가
// 모티프를 문장 표면 추출로 주저앉힌 것의 대응 실험.
//   A. 사고 medium급(8K) + 현행 프롬프트          ← 서버 현행(0901 복원)
//   B. 사고 low급(500) + 프롬프트 조이기          ← 사고를 출력으로 옮기는 안
//   C. 사고 low급(500) + 현행 프롬프트            ← 문제 재현 대조군
// 조이기 = JSON 앞에 정본 해석 축·메모 관통 심상을 명시적으로 쓰게 강제
// + 이름 3점 자기검증. 사고 없이도 회상이 일어나게 하는 고전 수법.
//
// CLI 의 --effort 는 API effort 의 대리가 못 되므로(0831 실측) 사고량은
// MAX_THINKING_TOKENS 로 직접 맞춘다.
//
// 사용: [BOOK=죄와 벌] node runLitEffortAB.mjs <라벨>

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { claudeCliTransport } from './lib/claudeCliTransport.mjs';

const IOS_LIB = '/Users/1522684/Developer/booktracking-ios/functions/lib';
const { buildLitPrompt } = await import(`${IOS_LIB}/ingestLit.js`);

const __dir = dirname(fileURLToPath(import.meta.url));
const N = (s) => String(s || '').normalize('NFC');
const nrmT = (s) => N(s).trim();
const label = process.argv[2] || '1';
const title = nrmT(process.env.BOOK || '죄와 벌');

async function loadCase() {
  const appDir = resolve(__dir, 'golden/app-cases');
  for (const f of await readdir(appDir)) {
    if (!f.endsWith('.json')) continue;
    const c = JSON.parse(await readFile(resolve(appDir, f), 'utf-8'));
    if (nrmT(c.book?.title).includes(title) || title.includes(nrmT(c.book?.title))) {
      const rich = c.richMeta
        ? [(c.richMeta.toc || []).join('\n'), c.richMeta.bookIntro, c.richMeta.inBook].filter((s) => s && s.trim())
        : [];
      // 서버(index.js)와 같은 짧은 별칭 id
      return { title: nrmT(c.book.title), rich, memos: c.book.memos.map((m, i) => ({
        id: `m${i + 1}`, text: m.text, page: m.p ?? null,
        thoughts: m.myThought ? [m.myThought] : [],
      })) };
    }
  }
  throw new Error(`app-cases 에서 케이스를 못 찾음: ${title}`);
}

const TIGHTEN = `

## 출력 전 준비 (JSON 바로 앞에, 각 한 줄)
정리에 앞서 다음을 먼저 써라 — 이것이 모티프 이름의 재료다:
1. 이 책의 일반적 해석에서 반복되는 심상·주제 축 3~6개 (이 책을 모르면 "모름" 한 줄)
2. 메모들을 관통하는 심상 후보 3~6개 — 메모에 실제 등장하는 표현으로
그 다음 JSON 을 출력하라. 이름 최종 점검 — 각 모티프 이름이 ① 이 책 고유의 심상·표현인가 ② 어느 책에나 붙는 일반명사가 아닌가 ③ 대시·콜론·기호 없는 자연어구 하나인가. 하나라도 어긋나면 그 이름을 다시 지어라.`;

// 0901 B 채택 후: 조이기(출력 전 준비)는 서버 buildLitPrompt 로 들어갔다 —
// tighten:true 는 그 위에 또 얹는 중복이니 채택안 검증은 tighten:false 로 돈다.
const VARIANTS = [
  { key: 'low500-서버준비-1', think: 500, tighten: false },
  { key: 'low500-서버준비-2', think: 500, tighten: false },
];

const kase = await loadCase();
console.log(`케이스: ${kase.title} — 메모 ${kase.memos.length}건`);
const basePrompt = buildLitPrompt(kase.title, kase.rich, kase.memos);

const results = [];
for (const v of VARIANTS) {
  let usage = null;
  const llm = claudeCliTransport({
    model: 'claude-sonnet-5', timeoutMs: 480000,
    maxThinkingTokens: v.think, onUsage: (u) => { usage = u; },
  });
  const prompt = v.tighten ? basePrompt + TIGHTEN : basePrompt;
  let parsed = null, error = null, anchors = '';
  try {
    const raw = await llm({ user: prompt });
    // 조이기 변형은 JSON 앞에 준비 줄이 붙는다 — 앵커도 함께 보존
    const j = raw.indexOf('{');
    anchors = j > 0 ? raw.slice(0, j).trim() : '';
    const txt = (raw.match(/\{[\s\S]*\}/) || ['{}'])[0];
    try { parsed = JSON.parse(txt); } catch {
      const i = txt.indexOf('{"thesis"');
      parsed = i >= 0 ? JSON.parse(txt.slice(i)) : null;
    }
  } catch (e) { error = e.message.slice(0, 150); }
  const motifs = (parsed?.tree || []).map((x) => ({ name: x.title, gloss: (x.gloss || '').slice(0, 60) }));
  results.push({ variant: v.key, think: v.think, tighten: v.tighten, usage, error, anchors, motifs });
  console.log(`\n[${v.key}] out ${usage?.outputTokens ?? '?'}tok${error ? ` · 실패 ${error}` : ''}`);
  for (const m of motifs) console.log(`  - ${m.name}`);
}

const out = { label: `lit-effort-ab-${label}`, runAt: new Date().toISOString(), book: kase.title, nMemos: kase.memos.length, results };
await writeFile(resolve(__dir, `runs/${out.label}.json`), JSON.stringify(out, null, 2));
console.log(`\n→ runs/${out.label}.json`);
