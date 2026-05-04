---
description: 프로젝트를 초기 설정합니다
---
# /init 프로젝트 초기 설정 워크플로우

1. 사용자의 Node.js 버전이 요구사항(v20 이상)을 충족하는지 버전을 확인합니다. (`node --version`)
2. `npm install`을 실행하여 의존성을 설치합니다.
3. `python3 tools/check_connection.py`를 실행하여 Figma가 정상적으로 연결되어 있는지 상태를 검사합니다.
4. 필요시 `npm run dev`를 실행하여 개발 서버를 시작할 수 있다고 안내합니다.
