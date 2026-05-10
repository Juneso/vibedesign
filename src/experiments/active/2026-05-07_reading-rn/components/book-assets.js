// 웹용 텍스처 자산. Vite는 require()를 지원하지 않으므로 import.meta.url 패턴으로 URL을 만들고
// RN의 <Image source={{ uri }}> 형태로 감싸서 양쪽 코드가 동일한 인터페이스를 쓰도록 한다.
const NORMAL_MAP_URL = new URL(
  '../assets/dark_castle_wall_29_78_normal.jpg',
  import.meta.url,
).href;

export const NORMAL_MAP_SOURCE = { uri: NORMAL_MAP_URL };
