// 웹용 expo-linear-gradient 셰임 — react-native-web의 View에 CSS 그라디언트를 깔아 동등 렌더.
// 네이티브에선 expo-linear-gradient 본체가 그대로 쓰임 (Metro는 이 셰임을 보지 않음).
import React from 'react';
import { View } from 'react-native';

const toCss = ({ colors = [], locations, start, end }) => {
  // start/end는 0~1 좌표. 기본은 위→아래 (180deg).
  let angle = '180deg';
  if (start && end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    angle = `${Math.atan2(dx, -dy) * (180 / Math.PI)}deg`;
  }
  const stops = colors.map((c, i) => {
    const loc = locations?.[i];
    return loc != null ? `${c} ${(loc * 100).toFixed(2)}%` : c;
  }).join(', ');
  return `linear-gradient(${angle}, ${stops})`;
};

export const LinearGradient = React.forwardRef(({ colors, locations, start, end, style, children, ...rest }, ref) => {
  const bg = toCss({ colors, locations, start, end });
  return (
    <View ref={ref} {...rest} style={[{ backgroundImage: bg }, style]}>
      {children}
    </View>
  );
});

export default LinearGradient;
