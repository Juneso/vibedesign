// 웹용 react-native-svg 셰임 — DOM SVG 엘리먼트로 직접 렌더.
// 현재 사용처: NotesScreen 그래프 캔버스 (Svg + Line). 필요해지면 추가 export.
import React from 'react';

export const Svg = ({ width, height, style, children, ...rest }) => (
  <svg width={width} height={height} style={style} {...rest}>{children}</svg>
);

export const Line = ({ x1, y1, x2, y2, stroke, strokeOpacity, strokeWidth, ...rest }) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2}
    stroke={stroke} strokeOpacity={strokeOpacity} strokeWidth={strokeWidth} {...rest} />
);

export const G = (props) => <g {...props} />;
export const Path = (props) => <path {...props} />;
export const Rect = (props) => <rect {...props} />;
export const Circle = (props) => <circle {...props} />;

export default Svg;
