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

  // 페이지 전체를 천천히 스크롤해서 lazy 컨텐츠 트리거.
  // ⚠ scrollHeight 를 시작 시점에 한 번만 재면, 본문이 아직 안 펼쳐진 페이지는 초기 높이가
  //   짧아 몇 번 스크롤하고 즉시 끝나버린다(= lazy 로드가 트리거되지 않음). 매 스텝마다 다시
  //   재고, 높이가 더 이상 자라지 않을 때까지 내려간다.
  // scrollTo(0, y) 로 같은 좌표를 반복 지정하면 스크롤 이벤트가 발생하지 않아 lazy 로더가
  // 깨어나지 않는다. 페이지가 자라는 동안 계속 델타를 만들어내는 scrollBy 반복이 확실하다.
  // (섹션 10개 로드되는 것 실측 확인)
  await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) {
      window.scrollBy(0, 700);
      await sleep(250);
    }
  });
  // 본문 섹션이 실제로 붙을 때까지 대기 (없으면 그대로 진행)
  await page.waitForFunction(() => document.querySelectorAll('.Ere_prod_mconts_box').length >= 3, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // "더보기" 버튼 모두 클릭해서 본문 펼치기.
  // ⚠ 실제 href 를 가진 <a>("구판 보기" 등)를 클릭하면 페이지가 이동해 실행 컨텍스트가
  //   파괴된다 — 인플레이스로 펼치는 요소(버튼/스팬, href 없는 앵커)만 클릭한다.
  await page.evaluate(() => {
    const inPlace = (el) => {
      if (el.tagName !== 'A') return true;
      const href = el.getAttribute('href') || '';
      return href === '' || href === '#' || href.startsWith('javascript:');
    };
    document.querySelectorAll('a, button, span').forEach(el => {
      const t = (el.innerText || '').trim();
      if ((t === '더보기' || t === '펼쳐보기' || t === '본문 보기') && inPlace(el)) {
        try { el.click(); } catch {}
      }
    });
  }).catch(() => {});
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
