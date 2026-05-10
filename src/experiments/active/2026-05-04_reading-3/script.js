import { config } from './config.js';

const root = document.querySelector('.canvas-content');

// ── 뷰 전환 ─────────────────────────────────────────────
const views   = root.querySelectorAll('.view');
const navTabs = root.querySelectorAll('.nav-tab');

function switchView(target) {
  views.forEach(v => v.classList.toggle('active', v.dataset.view === target));
  navTabs.forEach(t => t.classList.toggle('active', t.dataset.nav === target));
  if (target === 'capture') initCapture();
  else stopCamera();
}

// ── 내 생각 전송 버튼 ────────────────────────────────────
root.addEventListener('input', e => {
  const ta = e.target.closest('.thought-input');
  if (!ta) return;
  ta.parentElement.querySelector('.send-btn')
    .classList.toggle('active', ta.value.trim().length > 0);
});

// ── 클릭 위임 ────────────────────────────────────────────
root.addEventListener('click', e => {
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) handleAction(actionEl.dataset.action, actionEl);
  const navTab = e.target.closest('[data-nav]');
  if (navTab) switchView(navTab.dataset.nav);
  const ct = e.target.closest('[data-capture-tag]');
  if (ct) ct.classList.toggle('selected');
});

function handleAction(action, el) {
  switch (action) {
    case 'send-thought': {
      const wrap = el.closest('.thought-wrap');
      const ta   = wrap.querySelector('.thought-input');
      if (!ta.value.trim()) return;
      const msg = wrap.querySelector('.saved-msg');
      msg.classList.add('visible');
      ta.value = ''; el.classList.remove('active');
      setTimeout(() => msg.classList.remove('visible'), config.animation.savedFeedbackMs);
      break;
    }
    case 'go-capture':   switchView('capture'); break;
    case 'go-home':      switchView('home');    break;
    case 'open-book': {
      const b = el.closest('[data-action="open-book"]');
      const d = root.querySelector('#book-detail');
      root.querySelector('#detail-emoji').textContent = b.dataset.cover;
      root.querySelector('#detail-title').textContent = b.dataset.book;
      root.querySelector('#detail-author').textContent = b.dataset.author;
      root.querySelector('#detail-count').textContent = b.dataset.count + '개';
      root.querySelector('#detail-last').textContent = b.dataset.last;
      root.querySelector('#detail-quotes-label').textContent = `밑줄 기록 ${b.dataset.count}개`;
      d.classList.add('active');
      break;
    }
    case 'close-book':
      root.querySelector('#book-detail').classList.remove('active'); break;
    case 'back-to-viewfinder': showViewfinder(); break;
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
const video    = root.querySelector('#camera-video');
const fallback = root.querySelector('#camera-fallback');
const canvas   = root.querySelector('#capture-canvas');
let cameraStream   = null;
let detectedLines  = []; // [{top, height, center}] in display px

async function initCapture() {
  resetCaptureUI();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    video.srcObject = cameraStream;
    video.style.display = 'block';
    fallback.style.display = 'none';
    // 카메라 안정화 후 줄 감지
    video.onloadeddata = () => setTimeout(detectLines, 800);
  } catch {
    video.style.display = 'none';
    fallback.style.display = 'flex';
  }
}

function stopCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  video.srcObject = null;
  detectedLines = [];
}

// ── 텍스트 줄 자동 감지 ─────────────────────────────────
function detectLines() {
  if (!cameraStream || video.readyState < 2) return;

  const vfR = viewfinder.getBoundingClientRect();
  const W = Math.floor(vfR.width);
  const H = Math.floor(vfR.height);

  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  const ctx = tmp.getContext('2d');
  ctx.drawImage(video, 0, 0, W, H);

  const pixels = ctx.getImageData(0, 0, W, H).data;

  // 행별 평균 명도 계산 (4px 간격 샘플링)
  const rowLum = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    let sum = 0, cnt = 0;
    for (let x = 0; x < W; x += 4) {
      const i = (y * W + x) * 4;
      sum += 0.299 * pixels[i] + 0.587 * pixels[i+1] + 0.114 * pixels[i+2];
      cnt++;
    }
    rowLum[y] = sum / cnt;
  }

  // 5px 이동 평균 스무딩
  const smooth = new Float32Array(H);
  for (let y = 2; y < H - 2; y++) {
    smooth[y] = (rowLum[y-2] + rowLum[y-1] + rowLum[y] + rowLum[y+1] + rowLum[y+2]) / 5;
  }

  // 전체 평균보다 어두운 행 = 텍스트 영역
  const globalMean = smooth.reduce((a, b) => a + b) / H;
  const threshold  = globalMean * config.lineDetection.threshold; // 0.92

  const raw = [];
  let inLine = false, lineStart = 0;
  for (let y = 0; y < H; y++) {
    if (!inLine && smooth[y] < threshold) { inLine = true; lineStart = y; }
    else if (inLine && smooth[y] >= threshold) {
      inLine = false;
      const h = y - lineStart;
      if (h >= config.lineDetection.minHeight) raw.push({ top: lineStart, height: h });
    }
  }

  // 인접 줄 병합
  detectedLines = [];
  for (const seg of raw) {
    const prev = detectedLines[detectedLines.length - 1];
    if (prev && seg.top - (prev.top + prev.height) <= config.lineDetection.mergeGap) {
      const bot = Math.max(prev.top + prev.height, seg.top + seg.height);
      prev.height = bot - prev.top;
    } else {
      detectedLines.push({ ...seg });
    }
  }
  detectedLines.forEach(l => { l.center = l.top + l.height / 2; });
}

// 터치 Y에 가장 가까운 감지된 줄 반환
function snapToLine(y) {
  const fallbackLine = { top: y - 20, height: 40 };
  if (!detectedLines.length) return fallbackLine;
  let nearest = null, minDist = Infinity;
  for (const l of detectedLines) {
    const d = Math.abs(l.center - y);
    if (d < minDist) { minDist = d; nearest = l; }
  }
  // 감지 줄과 너무 멀면 기본값
  return minDist > 80 ? fallbackLine : { top: nearest.top - 2, height: nearest.height + 4 };
}

// ── 형광펜 드래그 (좌→우 수평) ──────────────────────────
const viewfinder = root.querySelector('#viewfinder');
const hlLayer    = root.querySelector('#hl-layer');
const confirmBtn = root.querySelector('#hl-confirm-btn');
const resetBtn   = root.querySelector('#hl-reset-btn');

let strokes    = [];
let dragging   = false;
let strokeEl   = null;
let strokeTop  = 0;
let strokeH    = 40;
let vfRect     = null;

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

  // 감지된 줄에 스냅
  const snapped = snapToLine(pos.y);
  strokeTop = snapped.top;
  strokeH   = snapped.height;

  dragging = true;
  strokeEl = document.createElement('div');
  strokeEl.className = 'hl-stroke';
  strokeEl.style.top    = strokeTop + 'px';
  strokeEl.style.height = strokeH  + 'px';
  strokeEl.style.width  = '0px';
  hlLayer.appendChild(strokeEl);
}

root.addEventListener('mousemove', onStrokeMove);
root.addEventListener('touchmove', onStrokeMove, { passive: true });

function onStrokeMove(e) {
  if (!dragging || !strokeEl) return;
  const pos = getRelPos(e, vfRect);
  strokeEl.style.width = Math.max(0, pos.x) + 'px'; // 좌→우만 성장
}

root.addEventListener('mouseup', onStrokeEnd);
root.addEventListener('touchend', onStrokeEnd);

function onStrokeEnd() {
  if (!dragging || !strokeEl) return;
  dragging = false;
  if (parseFloat(strokeEl.style.width) < 20) {
    strokeEl.remove(); strokeEl = null; return;
  }
  strokeEl.style.width = '100%';
  strokes.push({ top: strokeTop, height: strokeH });
  strokeEl = null;
  updateConfirmBtn();
}

function updateConfirmBtn() {
  const has = strokes.length > 0;
  confirmBtn.classList.toggle('visible', has);
  resetBtn.classList.toggle('visible', has);
}

confirmBtn.addEventListener('click', async () => { await runOCR(); });
resetBtn.addEventListener('click', () => {
  hlLayer.innerHTML = ''; strokes = []; updateConfirmBtn();
});

// ── 이미지 전처리 (OCR 정확도 향상) ─────────────────────
function preprocessForOCR(src) {
  const scale = config.ocr.scale; // 2x 업스케일
  const dst   = document.createElement('canvas');
  dst.width   = src.width  * scale;
  dst.height  = src.height * scale;
  const ctx = dst.getContext('2d');

  ctx.imageSmoothingEnabled  = true;
  ctx.imageSmoothingQuality  = 'high';
  ctx.drawImage(src, 0, 0, dst.width, dst.height);

  // 그레이스케일 + 대비 강화
  const id = ctx.getImageData(0, 0, dst.width, dst.height);
  const d  = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    // 대비 1.6배 stretch (텍스트를 더 선명하게)
    const boosted = Math.min(255, Math.max(0, (gray - 128) * 1.6 + 128));
    d[i] = d[i+1] = d[i+2] = boosted;
  }
  ctx.putImageData(id, 0, 0);
  return dst;
}

// ── OCR ─────────────────────────────────────────────────
async function runOCR() {
  const rect = viewfinder.getBoundingClientRect();

  // strokes 전체 bounding box
  const minTop = Math.min(...strokes.map(s => s.top));
  const maxBot = Math.max(...strokes.map(s => s.top + s.height));
  const selH   = maxBot - minTop;

  const scaleX = (video.videoWidth  || rect.width)  / rect.width;
  const scaleY = (video.videoHeight || rect.height) / rect.height;

  canvas.width  = Math.round(rect.width * scaleX);
  canvas.height = Math.round(selH * scaleY);
  const ctx = canvas.getContext('2d');

  if (cameraStream && video.readyState >= 2) {
    ctx.drawImage(video, 0, Math.round(minTop * scaleY), canvas.width, canvas.height,
                         0, 0, canvas.width, canvas.height);
  } else {
    // fallback mock
    ctx.fillStyle = '#f8f6f1';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '20px sans-serif';
    ctx.fillText('불안은 선택이다. 우리가 두려워하는 것들은', 10, 40);
    ctx.fillText('대부분 우리 마음이 만들어낸 미래다.', 10, 70);
  }

  showResult();
  showOcrLoading(true);

  const processed = preprocessForOCR(canvas);

  try {
    const { createWorker } = Tesseract;
    const worker = await createWorker(config.ocr.lang, 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          const el = root.querySelector('#ocr-progress');
          if (el) el.textContent = Math.round((m.progress || 0) * 100) + '%';
        }
      },
    });
    // PSM 6: 균일한 텍스트 블록 가정 → 정확도 향상
    await worker.setParameters({ tessedit_pageseg_mode: config.ocr.psm });
    const { data: { text } } = await worker.recognize(processed);
    await worker.terminate();
    root.querySelector('#ocr-text').value = text.trim();
  } catch (err) {
    root.querySelector('#ocr-text').value = '(인식 실패 — 다시 시도해주세요)';
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
  root.querySelector('#result-step').style.display = 'flex';
}

function showViewfinder() {
  root.querySelector('#result-step').style.display = 'none';
  root.querySelector('#viewfinder-step').style.display = 'flex';
}

function resetCaptureUI() {
  showViewfinder();
  hlLayer.innerHTML = ''; strokes = [];
  updateConfirmBtn();
  root.querySelectorAll('[data-capture-tag].selected').forEach(t => t.classList.remove('selected'));
  root.querySelector('#ocr-text').value = '';
  showOcrLoading(false);
}
