import React from 'react';
import { View } from 'react-native';

// RN-Web 컴포넌트에 data-rn 속성을 박아 인스펙터에서 의미있는 셀렉터(.rn-X)로 잡히게 한다.
// inspector-rn-adapter.js가 data-rn → className 미러링.
export const Inspectable = ({ name, style, children, as: As = View, ...rest }) => {
  return (
    <As
      {...rest}
      style={style}
      // RN-Web 표준: dataSet → DOM data-* 속성으로 변환
      dataSet={{ rn: name }}
    >
      {children}
    </As>
  );
};
