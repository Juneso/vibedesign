const fs = require('fs');
const file = 'public/assets/lottie_ai_chevron_down_dark.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

// 탐색 함수: "ty": "fl" 객체를 찾아 색상을 #66CCBE로 고정
function fixColors(obj) {
  if (Array.isArray(obj)) {
    obj.forEach(fixColors);
  } else if (obj !== null && typeof obj === 'object') {
    if (obj.ty === 'fl' && obj.c && obj.c.k) {
      if (Array.isArray(obj.c.k) && obj.c.k.length >= 3) {
        // 색상을 명시적으로 변경: [0.4, 0.8, 0.745, 1]
        obj.c.k[0] = 0.4;
        obj.c.k[1] = 0.8;
        obj.c.k[2] = 0.745098;
        if (obj.c.k.length === 4) obj.c.k[3] = 1;
        console.log('Fixed a fill color!');
      }
    }
    Object.values(obj).forEach(fixColors);
  }
}

fixColors(data);
fs.writeFileSync(file, JSON.stringify(data, null, 4));
console.log('All down_dark colors fully synced to Green!');
