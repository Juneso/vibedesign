---
description: Figma MCP 연결 상태를 확인합니다
---
# /check-figma 연결 확인 워크플로우

1. 백그라운드 터미널에서 `python3 tools/check_connection.py` 명령을 실행합니다.
2. 실행 결과를 읽어보고 연결이 정상인지 사용자에게 보고합니다.
3. 문제가 있다면 Figma Desktop 앱이 실행 중인지, Settings -> Developer -> MCP Server가 켜져 있는지 확인하라고 안내합니다.
