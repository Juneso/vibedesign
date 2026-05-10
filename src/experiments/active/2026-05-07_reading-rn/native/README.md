# Native (Expo) 포팅 가이드

웹 뷰어에서는 `react-native-web`로 같은 JSX를 렌더해 미리보기.
실제 iOS/Android 빌드는 별도 Expo 프로젝트로 분리해야 한다.

## 같이 쓰는 코드 (이식 비용 거의 0)

- `data.js` — config, 시드, 위키
- `storage.js` — `localStorage` 호출만 `AsyncStorage`로 치환 (얇은 래퍼)
- `screens/*.jsx`, `components/*.jsx` — `react-native` 임포트 그대로
- `theme.js` — `body[data-theme]` 관찰자만 `Appearance` API로 치환

## 다시 짜야 할 부분

- `useTheme` 의 MutationObserver → `Appearance.addChangeListener`
- `dataSet` 속성 → 네이티브에서는 무시되지만 동작 영향 없음 (테스트 도구용)
- `style.css` 의 키프레임 (`rnCharFadeIn`) → `Animated.timing`으로 글자별 페이드인
- `parent.postMessage` 테마 동기화 → 제거
- `outlineStyle: 'none'` 같은 웹 전용 스타일 → 무시 가능
- `boxShadow`/`backgroundImage` (그라디언트) → `expo-linear-gradient` + `shadowOffset` API

## Expo 셸 만들기

```bash
npx create-expo-app reading-rn --template blank
cd reading-rn
# screens / components / data.js / storage.js (AsyncStorage 버전) 복사
npx expo install @react-native-async-storage/async-storage
npm i react-native-svg
npx expo start
```

## 인스펙터

웹 뷰어의 인스펙터(Shift+클릭)는 `data-rn` 속성을 어댑터가 className에 미러링해 활성화됨.
네이티브 빌드에서는 React DevTools / Reactotron 등을 별도로 사용.
