export const config = {
  colors: {
    bg: '#f8f6f1',
    surface: '#ffffff',
    accent: '#2d5a27',
    accentLight: '#e8f0e7',
    muted: '#8b8578',
    border: '#e8e4dc',
    foreground: '#1a1a1a',
    bodyText: '#3a3530',
    tagBg: '#f0ede8',

    // 카드 타입별 색상
    connection: { color: '#2d5a27', bg: '#e8f0e7' },
    question:   { color: '#5a4a2d', bg: '#f0ebe7' },
    expansion:  { color: '#2d4a5a', bg: '#e7eef0' },
  },

  layout: {
    maxWidth: 430,
    headerPadding: '20px 20px 12px',
    cardPadding: 20,
    cardRadius: 16,
    cardGap: 12,
    bottomNavH: 80,
    fabBottom: 88,
  },

  animation: {
    savedFeedbackMs: 2000,
    captureFeedbackMs: 1400,
  },

  ocr: {
    lang: 'kor+eng',   // 한국어 + 영어 동시 인식
    // Tesseract.js CDN — 한국어 모델 ~15MB, 첫 로딩 느림
  },

  camera: {
    facingMode: 'environment',  // 후면 카메라 우선
    idealWidth: 1280,
    idealHeight: 720,
  },

  mockData: {
    dateStr: '5월 4일',
    feedCount: 3,
    bookCount: 4,
    quoteCount: 5,
  },
};
