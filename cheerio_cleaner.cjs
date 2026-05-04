const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('index.html', 'utf8');
const $ = cheerio.load(html, { decodeEntities: false });

let removedCount = 0;

// lab-viewport 안의 section 중 필요 없는 것 모두 삭제
$('main.lab-viewport > section.lab-page').each(function() {
  const page = $(this).attr('data-page');
  if (page !== 'toast-entrance-custom' && page !== 'ai-recent-gradient-adjust') {
    $(this).remove();
    removedCount++;
  }
});

// 네비게이션 메뉴 중 쓰지 않는 것 삭제
$('a.lab-nav-item').each(function() {
  const page = $(this).attr('data-page');
  if (page !== 'toast-entrance-custom' && page !== 'ai-recent-gradient-adjust') {
    $(this).remove();
  }
});

$('li[data-page]').each(function() {
  const page = $(this).attr('data-page');
  if (page !== 'toast-entrance-custom' && page !== 'ai-recent-gradient-adjust') {
    $(this).remove();
  }
});

fs.writeFileSync('index.html', $.html());
console.log(`🚀 Cheerio DOM 정리 완료: 총 ${removedCount}개의 불필요한 페이지 섹션 완전 삭제됨!`);
