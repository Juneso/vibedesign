import { config } from './config.js';

const root = document.querySelector('.canvas-content');

// ── 뷰 전환 ─────────────────────────────────────────────
const views = root.querySelectorAll('.view');
const navTabs = root.querySelectorAll('.nav-tab');

function switchView(target) {
  views.forEach(v => v.classList.toggle('active', v.dataset.view === target));
  navTabs.forEach(t => t.classList.toggle('active', t.dataset.nav === target));

  if (target === 'capture') initCapture();
  else stopCamera();
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

  const navTab = e.target.closest('[data-nav]');
  if (navTab) switchView(navTab.dataset.nav);

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
    case 'back-to-viewfinder':
      showViewfinder();
      break;
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

// ── 카메라 ──────────────────────────────────────────────
const video = root.querySelector('#camera-video');
const fallback = root.querySelector('#camera-fallback');
let cameraStream = null;

async function initCapture() {
  resetCaptureUI();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    video.srcObject = cameraStream;
    video.style.display = 'block';
    fallback.style.display = 'none';
  } catch {
    // 카메라 권한 거부 or 미지원 → fallback
    video.style.display = 'none';
    fallback.style.display = 'flex';
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  video.srcObject = null;
}

// ── 형광펜 드래그 ────────────────────────────────────────
const viewfinder  = root.querySelector('#viewfinder');
const hlLayer     = root.querySelector('#hl-layer');
const confirmBtn  = root.querySelector('#hl-confirm-btn');
const resetBtn    = root.querySelector('#hl-reset-btn');
const canvas      = root.querySelector('#capture-canvas');

// 완성된 strokes: [{top, height}]
let strokes = [];
let dragging = false;
let strokeEl = null;
let strokeStartY = 0;
let vfRect = null;

function getRelPos(e, rect) {
  const src = e.touches ? e.touches[0] : e;
  return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

viewfinder.addEventListener('mousedown', onStrokeStart);
viewfinder.addEventListener('touchstart', onStrokeStart, { passive: true });

function onStrokeStart(e) {
  if (e.target.closest('button')) return;
  vfRect = viewfinder.getBoundingClientRect();
  const pos = getRelPos(e, vfRect);
  strokeStartY = pos.y;
  dragging = true;

  strokeEl = document.createElement('div');
  strokeEl.className = 'hl-stroke';
  strokeEl.style.top = strokeStartY + 'px';
  strokeEl.style.height = '2px';
  strokeEl.style.width = '100%';  // 가로는 항상 전체
  hlLayer.appendChild(strokeEl);
}

root.addEventListener('mousemove', onStrokeMove);
root.addEventListener('touchmove', onStrokeMove, { passive: true });

function onStrokeMove(e) {
  if (!dragging || !strokeEl) return;
  const pos = getRelPos(e, vfRect);
  const top = Math.min(strokeStartY, pos.y);
  const h   = Math.max(4, Math.abs(pos.y - strokeStartY));
  strokeEl.style.top    = top + 'px';
  strokeEl.style.height = h + 'px';
}

root.addEventListener('mouseup', onStrokeEnd);
root.addEventListener('touchend', onStrokeEnd);

function onStrokeEnd() {
  if (!dragging || !strokeEl) return;
  dragging = false;
  const h = parseFloat(strokeEl.style.height);
  if (h < 8) {
    strokeEl.remove();
    strokeEl = null;
    return;
  }
  const top = parseFloat(strokeEl.style.top);
  strokes.push({ top, height: h });
  strokeEl = null;
  updateConfirmBtn();
}

function updateConfirmBtn() {
  const hasStrokes = strokes.length > 0;
  confirmBtn.classList.toggle('visible', hasStrokes);
  resetBtn.classList.toggle('visible', hasStrokes);
}

confirmBtn.addEventListener('click', async () => {
  await runOCR();
});

resetBtn.addEventListener('click', () => {
  hlLayer.innerHTML = '';
  strokes = [];
  updateConfirmBtn();
});

// ── OCR ─────────────────────────────────────────────────
async function runOCR() {
  const rect = viewfinder.getBoundingClientRect();

  // 모든 strokes의 bounding box 계산
  const minTop = Math.min(...strokes.map(s => s.top));
  const maxBot = Math.max(...strokes.map(s => s.top + s.height));
  const selTop = minTop;
  const selH   = maxBot - minTop;

  const scaleX = (video.videoWidth  || rect.width)  / rect.width;
  const scaleY = (video.videoHeight || rect.height) / rect.height;

  canvas.width  = Math.round(rect.width * scaleX);
  canvas.height = Math.round(selH * scaleY);

  const ctx = canvas.getContext('2d');

  if (cameraStream && video.readyState >= 2) {
    ctx.drawImage(
      video,
      0, Math.round(selTop * scaleY),
      canvas.width, canvas.height,
      0, 0, canvas.width, canvas.height
    );
  } else {
    // fallback: 흰 배경 + 안내 텍스트 (실제 OCR 동작 시연용)
    ctx.fillStyle = '#f8f6f1';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '20px sans-serif';
    ctx.fillText('불안은 선택이다. 우리가 두려워하는 것들은', 10, 40);
    ctx.fillText('대부분 우리 마음이 만들어낸 미래다.', 10, 70);
  }

  showResult();
  showOcrLoading(true);

  try {
    const { createWorker } = Tesseract;
    const worker = await createWorker('kor+eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = Math.round((m.progress || 0) * 100);
          const el = root.querySelector('#ocr-progress');
          if (el) el.textContent = pct + '%';
        }
      },
    });
    const { data: { text } } = await worker.recognize(canvas);
    await worker.terminate();

    root.querySelector('#ocr-text').value = text.trim();
  } catch (err) {
    root.querySelector('#ocr-text').value = '(텍스트 인식 실패 — 다시 시도해주세요)';
    console.error('OCR error:', err);
  } finally {
    showOcrLoading(false);
  }
}

function showOcrLoading(on) {
  root.querySelector('#ocr-loading').classList.toggle('visible', on);
  root.querySelector('#ocr-text').style.opacity = on ? '0.4' : '1';
}

// ── 단계 전환 ────────────────────────────────────────────
function showResult() {
  root.querySelector('#viewfinder-step').style.display = 'none';
  const rs = root.querySelector('#result-step');
  rs.style.display = 'flex';
}

function showViewfinder() {
  root.querySelector('#result-step').style.display = 'none';
  root.querySelector('#viewfinder-step').style.display = 'flex';
}

function resetCaptureUI() {
  showViewfinder();
  // 형광펜 strokes 초기화
  hlLayer.innerHTML = '';
  strokes = [];
  updateConfirmBtn();
  root.querySelectorAll('[data-capture-tag].selected').forEach(t => t.classList.remove('selected'));
  root.querySelector('#ocr-text').value = '';
  showOcrLoading(false);
}
