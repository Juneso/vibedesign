const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

// 1. 파일 읽기
const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;

// 2. Pages Container 내에서 2가지 뷰만 남기고 안 쓰는 섹션 완전히 삭제
const container = document.getElementById('pages-container');
if (container) {
  const sections = Array.from(container.children).filter(el => el.tagName.toLowerCase() === 'section');
  sections.forEach(sec => {
    const pageObj = sec.getAttribute('data-page');
    if (pageObj !== 'ai-recent-gradient-adjust' && pageObj !== 'toast-entrance-custom') {
      sec.remove();
    }
  });
}

// 3. 네비게이션(사이드바/모바일) 메뉴도 사용하지 않는 것들은 깔끔하게 다 날리기
document.querySelectorAll('a.lab-nav-item').forEach(a => {
  const pageObj = a.getAttribute('data-page');
  if (pageObj !== 'ai-recent-gradient-adjust' && pageObj !== 'toast-entrance-custom') {
    a.remove();
  }
});

document.querySelectorAll('li[data-page]').forEach(li => {
  const pageObj = li.getAttribute('data-page');
  if (pageObj !== 'ai-recent-gradient-adjust' && pageObj !== 'toast-entrance-custom') {
    li.remove();
  }
});

// 4. 저장 (JSDOM은 깨진 태그 문법도 자동으로 고쳐서 출력해 줍니다!)
fs.writeFileSync('index.html', dom.serialize());
console.log('JSDOM 기반 index.html 완벽 정리 완료!');
