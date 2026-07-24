// 문학 10권 알라딘 리치데이터 수집 → golden/aladin-lit-meta.json (BKT-380 / literature-v1)
// obsidian-books-meta.json 은 비문학 10권뿐이라, 문학 러너가 폴백으로 읽을 메타를 만든다.
// 사용: node eval/fetchLitMeta.mjs   (기존 파일이 있으면 있는 책은 건너뜀, FORCE=1 로 전체 재수집)
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dir, 'golden/aladin-lit-meta.json');
const N = (s) => String(s || '').normalize('NFC');

// .env.local 에서 TTB 키 (레포 루트)
const env = await readFile(resolve(__dir, '../../../../../.env.local'), 'utf-8');
const KEY = env.match(/^ALADIN_TTB_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) { console.error('ALADIN_TTB_KEY 없음'); process.exit(1); }

const TITLES = ['데미안', '모순', '그리스인 조르바', '1984', '죄와 벌', '백년의 고독', '호밀밭의 파수꾼', '젊은 베르테르의 슬픔', '엄마를 부탁해', '무의미의 축제'];

const strip = (h) => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/[ \t]+/g, ' ').trim();

async function api(url) {
  const r = await fetch(url);
  const t = await r.text();
  return JSON.parse(t.replace(/;$/, ''));
}

const out = existsSync(OUT) && !process.env.FORCE ? JSON.parse(await readFile(OUT, 'utf-8')) : {};
for (const title of TITLES) {
  if (out[title]?.aladin) { console.log(`  ↷ ${title} (이미 있음)`); continue; }
  try {
    const s = await api(`http://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${KEY}&Query=${encodeURIComponent(title)}&QueryType=Title&MaxResults=10&SearchTarget=Book&output=js&Version=20131101`);
    // 제목이 실제로 포함된 국내도서 중 판매지수 최고(대표 판본)를 고른다
    const cand = (s.item || []).filter((x) => N(x.title).includes(N(title)));
    const best = cand.sort((a, b) => (b.salesPoint || 0) - (a.salesPoint || 0))[0];
    if (!best?.isbn13) { console.log(`  ✗ ${title} — 검색 결과 없음`); continue; }
    const l = await api(`http://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${KEY}&itemIdType=ISBN13&ItemId=${best.isbn13}&output=js&Version=20131101&OptResult=Toc,Story,fulldescription`);
    const it = (l.item || [])[0] || {};
    const sub = it.subInfo || {};
    out[title] = {
      title: N(title), matchedTitle: N(it.title || best.title), isbn13: best.isbn13,
      author: it.author || best.author || '', category: it.categoryName || '',
      toc: strip(sub.toc).split('\n').map((x) => x.trim()).filter(Boolean),
      summary: strip(sub.story),                       // 소설은 줄거리(Story)가 핵심 배경 근거
      aladin: {
        intro: strip(it.description),
        publisherIntro: strip(sub.fullDescription2 || sub.fulldescription2 || it.fullDescription || ''),
      },
    };
    console.log(`  ✓ ${title} — ${out[title].matchedTitle} · 줄거리 ${out[title].summary.length}자 · 소개 ${out[title].aladin.intro.length}자 · 목차 ${out[title].toc.length}줄`);
  } catch (e) {
    console.log(`  ✗ ${title} — ${e.message}`);
  }
}
await writeFile(OUT, JSON.stringify(out, null, 2) + '\n', 'utf-8');
console.log(`\n→ ${OUT}`);
