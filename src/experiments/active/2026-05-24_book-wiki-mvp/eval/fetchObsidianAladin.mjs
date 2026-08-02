// 옵시디언 선정 책들의 알라딘 리치데이터 수집 → golden/obsidian-books-meta.json
//
// V8 테마 앵커는 책 맥락(책소개·출판사서평·책속에서·목차)을 ground truth 로 쓴다.
// 비어 있으면 테마가 reader 축에만 의존해 성기게 묶인다 → 그래서 먼저 채운다.
//
// ⚠ 알라딘 OpenAPI 는 Toc/Story/fullDescription 을 비프리미엄 키에 주지 않는다(빈 값 확인).
//   그래서 검색(제목→ItemId)만 API 로 하고, 본문은 기존 Playwright 스크레이퍼로 긁는다.
//   scripts/scrapeAladin.mjs 는 수정하지 않고 권별로 실행해 결과를 취합한다.
//
// 사용: node eval/fetchObsidianAladin.mjs           (상위 10권)
//        LIMIT=50 node eval/fetchObsidianAladin.mjs
//        FORCE=1 node eval/fetchObsidianAladin.mjs  (캐시 무시)
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadDotEnvLocal } from './lib/transport.mjs';

const execFileP = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);
const KEY = process.env.ALADIN_TTB_KEY;
if (!KEY) { console.error('ALADIN_TTB_KEY 없음 (.env.local)'); process.exit(1); }

const LIMIT = Number(process.env.LIMIT || 10);
const FORCE = !!process.env.FORCE;
const OUT = resolve(__dir, 'golden/obsidian-books-meta.json');
const SCRAPER = resolve(__dir, 'scripts/scrapeAladin.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const clean = (s) => String(s || '').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').trim();

// 제목 검색으로는 판본을 특정할 수 없는 책 — ItemId 직접 고정.
// 서양미술사: 동명의 국내 교재(김미정·이은기)가 먼저 잡히나 실제 노트는 곰브리치판.
const ITEM_ID_OVERRIDE = {
  'obs-9-서양미술사': '75760', // E.H. 곰브리치 『서양미술사』 (예경)
};

// 제목 유사도 — 공백·기호 제거 후 포함관계/자카드
const norm = (s) => String(s || '').toLowerCase().replace(/[\s,·:;\-—()[\]'"’”“]/g, '');
function similarity(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;
  const sx = new Set(x), sy = new Set(y);
  const inter = [...sx].filter((c) => sy.has(c)).length;
  return inter / new Set([...sx, ...sy]).size;
}

async function aladinLookup(id, idType = 'ISBN13') {
  const url = `http://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${KEY}&itemIdType=${idType}&ItemId=${encodeURIComponent(id)}&output=js&Version=20131101`;
  const r = await fetch(url);
  const t = await r.text();
  return JSON.parse(t.trim().replace(/;$/, ''));
}

async function aladinSearch(title) {
  const url = `http://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${KEY}&Query=${encodeURIComponent(title)}&QueryType=Title&MaxResults=10&SearchTarget=Book&output=js&Version=20131101`;
  const r = await fetch(url);
  const t = await r.text();
  return JSON.parse(t.trim().replace(/;$/, ''));
}

// 목차 텍스트 → 장 제목 배열
function parseToc(text) {
  return clean(text)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && l.length > 1 && l.length < 100)
    .slice(0, 40);
}

const BOOKS = JSON.parse(await readFile(resolve(__dir, 'obsidian-50-list.json'), 'utf-8')).slice(0, LIMIT);
const out = (!FORCE && existsSync(OUT)) ? JSON.parse(await readFile(OUT, 'utf-8')) : {};

for (const b of BOOKS) {
  if (!FORCE && out[b.id]?.aladin?.intro) { console.log(`  ${b.title} — 스킵(캐시됨)`); continue; }
  try {
    // 1) ItemId 확정 — 고정값이 있으면 그걸 쓰고, 없으면 제목 검색 (API 로 되는 부분)
    let best;
    let candidatePool = []; // 유사도 순 후보 판본들 (본문 없는 판본을 만나면 다음 것으로 넘어간다)
    const override = ITEM_ID_OVERRIDE[b.id];
    if (override) {
      const d = await aladinLookup(override, 'ItemId');
      const it = (d.item || [])[0];
      if (!it) { console.log(`  ⚠ ${b.title} — 고정 ItemId ${override} 조회 실패`); continue; }
      best = { it, score: 1 };
    } else {
      const s = await aladinSearch(b.title);
      const items = s.item || [];
      if (!items.length) { console.log(`  ⚠ ${b.title} — 검색 결과 없음`); continue; }
      candidatePool = items.map((it) => ({ it, score: similarity(b.title, it.title.replace(/\s*-\s*.*$/, '')) }))
        .sort((x, y) => y.score - x.score);
      best = candidatePool[0];
    }
    // 2) 상품 페이지 스크레이핑.
    // ⚠ 판본에 따라 책소개·목차·책속에서가 아예 없는 페이지가 있다(예: 호모 루덴스 개정판 —
    //   "구판 종이책 보기"만 있고 본문 섹션 0개). 그래서 후보 판본을 유사도 순으로 훑어
    //   내용이 있는 판본을 만나면 채택한다.
    const useful = (s) => (s['책소개'] || s['목차'] || s['책속에서'] || s['출판사 제공 책소개'] || '').length > 0;
    let sc = null, sec = {}, itemId = best.it.itemId, isbn = best.it.isbn13 || best.it.isbn;
    let chosenTitle = best.it.title;

    // ⚠ 폴백 후보는 "같은 책의 다른 판본"이어야 한다. 제목만 비슷한 딴 책(예: "호모 루덴스,
    //   놀이하는 인간을 꿈꾸다")을 채택하면 엉뚱한 책의 리치데이터가 주입된다 — 리치데이터가
    //   없는 것보다 나쁘다. 그래서 1순위 매치와 저자가 겹치는 후보만 남긴다.
    const authorKey = (s) => new Set(String(s || '').split(/[,()]/).map((t) => t.trim())
      .filter((t) => t && !['지은이', '옮긴이', '엮은이', '해제', '그림'].includes(t)));
    const baseAuthors = authorKey(best.it.author);
    const sameBook = (it) => [...authorKey(it.author)].some((a) => baseAuthors.has(a));

    const candidates = override
      ? [best.it]
      : (candidatePool.filter((c) => c.score >= 0.6 && sameBook(c.it)).slice(0, 2).map((c) => c.it));

    for (const cand of (candidates.length ? candidates : [best.it])) {
      const cid = cand.itemId;
      const cisbn = cand.isbn13 || cand.isbn;
      const scrapePath = resolve(__dir, `golden/aladin/${cisbn || cid}.json`);
      if (FORCE || !existsSync(scrapePath)) {
        // 스크래퍼는 lazy 로드 트리거용으로 페이지를 천천히 스크롤한다 — 권당 2~4분까지 걸린다
        await execFileP('node', [SCRAPER, String(cid), scrapePath], { cwd: resolve(__dir, '..'), timeout: 300000 });
      }
      const parsed = JSON.parse(await readFile(scrapePath, 'utf-8'));
      if (useful(parsed.sections || {})) {
        sc = parsed; sec = parsed.sections; itemId = cid; isbn = cisbn; chosenTitle = cand.title;
        break;
      }
      console.log(`      · "${cand.title.slice(0, 30)}" 판본엔 본문 섹션 없음 → 다음 판본 시도`);
      if (!sc) { sc = parsed; sec = parsed.sections || {}; itemId = cid; isbn = cisbn; }
    }

    out[b.id] = {
      matchedTitle: chosenTitle,
      matchScore: Number(best.score.toFixed(2)),
      itemId, isbn,
      title: b.title,
      author: clean(best.it.author),
      category: best.it.categoryName || '',
      publisher: best.it.publisher || '',
      summary: clean(sec['책소개'] || best.it.description).slice(0, 1500),
      toc: parseToc(sec['목차']),
      tocImages: sc.tocImages || [],
      // ⚠ OpenAPI 가 주기로 한(그러나 비프리미엄 키에 빈 값으로 오는) 필드만 사용한다.
      //   OptResult=Toc,Story,fullDescription 대응분만 채우고, 페이지에서 더 긁을 수 있는
      //   추천글·저자소개는 API 제공 항목이 아니므로 쓰지 않는다.
      aladin: {
        intro: clean(sec['책소개']),                    // ← fullDescription
        publisherIntro: clean(sec['출판사 제공 책소개']), // ← fullDescription2
        excerpts: clean(sec['책속에서']),                // ← Story
        recommend: '',                                   // API 미제공 항목 — 사용 안 함
      },
    };
    const o = out[b.id];
    const flag = best.score < 0.6 ? '⚠' : ' ';
    console.log(`  ${flag} ${b.title} → "${o.matchedTitle}" (${o.author}) score=${o.matchScore}`);
    console.log(`      책소개 ${o.aladin.intro.length}자 · 출판사 ${o.aladin.publisherIntro.length}자 · 책속에서 ${o.aladin.excerpts.length}자 · 추천글 ${o.aladin.recommend.length}자 · 목차 ${o.toc.length}줄 · 목차이미지 ${o.tocImages.length}`);
    await writeFile(OUT, JSON.stringify(out, null, 2) + '\n', 'utf-8');
    await sleep(500);
  } catch (e) {
    console.log(`  ✗ ${b.title} — ${e.message.slice(0, 160)}`);
  }
}
console.log(`\n✓ ${Object.keys(out).length}권 메타 저장 → golden/obsidian-books-meta.json`);
