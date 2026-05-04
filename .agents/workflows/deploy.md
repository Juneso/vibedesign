---
description: 완성된 프로토타입을 Vercel 환경에 배포합니다.
---
# /deploy 프로덕션 배포 워크플로우

// turbo
1. 터미널에서 백그라운드로 `npx vercel --prod --yes` 명령을 실행합니다.
2. 명령이 완료되면 Vercel이 반환한 배포 URL을 추출하여 사용자에게 클릭할 수 있는 링크 형태로 제공합니다.
3. 배포 실패 시 `npx vercel login`을 먼저 실행해야 하는 것은 아닌지 로그인 상태를 점검하도록 안내합니다.
