const fs = require('fs');

function cleanHTML() {
  const content = fs.readFileSync('index.html', 'utf8');
  const lines = content.split('\n');

  let inPagesContainer = false;
  let keepBlock = false;
  let newLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Delete unused menu items
    if (line.includes('data-page="ai-call-log-entrance-custom"') || line.includes('<span>통화 종료 후 토스트 (커스텀 섀도우)</span>')) {
      continue;
    }
    if (line.includes('data-page="ai-call-log-entrance-custom"') || line.includes('통화 종료 후 토스트 (커스텀 섀도우)</li>')) {
      continue;
    }

    // Identify the pages-container
    if (line.includes('<div id="pages-container"')) {
      newLines.push(line);
      inPagesContainer = true;
      continue;
    }

    if (inPagesContainer) {
      if (line.includes('<!-- Page:')) {
        if (line.includes('토스트 등장 (커스텀 섀도우)') || line.includes('상단 그라 조정')) {
          keepBlock = true;
        } else {
          keepBlock = false;
        }
      }
      
      if (line.includes('</div> <!-- End of Pages Container -->') || line.includes('<!-- Mobile Floating Nav -->')) {
        inPagesContainer = false;
        newLines.push('      </div>');
        newLines.push(line);
        continue;
      }
      
      if (keepBlock) {
        newLines.push(line);
      }
    } else {
      newLines.push(line);
    }
  }

  fs.writeFileSync('index.html', newLines.join('\n'));
  console.log('index.html cleanup complete.');
}

cleanHTML();
