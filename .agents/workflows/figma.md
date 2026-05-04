---
description: 선택한 Figma 노드의 디자인을 현재 프로젝트의 코드로 변환합니다.
---
# /figma 코드 변환 워크플로우

1. `python3 tools/check_connection.py`를 실행하여 연결 상태를 검사합니다.
2. `python3 tools/figma_mcp.py get_design_context`를 실행하여 현재 Figma에서 선택한 콘텍스트 데이터를 추출합니다.
3. 이전에 로드된 프로젝트 문맥(`/load-prototype`을 통해 설정된 폴더명)을 확인합니다.
4. 문맥이 없다면 "어떤 프로젝트에 추가할 것인지 알려주세요"라고 되묻습니다.
5. 변환된 코드를 기반으로 Vue 3 + Tailwind CSS 문법에 맞추어 `src/projects/{프로젝트명}/views/{화면이름}View.vue` 컴포넌트로 파일을 작성합니다.
6. 자동으로 라우팅이 설정된다고 안내하고 서버 URL을 제공합니다.
