// 책의 책등 — perspective vanishing point가 화면 위쪽에 있는 듯한 시점.
// rotateX는 "이 책의 화면 Y 위치"에 따라 가변: 상단(가까운 vanishing point) → 큰 각, 하단 → 작은 각.
// RN-호환: shadow*/elevation, expo-linear-gradient, <Image>로 텍스처 깔기. CSS-only(filter/mixBlendMode/backgroundImage) 사용 X.
import React, { useState } from 'react';
import { Animated, View, Image, Pressable, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NORMAL_MAP_SOURCE } from './book-assets';

const PALETTE = ['#D9CFAE', '#2A3848', '#5A5E62', '#5C1B33', '#1E2A24', '#3D2A1E'];
const pickColor = (id) => {
  let h = 0; for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

// 책 한 권이 차지하는 컨테이너 세로 두께 (책장 한 칸의 시각 두께)
const SLAB_BOX_H = 64;

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export const BookSpine = ({ book, index, scrollY, viewportH, onPress }) => {
  const [layoutY, setLayoutY] = useState(index * SLAB_BOX_H);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e) => setLayoutY(e.nativeEvent.layout.y);
  const onSlabLayout = (e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const fallbackColor = book.spineColor || book.coverColor || pickColor(book.id);
  // letslook(고화질 실물사진) → cover500 폴백 체인
  const coverCandidates = [book.coverHi, book.cover].filter(Boolean);
  const [coverIdx, setCoverIdx] = useState(0);
  const coverUrl = coverCandidates[coverIdx] || '';

  // 화면 Y 위치 — 0이면 viewport 상단, viewportH면 하단.
  const screenY = Animated.subtract(
    new Animated.Value(layoutY + SLAB_BOX_H / 2),
    scrollY,
  );

  // 위쪽 = 거의 edge-on(얇은 strip), 아래쪽 = 표지가 거의 다 보임. 강한 vanishing point.
  const rotateX = screenY.interpolate({
    inputRange: [-SLAB_BOX_H, 0, viewportH * 0.4, viewportH * 0.75, viewportH, viewportH + SLAB_BOX_H],
    outputRange: ['86deg', '82deg', '60deg', '32deg', '14deg', '8deg'],
    extrapolate: 'clamp',
  });

  // 위쪽일수록 어둡게(멀리 있는 인상), 아래쪽은 밝게
  const lightOpacity = screenY.interpolate({
    inputRange: [0, viewportH],
    outputRange: [0.35, 0.95],
    extrapolate: 'clamp',
  });

  // 위쪽일수록 살짝 어둡게 깔리는 안개 — 멀리 있는 듯
  const fogOpacity = screenY.interpolate({
    inputRange: [0, viewportH * 0.5, viewportH],
    outputRange: [0.55, 0.18, 0],
    extrapolate: 'clamp',
  });

  return (
    <View onLayout={onLayout}
      style={{ height: SLAB_BOX_H, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}
    >
      <View style={{ position: 'absolute', width: '94%' }} dataSet={{ rn: 'BookSpineWrap' }}>
        <Pressable onPress={() => onPress?.(book)} dataSet={{ rn: 'BookSpine' }}>
          <Animated.View
            onLayout={onSlabLayout}
            style={{
              // 슬라브 = 길고 얇은 strip (4:1 landscape)
              aspectRatio: 4 / 1,
              transform: [
                { perspective: 1600 },
                { rotateX },
              ],
              transformOrigin: '50% 50%',
              backgroundColor: fallbackColor,
              borderRadius: 2,
              overflow: 'hidden',
              // RN shadow (iOS) — 멀티레이어 boxShadow 단순화
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 18 },
              shadowOpacity: 0.5,
              shadowRadius: 28,
              // Android
              elevation: 12,
            }}>
            {/* 표지 이미지 — -90° 회전. pre-rotate 크기 = (slab.h, slab.w)로 슬라브를 정확히 덮음. */}
            {coverUrl && size.w > 0 ? (
              <Image
                source={{ uri: coverUrl }}
                resizeMode="cover"
                onError={() => { if (coverIdx < coverCandidates.length - 1) setCoverIdx(coverIdx + 1); }}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: size.h,
                  height: size.w,
                  marginLeft: -size.h / 2,
                  marginTop: -size.w / 2,
                  transform: [{ rotate: '-90deg' }],
                }}
              />
            ) : null}

            {/* 린넨 텍스처 — 반복 패턴. RN의 <Image resizeMode="repeat">로 타일링. */}
            {NORMAL_MAP_SOURCE ? (
              <Image
                source={NORMAL_MAP_SOURCE}
                resizeMode={Platform.OS === 'web' ? 'cover' : 'repeat'}
                pointerEvents="none"
                style={{
                  position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                  width: '100%', height: '100%',
                  opacity: 0.22,
                }}
              />
            ) : null}

            {/* 위에서 비치는 빛 — 화면 하단에 가까운 책일수록 강함 (LinearGradient로 교체) */}
            <AnimatedLinearGradient
              pointerEvents="none"
              colors={[
                'rgba(255,255,255,0.32)',
                'rgba(255,255,255,0.06)',
                'rgba(0,0,0,0)',
                'rgba(0,0,0,0.22)',
              ]}
              locations={[0, 0.28, 0.55, 1]}
              style={{
                position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                opacity: lightOpacity,
              }}
            />

            {/* 멀리 있는 책일수록 어둡게 가라앉는 안개 */}
            <Animated.View pointerEvents="none" style={{
              position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
              backgroundColor: '#0E0E10',
              opacity: fogOpacity,
            }} />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
};
