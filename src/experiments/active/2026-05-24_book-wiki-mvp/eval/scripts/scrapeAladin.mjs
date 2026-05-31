// DES-178 보강 · 알라딘 상품 페이지 Playwright 스크레이퍼.
// 알라딘 OpenAPI 가 toc/책소개/책속에서/추천글/저자소개/출판사 제공 텍스트를 반환하지 않아,
// 비프리미엄 계정으로 진행할 동안의 임시 보완책. (정식 출시 시 알라딘 프리미엄으로 교체)
//
// 사용: node eval/scripts/scrapeAladin.mjs <ItemId> [outPath]
// 예:  node eval/scripts/scrapeAladin.mjs 16497150
//
// 알라딘은 각 섹션을 .Ere_prod_mconts_box 로 렌더링하며 스크롤 시 lazy 로드.

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const HEADERS = ['책소개', '목차', '책속에서', '추천글', '저자 소개', '출판사 제공 책소개'];

async function scrape(itemId) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });
  const page = await ctx.newPage();
  const url = `https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=${itemId}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 페이지 전체를 천천히 스크롤해서 lazy 컨텐츠 트리거
  await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const total = document.body.scrollHeight;
    const step = 500;
    for (let y = 0; y < total + step; y += step) {
      window.scrollTo(0, y);
      await sleep(220);
    }
  });
  await page.waitForTimeout(2500);

  // "더보기" 버튼 모두 클릭해서 본문 펼치기
  await page.evaluate(() => {
    document.querySelectorAll('a, button, span').forEach(el => {
      const t = (el.innerText || '').trim();
      if (t === '더보기' || t === '펼쳐보기' || t === '본문 보기') {
        try { el.click(); } catch {}
      }
    });
  });
  await page.waitForTimeout(800);

  const result = await page.evaluate((headers) => {
    const boxes = Array.from(document.querySelectorAll('.Ere_prod_mconts_box'));
    const sections = {};
    for (const box of boxes) {
      const text = (box.innerText || '').trim();
      if (!text) continue;
      for (const h of headers) {
        // 헤더가 박스 첫 줄(또는 첫 30자) 안에 있으면 해당 섹션으로 간주
        const head = text.slice(0, 30);
        if (head.startsWith(h) || head.startsWith(`${h}\n`)) {
          // 헤더 줄 제거 + 끝의 "더보기" 제거
          let body = text.slice(h.length).trim();
          body = body.replace(/더보기\s*$/, '').trim();
          sections[h] = body;
          break;
        }
      }
    }

    const isbnMatch = document.body.innerHTML.match(/id="(\d{10})_/);
    const isbn = isbnMatch ? isbnMatch[1] : null;

    const tocImages = Array.from(document.querySelectorAll('img'))
      .map(i => i.src)
      .filter(s => isbn && s.includes(`${isbn}_toc`))
      .map(s => s.startsWith('//') ? `https:${s}` : s);

    return { isbn, sections, tocImages };
  }, HEADERS);

  await browser.close();
  return { itemId, url, ...result };
}

const [, , itemId, outPath] = process.argv;
if (!itemId) {
  console.error('usage: node scrapeAladin.mjs <ItemId> [outPath]');
  process.exit(1);
}

const data = await scrape(itemId);
const out = outPath || `./eval/golden/aladin/${data.isbn || itemId}.json`;
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(data, null, 2), 'utf-8');

console.log(`✓ saved ${out}`);
console.log(`  isbn: ${data.isbn}`);
for (const h of HEADERS) {
  const v = data.sections[h];
  console.log(`  ${h}: ${v ? v.length + ' chars' : '(none)'}`);
}
console.log(`  tocImages: ${data.tocImages.length}`);
