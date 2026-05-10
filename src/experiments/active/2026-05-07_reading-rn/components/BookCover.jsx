// 표지 이미지 — letslook(고화질 실물사진) 우선, 404나 누락이면 cover500으로 폴백.
// 둘 다 없으면 placeholder 색상.
import React, { useState } from 'react';
import { View, Image } from 'react-native';

export const BookCover = ({ book, w, h, radius = 4, placeholderColor = '#eee', style, resizeMode = 'cover' }) => {
  const candidates = [book?.coverHi, book?.cover].filter(Boolean);
  const [idx, setIdx] = useState(0);
  const src = candidates[idx];
  const sizeStyle = (w != null || h != null)
    ? { width: w, height: h }
    : { width: '100%', height: '100%' };
  return (
    <View dataSet={{ rn: 'BookCover' }} style={[sizeStyle, { borderRadius: radius, overflow: 'hidden', backgroundColor: placeholderColor }, style]}>
      {src ? (
        <Image
          source={{ uri: src }}
          resizeMode={resizeMode}
          onError={() => { if (idx < candidates.length - 1) setIdx(idx + 1); }}
          style={{ width: '100%', height: '100%' }}
        />
      ) : null}
    </View>
  );
};
