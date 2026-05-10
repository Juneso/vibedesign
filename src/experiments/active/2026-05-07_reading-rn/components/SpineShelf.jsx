// "내 서재 — 척추 뷰" — 책들이 진열대 위에 누워 떠 있는 느낌의 3D 리스트.
// 부모 ScrollView의 scrollY를 Animated.Value로 받아 각 BookSpine에 전달.
import React, { useRef, useState } from 'react';
import { Animated, View, Text, useWindowDimensions } from 'react-native';
import { Inspectable } from './Inspectable.jsx';
import { BookSpine } from './BookSpine.jsx';

// 도트와 작은 텍스트로 헤더 분위기만 잡음 — 디자인 자유롭게 변경 가능
export const SpineShelf = ({ books, onPickBook }) => {
  const scrollY = useRef(new Animated.Value(0)).current;
  const [vh, setVh] = useState(640);

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true },
  );

  return (
    <Inspectable name="SpineShelf" style={{ flex: 1, backgroundColor: '#0E0E10' }}>
      {/* 진열대 배경 — 위/아래로 살짝 어두운 비네팅 */}
      <View pointerEvents="none" style={{
        position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
        backgroundImage: 'radial-gradient(80% 50% at 50% 50%, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0) 60%)',
      }} />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={(e) => setVh(e.nativeEvent.layout.height || 640)}
        contentContainerStyle={{ paddingTop: 28, paddingBottom: 96 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: 22, paddingBottom: 20 }} dataSet={{ rn: 'SpineHeader' }}>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.4, textTransform: 'uppercase' }}>My Shelf</Text>
          <Text style={{ fontSize: 28, color: 'rgba(255,255,255,0.92)', fontWeight: '700', marginTop: 4, letterSpacing: -0.4 }}>척추로 보는 서재</Text>
          <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>스크롤하면 책들이 빛 아래에서 회전합니다.</Text>
        </View>

        {books.map((b, i) => (
          <BookSpine key={b.id} book={b} index={i} scrollY={scrollY} viewportH={vh} onPress={onPickBook} />
        ))}
      </Animated.ScrollView>
    </Inspectable>
  );
};
