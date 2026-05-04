---
description: 새로운 프로토타입 프로젝트를 생성합니다. 인자로 프로젝트 이름을 입력합니다.
---
# /new-prototype 프로젝트 생성 워크플로우

1. 사용자가 명시한 프로젝트 이름을 확인합니다. (예: `MyCoolApp`)
2. `src/projects/{프로젝트이름}/views` 디렉토리를 생성합니다.
3. `src/projects/{프로젝트이름}/views/index.vue` 경로에 다음과 같은 기본 템플릿 파일을 생성합니다:
```vue
<script setup>
import { ref } from 'vue'
</script>

<template>
  <div class="min-h-screen bg-gray-50 p-8">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">{프로젝트이름}</h1>
    <p class="text-gray-600">이 프로젝트의 프로토타이핑을 시작하세요.</p>
  </div>
</template>
```
4. 생성이 완료되면 그 다음으로 작업할 문맥을 지정하기 위해 `/load-prototype {프로젝트이름}` 명령을 쓰라고 안내합니다.
