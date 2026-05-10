# 0507 Reading-RN — 작업 가이드

## 이 실험의 성격

**최종 타겟: React Native (iOS + Android).** 웹 미리보기는 `react-native-web` 기반 뷰어일 뿐, 진짜 산출물은 네이티브 앱. 따라서 **이 폴더에서 짜는 모든 코드는 네이티브에서 그대로 동작해야 한다.** "웹에선 보이지만 네이티브에서 안 도는 스타일/API"는 사용 금지.

웹 뷰어는 어디까지나 **빠른 시각 검증용**. 핸드오프나 실제 동작 기준은 네이티브.

## 절대 쓰지 말 것 (네이티브에서 작동 안 함)

### CSS-only 스타일 속성
RN의 style 객체는 CSS 서브셋만 지원. 다음은 RN에서 **무시되거나 크래시**:
- `mixBlendMode` — Skia 없이 불가
- `filter` (CSS 필터: `grayscale`, `contrast`, `brightness` 등) — 불가
- `backgroundImage: url(...)` — 텍스처 깔기는 `<Image>` 또는 `<ImageBackground>` 사용
- `backgroundImage: linear-gradient(...)` — `expo-linear-gradient` 사용
- `cursor` — 모바일에 커서 없음
- `boxShadow` 멀티 레이어 문자열 — `shadowColor/Offset/Opacity/Radius` (iOS) + `elevation` (Android)
- CSS 키프레임/`animation` 속성 — `Animated`/`Reanimated`로 짜야 함

### DOM / 웹 전용 API
- `document.*`, `window.*`, `MutationObserver`, `window.addEventListener('message')`
- `localStorage` / `sessionStorage` — `AsyncStorage` 또는 인메모리 모듈 사용
- `import.meta.url` / `new URL(..., import.meta.url)` — Hermes 파싱 단계에서 죽음. 자산은 `require('./asset.png')`

### 이벤트 핸들러 이름
- `onClick` → `onPress` (또는 `<Pressable>`)
- `onMouseEnter` 같은 마우스 이벤트 — 모바일엔 없음, 제거

## 권장 패턴

- 컴포넌트 import: 항상 `react-native`에서 (`View`, `Text`, `Image`, `Animated`, `Pressable`, `ScrollView`, `FlatList`)
- 스타일은 `StyleSheet.create` 또는 인라인 객체. RN의 `transform`, `flex`, `position`, `border*`, `padding/margin`, `shadow*`, `elevation`은 모두 OK.
- 텍스처/패턴: 미리 렌더된 이미지 자산을 `<Image>`로 깔기. CSS `background-image`로 깔 생각 X.
- 그라디언트: `expo-linear-gradient`의 `<LinearGradient>`.
- 블렌드/필터 효과가 꼭 필요하면 **react-native-skia** 도입 검토 — 단, 의존성 무거우니 합의 후.
- 플랫폼 분기 불가피하면 `Platform.OS === 'web'`로 분기. 단, 가급적 양쪽 다 도는 코드를 우선.
- 자산 경로: `require('./assets/foo.jpg')`로 통일. 웹에서도 Vite/Metro가 처리 가능.

## 디렉토리/파일 약속

- `App.jsx`, `screens/*`, `components/*`, `data.js`, `theme.js`, `storage.js` — 네이티브-호환 본문
- `main.jsx`, `index.html`, `style.css`, `inspector-rn-adapter.js` — **웹 뷰어 전용 진입점**. 네이티브에서 import하지 않음.
- 환경 분기가 진짜 필요하면 `foo.js` + `foo.native.js` 패턴 (Metro가 native에서 `.native.js` 우선 선택). 단, import 시 확장자 명시 X (`from './foo'`).
- `theme.js`처럼 단일 파일 안에서 `Platform.OS`로 분기하는 방식이 더 간단. 새 파일 늘리지 말 것.

## 네이티브 프리뷰

- 위치: `~/Desktop/native-preview/` (iCloud 밖). Metro가 watchFolders로 이 실험 폴더를 import.
- 실행: `(cd ~/Desktop/native-preview && npx expo start --clear --ios)`
- iCloud 안에서 `node_modules` 깔면 `ERR_INVALID_PACKAGE_CONFIG` 등으로 깨짐 — 프리뷰 폴더는 절대 iCloud로 옮기지 말 것.

## 작업 체크리스트 (웹에서 코드 짤 때)

- [ ] `react-native` 외 라이브러리 import 안 함 (DOM 라이브러리 X)
- [ ] 스타일에 `backgroundImage`, `mixBlendMode`, `filter`, `cursor`, CSS 키프레임 없음
- [ ] DOM API (`document`, `window`, `localStorage`, `import.meta`) 안 씀
- [ ] 이벤트 핸들러는 `onPress` 계열
- [ ] 자산은 `require()`로 로드
- [ ] 작업 후 native 프리뷰에서 한 번 확인 — crash 없으면 OK, 비주얼 단순화는 자연스러움
