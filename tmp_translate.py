import re
import os

css_path = "/Users/1522684/Library/Mobile Documents/com~apple~CloudDocs/Antigravity/motion-canvas/styles.css"
with open(css_path, "r") as f:
    css = f.read()

translations = {
    r'/\*\s*={60,}\s*\n\s*LAB LAYOUT — Full-page shell\s*\n\s*={60,}\s*\*/': 
    '/* ===================================================================\n   🖥️ 1. 랩(Lab) 환경 셸 레이아웃 (웹뷰 감싸는 배경)\n   =================================================================== */',
    
    r'/\*\s*={60,}\s*\n\s*DEVICE FRAME — Mobile mockup \(unchanged\)\s*\n\s*={60,}\s*\*/': 
    '/* ===================================================================\n   📱 2. 디바이스 프레임 (모바일 목업 테두리 및 노치)\n   =================================================================== */',
    
    r'/\*\s*={60,}\s*\n\s*CARD STYLES \(unchanged\)\s*\n\s*={60,}\s*\*/': 
    '/* ===================================================================\n   ✨ 3. AI 액션 카드 기본 스타일 (그라디언트 및 모달 호버)\n   =================================================================== */',
    
    r'/\*\s*={60,}\s*\n\s*RESPONSIVE — Real Mobile View\s*\n\s*={60,}\s*\*/': 
    '/* ===================================================================\n   📡 4. 반응형 레이아웃 (모바일 접속 시 100vh 대응)\n   =================================================================== */',
    
    r'/\*\s*={60,}\s*\n\s*CARD 2 — Breathing Gradient\s*\n\s*={60,}\s*\*/': 
    '/* ===================================================================\n   💨 5. 서브 카드 애니메이션 (브리딩 그라디언트 효과)\n   =================================================================== */',
    
    r'/\*\s*={60,}\s*\n\s*DIALER UI \(AI ENTRANCE BASE\)\s*\n\s*={60,}\s*\*/': 
    '/* ===================================================================\n   📞 6. 다이얼러 메인 UI (키패드, 최근 통화 등 메인 화면)\n   =================================================================== */',

    r'/\*\s*AI Entrance Elements\s*\*/': 
    '/* ✨ AI 인트런스 (모달, 카드 등 등장 요소) */',

    r'/\*\s*---- Number Area ----\s*\*/': 
    '/* 🔢 다이얼러 번호 표시 영역 */',

    r'/\*\s*---- Keypad Area ----\s*\*/': 
    '/* ⌨️ 키패드 영역 (1~9, *, #) */',

    r'/\*\s*Bottom Nav\s*\*/': 
    '/* 🧭 하단 네비게이션 탭 (최근기록, 연락처 등) */',
    
    r'/\*\s*Call Controls\s*\*/': 
    '/* 🎛️ 통화 컨트롤 영역 (통화 버튼, 지우기 버튼 등) */',
    
    r'/\*\s*Toast Mode AI Ellipse: Refines the Wrapper for bottom-up toast scenario\s*\*/': 
    '/* 🍞 토스트 모드 AI 타원: 하단에서 올라오는 토스트 배경 래퍼 */',

    r'/\*\s*Toast Mode Inner: Refines the shape and gradient for the toast scenario\s*\*/': 
    '/* 🍞 토스트 모드 중심부: 토스트 시나리오용으로 찌그러진 타원 모양 정의 */'
}

for pattern, kor_trans in translations.items():
    css = re.sub(pattern, kor_trans, css, flags=re.IGNORECASE)

# Cleaning up dead animation references inside CSS if they still exist
css = re.sub(r'#ai-lottie-2,\s*#ai-lottie-3,\s*#ai-lottie-snappy,\s*#ai-lottie-impact,\s*#ai-lottie-recent,\s*#ai-lottie-recent-gradient-adjust,\s*#ai-lottie-same-day\s*', '', css)

with open(css_path, "w") as f:
    f.write(css)

print("Korean Comments Inserted!")
