// 문학 9권 알라딘 리치데이터 수집 — BKT-235 방식(Playwright 우회, OpenAPI 키 불필요).
// 검색 페이지에서 ItemId 를 찾고, scrapeAladin.mjs 와 같은 방식으로 상품 페이지를 긁어
// golden/aladin/{isbn}.json 박제 + golden/aladin-lit-meta.json 갱신까지 한 번에.
// LLM 호출 없음 — API 비용 0.
//
// 사용: node eval/scripts/scrapeLitBooks.mjs   (이미 수집된 책은 건너뜀)
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const GOLDEN = resolve(__dir, '../golden');
const META_OUT = resolve(GOLDEN, 'aladin-lit-meta.json');
const N = (s) => String(s || '').normalize('NFC');

// [데이터셋 제목, 검색 보조어(판본 구분), 이미 아는 ItemId(조르바=BKT-235 박제)]
const BOOKS = [
  ['그리스인 조르바', '카잔차키스', '6037971'],
  ['데미안', '헤르만 헤세 민음사', null],
  ['모순', '양귀자', null],
  ['1984', '조지 오웰 민음사', null],
  ['죄와 벌', '도스토예프스키', null],
  ['백년의 고독', '마르케스', null],
  ['호밀밭의 파수꾼', '샐린저', null],
  ['젊은 베르테르의 슬픔', '괴테', null],
  ['엄마를 부탁해', '신경숙', null],
  ['무의미의 축제', '밀란 쿤데라', null],
];
const HEADERS = ['책소개', '목차', '책속에서', '추천글', '저자 소개', '출판사 제공 책소개'];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  locale: 'ko-KR',
});
const page = await ctx.newPage();

async function findItemId(title, hint) {
  const q = encodeURIComponent(`${title} ${hint}`.trim());
  await page.goto(`https://www.aladin.co.kr/search/wsearchresult.aspx?SearchTarget=Book&SearchWord=${q}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1200);
  const cands = await page.evaluate(() => Array.from(document.querySelectorAll('a.bo3'))
    .map((a) => ({ id: (a.href.match(/ItemId=(\d+)/) || [])[1], title: a.innerText.trim() }))
    .filter((x) => x.id));
  // 제목이 실제로 포함된 첫 결과(검색 순위 = 알라딘 관련도)
  const hit = cands.find((c) => N(c.title).replace(/\s+/g, '').includes(N(title).replace(/\s+/g, ''))) || cands[0];
  return hit ? { ...hit, cands: cands.slice(0, 3) } : null;
}

// scrapeAladin.mjs 와 동일한 상품 페이지 추출 (스크롤 → lazy 로드 → 섹션 텍스트)
async function scrapeProduct(itemId) {
  await page.goto(`https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=${itemId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) { window.scrollBy(0, 700); await sleep(250); }
  });
  await page.waitForFunction(() => document.querySelectorAll('.Ere_prod_mconts_box').length >= 3, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const inPlace = (el) => el.tagName !== 'A' || ['', '#'].includes(el.getAttribute('href') || '') || (el.getAttribute('href') || '').startsWith('javascript:');
    document.querySelectorAll('a, button, span').forEach((el) => {
      const t = (el.innerText || '').trim();
      if ((t === '더보기' || t === '펼쳐보기' || t === '본문 보기') && inPlace(el)) { try { el.click(); } catch {} }
    });
  }).catch(() => {});
  await page.waitForTimeout(800);
  const r = await page.evaluate((headers) => {
    const sections = {};
    for (const box of document.querySelectorAll('.Ere_prod_mconts_box')) {
      const text = (box.innerText || '').trim();
      if (!text) continue;
      for (const h of headers) {
        if (text.slice(0, 30).startsWith(h)) {
          sections[h] = text.slice(h.length).trim().replace(/더보기\s*$/, '').trim();
          break;
        }
      }
    }
    const isbnMatch = document.body.innerHTML.match(/id="(\d{10,13})_/);
    const author = (document.querySelector('.Ere_sub2_title a')?.innerText || '').trim();
    const pageTitle = (document.querySelector('.Ere_bo_title')?.innerText || '').trim();
    return { isbn: isbnMatch ? isbnMatch[1] : null, sections, author, pageTitle };
  }, HEADERS);
  return { itemId, ...r };
}

const meta = existsSync(META_OUT) ? JSON.parse(await readFile(META_OUT, 'utf-8')) : {};
await mkdir(resolve(GOLDEN, 'aladin'), { recursive: true });

for (const [title, hint, knownId] of BOOKS) {
  if (meta[title]?.aladin?.intro) { console.log(`  ↷ ${title} (이미 있음)`); continue; }
  try {
    let itemId = knownId, foundTitle = '';
    if (!itemId) {
      const hit = await findItemId(title, hint);
      if (!hit) { console.log(`  ✗ ${title} — 검색 실패`); continue; }
      itemId = hit.id; foundTitle = hit.title;
    }
    const d = await scrapeProduct(itemId);
    const raw = { itemId, url: `https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=${itemId}`, isbn: d.isbn, sections: d.sections, tocImages: [] };
    await writeFile(resolve(GOLDEN, `aladin/${d.isbn || itemId}.json`), JSON.stringify(raw, null, 2), 'utf-8');
    const s = d.sections;
    meta[title] = {
      title: N(title), matchedTitle: N(d.pageTitle || foundTitle), itemId, isbn: d.isbn,
      author: d.author, category: '소설',
      toc: (s['목차'] || '').split('\n').map((x) => x.trim()).filter(Boolean),
      summary: '',
      aladin: {
        intro: s['책소개'] || '',
        publisherIntro: s['출판사 제공 책소개'] || '',
        excerpts: s['책속에서'] || '',
        recommend: s['추천글'] || '',
      },
    };
    const a = meta[title].aladin;
    console.log(`  ✓ ${title} — ${meta[title].matchedTitle.slice(0, 30)} · 소개 ${a.intro.length}자 · 출판사 ${a.publisherIntro.length}자 · 책속에서 ${a.excerpts.length}자 · 목차 ${meta[title].toc.length}줄`);
    await page.waitForTimeout(1500); // 예의상 간격
  } catch (e) {
    console.log(`  ✗ ${title} — ${e.message}`);
  }
}
await browser.close();
await writeFile(META_OUT, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
console.log(`\n→ ${META_OUT} (${Object.keys(meta).length}권)`);
