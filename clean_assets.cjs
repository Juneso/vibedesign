const fs = require('fs');

// 1. app.js 정리
function cleanAppJS() {
  let content = fs.readFileSync('app.js', 'utf8');
  
  // switchPage 내부의 안쓰는 조각들 정리
  content = content.replace(
    /targetPage === 'toast-entrance' \|\| targetPage === 'toast-entrance-custom' \|\| targetPage === 'ai-call-log-entrance' \|\| targetPage === 'ai-call-log-entrance-custom' \|\| targetPage === 'toast-entrance-2' \|\| targetPage === 'ai-call-log-entrance-2'/g,
    "targetPage === 'toast-entrance-custom'"
  );

  // setupDialer 삭제 정규식: ai-recent-gradient-adjust를 제외한 모든 setupDialer 호출을 삭제
  const lines = content.split('\n');
  let newLines = [];
  let skipMode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("setupDialer('section.lab-page[data-page=")) {
      if (line.includes('ai-recent-gradient-adjust')) {
        newLines.push('// === 1. 다이얼러 모션 (최종-상단 그라 조정) ===');
        newLines.push(line);
      } else {
        skipMode = true;
      }
    } else if (skipMode) {
      if (line === '});' || line === '})') {
        skipMode = false;
      }
    } else {
      newLines.push(line);
    }
  }

  fs.writeFileSync('app.js', newLines.join('\n'));
  console.log('app.js cleanup complete.');
}

// 2. styles.css 정리 (복잡한 중첩 괄호를 피해 안전하게 슬라이싱)
function cleanCSS() {
  let content = fs.readFileSync('styles.css', 'utf8');
  const lines = content.split('\n');
  let newLines = [];
  let inGarbagePage = false;
  let bracketCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inGarbagePage && line.match(/^\.page-(?!ai-recent-gradient-adjust|toast-entrance-custom)[a-zA-Z0-9-]+ /)) {
      inGarbagePage = true;
      bracketCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      continue;
    }

    if (inGarbagePage) {
      bracketCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      if (bracketCount <= 0) {
        inGarbagePage = false;
      }
      continue;
    }

    newLines.push(line);
  }

  // 한번 더 중복해서 불필요한 빈 줄을 제거
  const finalCss = newLines.join('\n').replace(/\n\s*\n\s*\n/g, '\n\n');
  fs.writeFileSync('styles.css', finalCss);
  console.log('styles.css cleanup complete.');
}

cleanAppJS();
cleanCSS();
