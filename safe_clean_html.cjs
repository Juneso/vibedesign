const fs = require('fs');

// 1. index.html 정밀 정리
function cleanHTML() {
  const html = fs.readFileSync('index.html', 'utf8');

  // 추출할 페이지들의 정확한 HTML 덩어리를 정규식으로 찾습니다.
  // <!-- Page: ... --> 부터 </section> 까지를 하나의 블록으로 인식
  const blockRegex = /<!-- Page: [^>]+-->([\s\S]*?)<\/section>/g;
  
  let match;
  let keepBlocks = [];
  
  while ((match = blockRegex.exec(html)) !== null) {
    const blockContent = match[0];
    if (blockContent.includes('data-page="ai-recent-gradient-adjust"') || blockContent.includes('data-page="toast-entrance-custom"')) {
      keepBlocks.push(blockContent);
    }
  }

  // <div id="pages-container"> 내부를 찾아낸 2개의 핵심 블록으로만 교체
  const pagesContainerRegex = /(<div id="pages-container"[^>]*>)([\s\S]*?)(<\/div>\s*<!-- Mobile Floating Nav -->)/;
  
  const optimizedHTML = html.replace(pagesContainerRegex, (match, openTag, content, closeTag) => {
    return `${openTag}\n${keepBlocks.join('\n\n')}\n${closeTag}`;
  });

  // 메뉴판에서도 안쓰는 항목 제거 (주석처리된 일반 버전 및 타 메뉴)
  const finalHTML = optimizedHTML
    .replace(/<!-- <a href="#" class="lab-nav-item" data-page="toast-entrance">[\s\S]*?<\/a> -->\n/g, '')
    .replace(/<!-- <a href="#" class="lab-nav-item" data-page="ai-call-log-entrance">[\s\S]*?<\/a> -->\n/g, '')
    .replace(/<!-- <a href="#" class="lab-nav-item" data-page="ai-call-log-entrance-custom">[\s\S]*?<\/a> -->\n/g, '')
    .replace(/<a href="#" class="lab-nav-item" data-page="ai-call-log-entrance-custom">[\s\S]*?<\/a>\n/g, '')
    .replace(/<!-- <li data-page="toast-entrance">토스트 등장<\/li> -->\n/g, '')
    .replace(/<!-- <li data-page="ai-call-log-entrance">통화 종료 후 토스트<\/li> -->\n/g, '')
    .replace(/<li data-page="ai-call-log-entrance-custom">통화 종료 후 토스트 \(커스텀 섀도우\)<\/li>\n/g, '');

  fs.writeFileSync('index.html', finalHTML);
  console.log('index.html 정밀 정리 성공!');
}

cleanHTML();
