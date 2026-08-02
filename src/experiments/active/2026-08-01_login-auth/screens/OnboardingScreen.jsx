import React, { useState } from 'react';

// 0628 실험(온보딩 슬라이드 + 취향 설문)을 그대로 이식하되, 로그인 선택 화면(Step 5)은
// 뺐다. BKT-277 최신 결정("바로 시작" 단일 버튼 → 익명 Auth 자동, 소셜 연결은 T1에서만
// 제안)에 맞춰, 설문이 끝나면 선택 없이 바로 메인으로 진입한다.
const GENRES = [
  ['소설·문학', '📖'], ['에세이·산문', '✍️'], ['인문·철학', '🏛️'], ['역사·사회', '📜'],
  ['자기계발', '🚀'], ['경제·비즈니스', '💰'], ['과학·기술', '🔬'], ['다양하게', '🎲'],
];

const THINK_OPTIONS = [
  ['think-causal', '왜 그런지 원인을 먼저 파고들어요'],
  ['think-comparative', '다른 것들이랑 비교하면서 이해해요'],
  ['think-experiential', '내 경험이랑 연결이 돼야 납득이 가요'],
  ['think-structural', '전체 그림이 그려져야 세부가 들어와요'],
  ['think-absorptive', '일단 받아들이고 나서 천천히 소화해요'],
];

const STOP_OPTIONS = [
  ['stop-discovery', '몰랐던 사실이나 개념을 처음 알게 됐을 때'],
  ['stop-expression', '내가 막연히 느끼던 걸 누군가 정확히 말해줬을 때'],
  ['stop-challenged', '내 생각이랑 반대되는 주장인데 설득력이 있을 때'],
  ['stop-resonance', '지금 내 상황에 딱 맞는 말인 것 같을 때'],
  ['stop-intuitive', '이유는 모르겠는데 그냥 꽂혔을 때'],
];

export default function OnboardingScreen({ onComplete }) {
  const [step, setStep] = useState(1);
  const [slide, setSlide] = useState(0);
  const [genres, setGenres] = useState([]);
  const [think, setThink] = useState(null);
  const [stop, setStop] = useState(null);

  const toggleGenre = (g) => {
    setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g)
      : prev.length >= 3 ? prev : [...prev, g]);
  };

  if (step === 1) {
    return (
      <div className="ob-step">
        <div className="ob-appbar"><span className="ob-appname">밑줄</span></div>
        <div className="ob-slides-wrap">
          <div className="ob-slides" style={{ transform: `translateX(-${slide * 100}%)` }}>
            <div className="ob-slide">
              <div className="ob-illust">
                <div className="ob-mock-capture">
                  <div className="ob-hl-stripe" />
                  <div className="ob-mock-line" />
                  <div className="ob-mock-line short" />
                  <div className="ob-mock-line shorter" />
                </div>
                <p className="ob-mock-badge">텍스트 인식 중...</p>
              </div>
              <div className="ob-copy">
                <h2 className="ob-headline">마음에 새겨진 문장</h2>
                <p className="ob-body">기억하고 싶은 순간을 바로,<br />가볍게 담아두세요.</p>
              </div>
            </div>

            <div className="ob-slide">
              <div className="ob-illust">
                <div className="ob-mock-card">
                  <div className="ob-mock-quote-bar" />
                  <div className="ob-mock-quote-body">
                    <div className="ob-mock-text-line" />
                    <div className="ob-mock-text-line short" />
                  </div>
                </div>
                <div className="ob-mock-ai-reply">
                  <span className="ob-ai-chip">AI</span>
                  <div className="ob-mock-ai-lines">
                    <div className="ob-mock-text-line shorter" style={{ background: 'var(--ul-accent)', opacity: 0.25 }} />
                    <div className="ob-mock-text-line" style={{ width: '75%', background: 'var(--ul-accent)', opacity: 0.18 }} />
                  </div>
                </div>
              </div>
              <div className="ob-copy">
                <h2 className="ob-headline">읽을수록 넓어지는 생각</h2>
                <p className="ob-body">AI와 이야기하다 보면,<br />책 한 권이 내 안에서 훨씬 크게 자라요.</p>
              </div>
            </div>

            <div className="ob-slide">
              <div className="ob-illust ob-illust-neuron">
                <svg className="ob-neuron-svg" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <line x1="100" y1="60" x2="40" y2="30" stroke="#2d5a27" strokeWidth="1.5" strokeOpacity="0.3" />
                  <line x1="100" y1="60" x2="160" y2="30" stroke="#2d5a27" strokeWidth="1.5" strokeOpacity="0.3" />
                  <line x1="100" y1="60" x2="55" y2="95" stroke="#2d5a27" strokeWidth="1.5" strokeOpacity="0.3" />
                  <line x1="100" y1="60" x2="148" y2="95" stroke="#2d5a27" strokeWidth="1.5" strokeOpacity="0.3" />
                  <circle cx="100" cy="60" r="14" fill="#2d5a27" fillOpacity="0.15" stroke="#2d5a27" strokeWidth="1.5" />
                  <circle cx="40" cy="30" r="9" fill="#2d5a27" fillOpacity="0.12" stroke="#2d5a27" strokeWidth="1.2" />
                  <circle cx="160" cy="30" r="9" fill="#2d5a27" fillOpacity="0.12" stroke="#2d5a27" strokeWidth="1.2" />
                  <circle cx="55" cy="95" r="7" fill="#2d5a27" fillOpacity="0.1" stroke="#2d5a27" strokeWidth="1" />
                  <circle cx="148" cy="95" r="7" fill="#2d5a27" fillOpacity="0.1" stroke="#2d5a27" strokeWidth="1" />
                </svg>
              </div>
              <div className="ob-copy">
                <h2 className="ob-headline">세상에 하나뿐인,<br />내 생각의 지도</h2>
                <p className="ob-body">기록 하나하나가 연결되며<br />나만의 독서 뉴런이 만들어져요.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="ob-footer">
          <div className="ob-dots">
            {[0, 1, 2].map(i => <div key={i} className={`ob-dot${i === slide ? ' active' : ''}`} />)}
          </div>
          <button
            className="ob-btn-primary"
            onClick={() => slide < 2 ? setSlide(slide + 1) : setStep(2)}
          >
            {slide < 2 ? '다음' : '시작하기'}
          </button>
          <button className="ob-btn-ghost" onClick={onComplete}>건너뛰기</button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="ob-step">
        <div className="ob-step-inner">
          <p className="ob-step-num">1 / 3</p>
          <h2 className="ob-step-title">주로 어떤 책을<br />읽어요?</h2>
          <p className="ob-step-sub">최대 3개까지 고를 수 있어요</p>
          <div className="ob-genre-grid">
            {GENRES.map(([g, emoji]) => (
              <button
                key={g}
                className={`ob-genre-btn${genres.includes(g) ? ' selected' : ''}`}
                onClick={() => toggleGenre(g)}
              >
                {emoji} {g}
              </button>
            ))}
          </div>
        </div>
        <div className="ob-footer">
          <button className="ob-btn-primary" onClick={() => setStep(3)}>다음</button>
          <button className="ob-btn-ghost" onClick={() => setStep(3)}>나중에 설정</button>
        </div>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="ob-step">
        <div className="ob-step-inner">
          <p className="ob-step-num">2 / 3</p>
          <h2 className="ob-step-title">뭔가를 이해할 때<br />나는 주로 이런 편이에요</h2>
          <p className="ob-step-sub">하나만 골라주세요</p>
          <div className="ob-radio-list">
            {THINK_OPTIONS.map(([id, label]) => (
              <button
                key={id}
                className={`ob-radio-btn${think === id ? ' selected' : ''}`}
                onClick={() => setThink(id)}
              >
                <span className="ob-radio-circle" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="ob-footer">
          <button className="ob-btn-primary" onClick={() => setStep(4)}>다음</button>
          <button className="ob-btn-ghost" onClick={() => setStep(4)}>나중에 설정</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ob-step">
      <div className="ob-step-inner">
        <p className="ob-step-num">3 / 3</p>
        <h2 className="ob-step-title">책을 읽으면서 주로<br />어떤 순간에 멈추게 돼요?</h2>
        <p className="ob-step-sub">하나만 골라주세요</p>
        <div className="ob-radio-list">
          {STOP_OPTIONS.map(([id, label]) => (
            <button
              key={id}
              className={`ob-radio-btn${stop === id ? ' selected' : ''}`}
              onClick={() => setStop(id)}
            >
              <span className="ob-radio-circle" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="ob-footer">
        <button className="ob-btn-primary" onClick={onComplete}>다음</button>
        <button className="ob-btn-ghost" onClick={onComplete}>나중에 설정</button>
      </div>
    </div>
  );
}
