import React from 'react';
import MindMapScreen from './screens/MindMapScreen.jsx';

// 0621 실험: 수집한 8권을 책별 마인드맵으로 표현. (0524 복제 → 마인드맵 전용 뷰)
export default function App() {
  return (
    <div className="flex flex-col h-full w-full bg-[#fafafb]">
      <MindMapScreen />
    </div>
  );
}
