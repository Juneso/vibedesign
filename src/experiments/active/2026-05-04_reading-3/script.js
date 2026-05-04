import { config } from './config.js';

const root = document.querySelector('.canvas-content');

// ── 뷰 전환 ─────────────────────────────────────────────
const views = root.querySelectorAll('.view');
const navTabs = root.querySelectorAll('.nav-tab');

function switchView(target) {
  views.forEach(v => v.classList.toggle('active', v.dataset.view === target));
  navTabs.forEach(t => t.classList.toggle('active', t.dataset.nav === target));

  // 캡처 탭 진입 시 뷰파인더 초기 상태로 리셋
  if (target === 'capture') resetCapture();
}

// ── 내 생각 전송 버튼 활성화 ────────────────────────────
root.addEventListener('input', e => {
  const textarea = e.target.closest('.thought-input');
  if (!textarea) return;
  const btn = textarea.parentElement.querySelector('.send-btn');
  btn.classList.toggle('active', textarea.value.trim().length > 0);
});

// ── 클릭 이벤트 위임 ────────────────────────────────────
root.addEventListener('click', e => {
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) handleAction(actionEl.dataset.action, actionEl);

  // 바텀 네비
  const navTab = e.target.closest('[data-nav]');
  if (navTab) switchView(navTab.dataset.nav);

  // 캡처 태그 토글
  const captureTag = e.target.closest('[data-capture-tag]');
  if (captureTag) captureTag.classList.toggle('selected');
});

function handleAction(action, el) {
  switch (action) {
    case 'send-thought': {
      const wrap = el.closest('.thought-wrap');
      const textarea = wrap.querySelector('.thought-input');
      if (!textarea.value.trim()) return;
      const msg = wrap.querySelector('.saved-msg');
      msg.classList.add('visible');
      textarea.value = '';
      el.classList.remove('active');
      setTimeout(() => msg.classList.remove('visible'), config.animation.savedFeedbackMs);
      break;
    }
    case 'go-capture':
      switchView('capture');
      break;
    case 'go-home':
      switchView('home');
      break;

    // 서재 — 책 상세
    case 'open-book': {
      const btn = el.closest('[data-action="open-book"]');
      const detail = root.querySelector('#book-detail');
      root.querySelector('#detail-emoji').textContent = btn.dataset.cover;
      root.querySelector('#detail-title').textContent = btn.dataset.book;
      root.querySelector('#detail-author').textContent = btn.dataset.author;
      root.querySelector('#detail-count').textContent = btn.dataset.count + '개';
      root.querySelector('#detail-last').textContent = btn.dataset.last;
      root.querySelector('#detail-quotes-label').textContent = `밑줄 기록 ${btn.dataset.count}개`;
      detail.classList.add('active');
      break;
    }
    case 'close-book':
      root.querySelector('#book-detail').classList.remove('active');
      break;

    // 캡처 — 결과 → 뷰파인더
    case 'back-to-viewfinder':
      showViewfinder();
      break;

    // 캡처 — 저장
    case 'save-capture': {
      const btn = root.querySelector('#save-btn');
      btn.classList.add('saved');
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 저장됨';
      setTimeout(() => {
        btn.classList.remove('saved');
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 저장';
        switchView('home');
      }, config.animation.captureFeedbackMs);
      break;
    }
  }
}

// ── 캡처 뷰파인더 드래그 선택 ───────────────────────────
const viewfinder = root.querySelector('#viewfinder');
const selBox = root.querySelector('#selection-box');
let dragging = false;
let startX = 0, startY = 0;

const sampleTexts = [
  '불안은 선택이다. 우리가 두려워하는 것들은 대부분 우리 마음이 만들어낸 미래다.',
  '현재에 집중하는 것만이 유일한 해답이다. 지금 이 순간이 전부다.',
  '두려움은 항상 미래의 투영이다.',
];

function getRelPos(e, rect) {
  if (e.touches && e.touches[0]) {
    return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  }
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

viewfinder.addEventListener('mousedown', startDrag);
viewfinder.addEventListener('touchstart', startDrag, { passive: true });

function startDrag(e) {
  const rect = viewfinder.getBoundingClientRect();
  const pos = getRelPos(e, rect);
  startX = pos.x; startY = pos.y;
  dragging = true;
  selBox.style.left = startX + 'px';
  selBox.style.top = startY + 'px';
  selBox.style.width = '0';
  selBox.style.height = '0';
  selBox.classList.add('visible');
}

root.addEventListener('mousemove', moveDrag);
root.addEventListener('touchmove', moveDrag, { passive: true });

function moveDrag(e) {
  if (!dragging) return;
  const rect = viewfinder.getBoundingClientRect();
  const pos = getRelPos(e, rect);
  const x = Math.min(startX, pos.x);
  const y = Math.min(startY, pos.y);
  const w = Math.abs(pos.x - startX);
  const h = Math.abs(pos.y - startY);
  selBox.style.left = x + 'px';
  selBox.style.top = y + 'px';
  selBox.style.width = w + 'px';
  selBox.style.height = h + 'px';
}

root.addEventListener('mouseup', endDrag);
root.addEventListener('touchend', endDrag);

function endDrag() {
  if (!dragging) return;
  dragging = false;
  const w = parseInt(selBox.style.width);
  const h = parseInt(selBox.style.height);
  if (w > 30 && h > 15) {
    const picked = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
    root.querySelector('#ocr-text').value = picked;
    showResult();
  } else {
    selBox.classList.remove('visible');
  }
}

function showResult() {
  root.querySelector('#viewfinder-step').style.display = 'none';
  const rs = root.querySelector('#result-step');
  rs.style.display = 'flex';
}

function showViewfinder() {
  root.querySelector('#result-step').style.display = 'none';
  root.querySelector('#viewfinder-step').style.display = 'flex';
  selBox.classList.remove('visible');
}

function resetCapture() {
  showViewfinder();
  root.querySelectorAll('[data-capture-tag].selected').forEach(t => t.classList.remove('selected'));
  root.querySelector('#ocr-text').value = '불안은 선택이다. 우리가 두려워하는 것들은 대부분 우리 마음이 만들어낸 미래다.';
}
