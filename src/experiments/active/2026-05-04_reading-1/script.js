import { config } from './config.js';

const root = document.querySelector('.canvas-content');
const views = root.querySelectorAll('.view');

const switchView = (target) => {
  views.forEach((v) => {
    v.classList.toggle('active', v.dataset.view === target);
  });
  // briefing 진입 시 스크롤 최상단으로
  if (target === 'briefing') {
    const scroller = root.querySelector('.brief-scroll');
    if (scroller) scroller.scrollTop = 0;
  }
};

root.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === 'open-briefing') switchView('briefing');
    if (action === 'back-home') switchView('home');
    if (action === 'confirm-goal') {
      // 데모 인터랙션: 시각 피드백
      const btn = actionEl;
      btn.textContent = '저장됨 ✓';
      btn.style.background = 'linear-gradient(90deg,#3DA76B 0%,#29B5CB 100%)';
      setTimeout(() => {
        btn.textContent = '목표 저장하고 읽기 시작';
        btn.style.background = '';
      }, 1400);
    }
  }

  const chip = e.target.closest('[data-chip]');
  if (chip) {
    chip.classList.toggle('selected');
  }
});
