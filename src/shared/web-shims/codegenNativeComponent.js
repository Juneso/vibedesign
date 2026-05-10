// 웹에서는 codegenNativeComponent을 사용할 일 없음 — react-native-svg fabric 모듈이 import만 함.
// 더미 컴포넌트를 반환해 import 단계에서 죽지 않게.
export default function codegenNativeComponent() {
  return () => null;
}
