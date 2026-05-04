const fs = require('fs');
const files = [
  'public/assets/lottie_ai_chevron_down.json',
  'public/assets/lottie_ai_chevron_down_dark.json'
];

files.forEach(file => {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  
  // 루트 레이어(parent 속성이 없는 레이어)를 찾아서 중심점을 7,7로 맞추고 90도 회전
  data.layers.forEach(layer => {
    if (!layer.parent) {
      if (layer.ks) {
        // 기존 속성 유지하면서 k 값만 업데이트
        layer.ks.a = layer.ks.a || { a: 0, k: [0,0] };
        layer.ks.a.k = [7, 7];
        
        layer.ks.p = layer.ks.p || { a: 0, k: [0,0] };
        layer.ks.p.k = [7, 7];
        
        layer.ks.r = layer.ks.r || { a: 0, k: 0 };
        layer.ks.r.k = 90;
      }
    }
  });

  fs.writeFileSync(file, JSON.stringify(data, null, 4));
  console.log(`Fixed rotation for ${file}`);
});
