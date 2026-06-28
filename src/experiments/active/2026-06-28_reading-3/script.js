import { config } from './config.js';
import { getStore, addRecord, resetStore, addBook, saveOnboarding, shouldShowT1, markT1Shown } from './store.js';
import { searchBooks } from './books-api.js';

const root = document.querySelector('.canvas-content');

// ── 뷰 전환 ─────────────────────────────────────────────
const views   = root.querySelectorAll('.view');
const navTabs = root.querySelectorAll('.nav-tab');

function switchView(target) {
  views.forEach(v => v.classList.toggle('active', v.dataset.view === target));
  navTabs.forEach(t => t.classList.toggle('active', t.dataset.nav === target));
  if (target === 'capture') initCapture();
  else stopCamera();
  if (target === 'book-search') openBookSearch();
  if (['home', 'library', 'profile'].includes(target)) renderAll();
}

// ── 렌더링 ───────────────────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function relTime(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60)    return '방금';
  if (s < 3600)  return Math.floor(s / 60) + '분 전';
  if (s < 86400) return Math.floor(s / 3600) + '시간 전';
  const d = Math.floor(s / 86400);
  if (d < 7)  return d + '일 전';
  if (d < 30) return Math.floor(d / 7) + '주 전';
  return Math.floor(d / 30) + '개월 전';
}

function renderAll() {
  const store = getStore();
  renderHome(store);
  renderLibrary(store);
  renderProfile(store);
}

function renderHome(store) {
  const feed  = root.querySelector('#home-feed');
  const empty = root.querySelector('#home-empty');
  const meta  = root.querySelector('#home-meta');

  if (!store.records.length) {
    feed.innerHTML = '';
    empty.style.display = 'flex';
    meta.textContent = '내 기록';
    return;
  }
  empty.style.display = 'none';
  meta.textContent = `총 ${store.records.length}개의 기록`;

  feed.innerHTML = store.records.map(r => `
    <div class="feed-card">
      <div class="card-badge-row">
        <div class="card-badge record">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          기록
        </div>
        <span class="card-age">${relTime(r.createdAt)}</span>
      </div>
      <div class="quote-block main">
        <p class="quote-text">"${esc(r.text)}"</p>
        ${r.book ? `<p class="quote-src">— ${esc(r.book)}${r.author ? ', ' + esc(r.author) : ''}</p>` : ''}
      </div>
      ${r.memo ? `<p class="ai-comment">${esc(r.memo)}</p>` : ''}
      ${r.tags.length ? `<div class="tag-row">${r.tags.map(t => `<span class="tag-chip">#${esc(t)}</span>`).join('')}</div>` : ''}
    </div>
  `).join('');
}

function renderLibrary(store) {
  const grid     = root.querySelector('#book-grid');
  const subtitle = root.querySelector('#lib-subtitle');

  // 수동 추가 책 + 캡처 기록 책을 제목 기준으로 병합
  const bookMap = {};

  (store.books || []).forEach(b => {
    const key = b.title.toLowerCase().trim();
    bookMap[key] = {
      title: b.title,
      author: (b.authors || []).join(', '),
      coverUrl: b.cover || '',
      records: [],
    };
  });

  store.records.forEach(r => {
    const rawTitle = r.book || '(책 미입력)';
    const key = rawTitle.toLowerCase().trim();
    if (bookMap[key]) {
      bookMap[key].records.push(r);
      if (!bookMap[key].author && r.author) bookMap[key].author = r.author;
    } else {
      bookMap[key] = { title: rawTitle, author: r.author || '', coverUrl: '', records: [r] };
    }
  });

  const list = Object.values(bookMap);
  subtitle.textContent = `총 ${list.length}권 · ${store.records.length}개 기록`;

  if (!list.length) {
    grid.innerHTML = '<p class="lib-empty">등록된 책이 없어요.<br>서재에서 책을 추가하거나 캡처로 기록을 남겨보세요.</p>';
    return;
  }

  grid.innerHTML = list.map(b => `
    <button class="book-btn" data-action="open-book"
      data-book="${esc(b.title)}" data-author="${esc(b.author)}"
      data-cover="${esc(b.coverUrl)}" data-count="${b.records.length}"
      data-last="${b.records.length ? relTime(b.records[0].createdAt) : '기록 없음'}">
      ${b.coverUrl
        ? `<img class="book-cover-img" src="${esc(b.coverUrl)}" alt="" />`
        : `<span class="book-cover-emoji">📖</span>`}
      <div>
        <p class="book-name">${esc(b.title)}</p>
        <p class="book-author-sm">${esc(b.author)}</p>
      </div>
      <div class="book-foot">
        <span class="quote-count-chip">${b.records.length}개 기록</span>
        ${b.records.length ? `<span class="book-last">${relTime(b.records[0].createdAt)}</span>` : ''}
      </div>
    </button>
  `).join('');
}

function renderBookDetail(bookTitle) {
  const store = getStore();
  const recs  = store.records.filter(r => (r.book || '(책 미입력)') === bookTitle);

  root.querySelector('#detail-quotes-label').textContent = `밑줄 기록 ${recs.length}개`;
  root.querySelector('#detail-count').textContent = recs.length + '개';
  root.querySelector('#detail-last').textContent = recs.length ? relTime(recs[0].createdAt) : '-';

  const container = root.querySelector('#detail-records');
  container.innerHTML = recs.map(r => `
    <div class="quote-item">
      <div class="quote-item-bar">
        <p class="quote-item-text">"${esc(r.text)}"</p>
      </div>
      ${r.memo ? `<p class="quote-item-memo">${esc(r.memo)}</p>` : ''}
      <div class="quote-item-foot">
        <div class="quote-tags">${r.tags.map(t => `<span class="quote-tag-green">#${esc(t)}</span>`).join('')}</div>
        <span class="quote-date">${relTime(r.createdAt)}</span>
      </div>
    </div>
  `).join('') || '<p class="profile-empty-sm" style="padding:20px 0;">기록이 없어요</p>';
}

function renderProfile(store) {
  const { records } = store;

  const uniqueBooks = new Set(records.map(r => r.book).filter(Boolean)).size;
  const uniqueDays  = new Set(records.map(r => r.createdAt.slice(0, 10))).size;
  const allTags     = records.flatMap(r => r.tags);
  const uniqueTags  = new Set(allTags).size;

  root.querySelector('#stat-books').textContent   = uniqueBooks + '권';
  root.querySelector('#stat-records').textContent = records.length + '개';
  root.querySelector('#stat-days').textContent    = uniqueDays + '일';
  root.querySelector('#stat-tags').textContent    = uniqueTags + '개';

  const since = root.querySelector('#profile-since');
  since.textContent = records.length
    ? new Date(store.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' }) + '부터 시작'
    : '아직 기록이 없어요';

  // 태그 빈도
  const tagCounts = {};
  allTags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const tagsEl  = root.querySelector('#profile-tags');

  if (!topTags.length) {
    tagsEl.innerHTML = '<p class="profile-empty-sm">아직 태그가 없어요</p>';
  } else {
    const max = topTags[0][1];
    tagsEl.innerHTML = topTags.map(([tag, count]) => `
      <div class="tag-row-item">
        <span class="tag-name">#${esc(tag)}</span>
        <div class="tag-bar-wrap">
          <div class="tag-bar" style="width:${Math.round(count / max * 60)}px; opacity:${(0.4 + count / max * 0.5).toFixed(2)};"></div>
          <span class="tag-count">${count}회</span>
        </div>
      </div>
    `).join('');
  }

  // 주간 활동
  const today   = new Date();
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const weekly  = root.querySelector('#profile-weekly');
  const cols = [];
  for (let i = 6; i >= 0; i--) {
    const d   = new Date(today);
    d.setDate(today.getDate() - i);
    const key   = d.toISOString().slice(0, 10);
    const count = records.filter(r => r.createdAt.slice(0, 10) === key).length;
    const h     = count ? Math.round(4 + (count / Math.max(...[...Array(7)].map((_, j) => {
      const dd = new Date(today); dd.setDate(today.getDate() - j);
      return records.filter(r => r.createdAt.slice(0, 10) === dd.toISOString().slice(0, 10)).length;
    }), 1) * 44)) : 4;
    const isToday = i === 0;
    cols.push(`
      <div class="day-col">
        <div class="day-bar${count ? ' has-activity' : ''}${isToday ? ' today' : ''}" style="height:${h}px;"></div>
        <span class="day-label${isToday ? ' today' : ''}">${isToday ? '오늘' : dayNames[d.getDay()]}</span>
      </div>
    `);
  }
  weekly.innerHTML = cols.join('');
}

// ── 온보딩 ──────────────────────────────────────────────
let obCurrentSlide = 0;

function obGoToSlide(n) {
  obCurrentSlide = n;
  const wrap = root.querySelector('.ob-slides-wrap');
  root.querySelector('#ob-slides').style.transform = `translateX(-${n * wrap.offsetWidth}px)`;
  root.querySelectorAll('.ob-dot').forEach((d, i) => d.classList.toggle('active', i === n));
  root.querySelector('#ob-slide-next').textContent = n === 2 ? '시작하기' : '다음';
}

function obShowStep(n) {
  root.querySelectorAll('.ob-step').forEach((s, i) => {
    s.style.display = (i + 1 === n) ? 'flex' : 'none';
  });
}

// Q2/Q3 단일 선택 처리
function handleRadioSelect(el) {
  const group = el.dataset.obRadioGroup;
  root.querySelectorAll(`[data-ob-radio-group="${group}"]`).forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
}

// 온보딩 완료 → 응답 저장 후 홈 이동
function finishOnboarding() {
  const preferredGenres = [...root.querySelectorAll('[data-ob-genre].selected')].map(b => b.dataset.obGenre);
  const thinkEl = root.querySelector('[data-ob-radio-group="think"].selected');
  const stopEl  = root.querySelector('[data-ob-radio-group="stop"].selected');
  saveOnboarding({
    preferredGenres,
    thinkStyle:  thinkEl  ? thinkEl.dataset.obRadio  : null,
    stopPattern: stopEl   ? stopEl.dataset.obRadio   : null,
  });
  switchView('home');
}

// T1 트리거 바텀시트 — canvas-content 안에 있으므로 root로 접근
function showT1Sheet() {
  const overlay = root.querySelector('#t1-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function hideT1Sheet() {
  const overlay = root.querySelector('#t1-overlay');
  if (overlay) overlay.style.display = 'none';
  markT1Shown();
}

// ── 클릭 위임 ────────────────────────────────────────────
root.addEventListener('click', e => {
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) handleAction(actionEl.dataset.action, actionEl);
  const navTab = e.target.closest('[data-nav]');
  if (navTab) switchView(navTab.dataset.nav);
  const ct = e.target.closest('[data-capture-tag]');
  if (ct) ct.classList.toggle('selected');
  const obGenre = e.target.closest('[data-ob-genre]');
  if (obGenre) {
    const selected = root.querySelectorAll('[data-ob-genre].selected');
    if (!obGenre.classList.contains('selected') && selected.length >= 3) return;
    obGenre.classList.toggle('selected');
  }
  const obRadio = e.target.closest('[data-ob-radio]');
  if (obRadio) handleRadioSelect(obRadio);
});

function handleAction(action, el) {
  switch (action) {
    case 'ob-slide-next': {
      if (obCurrentSlide < 2) obGoToSlide(obCurrentSlide + 1);
      else obShowStep(2);
      break;
    }
    case 'ob-skip-slides': obShowStep(2); break;
    case 'ob-to-step3':    obShowStep(3); break;
    case 'ob-to-step4':    obShowStep(4); break;
    case 'ob-to-step5':    obShowStep(5); break;
    case 'ob-finish':      finishOnboarding(); break;
    case 'ob-siwa':
      // 프로토타입: SIWA는 실제 Firebase 연동 없이 완료 처리
      finishOnboarding();
      break;
    case 't1-siwa':
      hideT1Sheet();
      break;
    case 't1-dismiss':
      hideT1Sheet();
      break;
    case 'go-capture':  switchView('capture'); break;
    case 'go-home':     switchView('home');    break;
    case 'open-book': {
      const b = el.closest('[data-action="open-book"]');
      const coverEl = root.querySelector('#detail-emoji');
      if (b.dataset.cover) {
        coverEl.innerHTML = `<img class="detail-cover-img" src="${esc(b.dataset.cover)}" alt="" />`;
      } else {
        coverEl.textContent = '📖';
      }
      root.querySelector('#detail-title').textContent  = b.dataset.book;
      root.querySelector('#detail-author').textContent = b.dataset.author;
      renderBookDetail(b.dataset.book);
      root.querySelector('#book-detail').classList.add('active');
      break;
    }
    case 'close-book':
      root.querySelector('#book-detail').classList.remove('active'); break;
    case 'open-book-search':
      switchView('book-search');
      break;
    case 'close-book-search':
      switchView('library');
      break;
    case 'back-to-viewfinder': showViewfinder(); break;
    case 'save-capture': {
      const text   = root.querySelector('#ocr-text').value.trim();
      const book   = root.querySelector('.book-input:not(.author-input)').value.trim();
      const author = root.querySelector('.author-input').value.trim();
      const memo   = root.querySelector('.memo-input').value.trim();
      const tags   = [...root.querySelectorAll('[data-capture-tag].selected')].map(t => t.textContent.trim());

      if (text) {
        addRecord({ text, book, author, memo, tags, createdAt: new Date().toISOString() });
      }

      const btn = root.querySelector('#save-btn');
      btn.classList.add('saved');
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 저장됨';
      setTimeout(() => {
        btn.classList.remove('saved');
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 올리기';
        switchView('home');
        // T1 트리거: 첫 기록 저장 직후 Apple 업그레이드 유도 (BKT-277)
        if (shouldShowT1()) setTimeout(() => showT1Sheet(), 600);
      }, config.animation.captureFeedbackMs);
      break;
    }
  }
}

// ── R 키 → 콜드스타터 초기화 (테스트 전용) ──────────────
document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() !== 'r') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (!confirm('[테스트] 콜드스타터로 초기화할까요?\n모든 기록과 UID가 삭제됩니다.')) return;
  resetStore();
  location.reload();
});

// ── 카메라 ──────────────────────────────────────────────
const video    = root.querySelector('#camera-video');
const fallback = root.querySelector('#camera-fallback');
const canvas   = root.querySelector('#capture-canvas');
let cameraStream  = null;
let detectedLines = [];

async function initCapture() {
  resetCaptureUI();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    video.srcObject = cameraStream;
    video.style.display = 'block';
    fallback.style.display = 'none';
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
  const W = Math.floor(vfR.width), H = Math.floor(vfR.height);
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  const ctx = tmp.getContext('2d');
  ctx.drawImage(video, 0, 0, W, H);
  const pixels = ctx.getImageData(0, 0, W, H).data;
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
  const smooth = new Float32Array(H);
  for (let y = 2; y < H - 2; y++)
    smooth[y] = (rowLum[y-2] + rowLum[y-1] + rowLum[y] + rowLum[y+1] + rowLum[y+2]) / 5;
  const globalMean = smooth.reduce((a, b) => a + b) / H;
  const threshold  = globalMean * config.lineDetection.threshold;
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

function snapToLine(y) {
  const fallbackLine = { top: y - 20, height: 40 };
  if (!detectedLines.length) return fallbackLine;
  let nearest = null, minDist = Infinity;
  for (const l of detectedLines) {
    const d = Math.abs(l.center - y);
    if (d < minDist) { minDist = d; nearest = l; }
  }
  return minDist > 80 ? fallbackLine : { top: nearest.top - 2, height: nearest.height + 4 };
}

// ── 형광펜 드래그 ────────────────────────────────────────
const viewfinder = root.querySelector('#viewfinder');
const hlLayer    = root.querySelector('#hl-layer');
const confirmBtn = root.querySelector('#hl-confirm-btn');
const resetBtn   = root.querySelector('#hl-reset-btn');
let strokes = [], dragging = false, strokeEl = null, strokeTop = 0, strokeH = 40, vfRect = null;

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
  const snapped = snapToLine(pos.y);
  strokeTop = snapped.top; strokeH = snapped.height;
  dragging = true;
  strokeEl = document.createElement('div');
  strokeEl.className = 'hl-stroke';
  strokeEl.style.cssText = `top:${strokeTop}px; height:${strokeH}px; width:0px;`;
  hlLayer.appendChild(strokeEl);
}

root.addEventListener('mousemove', onStrokeMove);
root.addEventListener('touchmove', onStrokeMove, { passive: true });
function onStrokeMove(e) {
  if (!dragging || !strokeEl) return;
  strokeEl.style.width = Math.max(0, getRelPos(e, vfRect).x) + 'px';
}

root.addEventListener('mouseup', onStrokeEnd);
root.addEventListener('touchend', onStrokeEnd);
function onStrokeEnd() {
  if (!dragging || !strokeEl) return;
  dragging = false;
  if (parseFloat(strokeEl.style.width) < 20) { strokeEl.remove(); strokeEl = null; return; }
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
resetBtn.addEventListener('click', () => { hlLayer.innerHTML = ''; strokes = []; updateConfirmBtn(); });

// ── OCR ─────────────────────────────────────────────────
function preprocessForOCR(src) {
  const scale = config.ocr.scale;
  const dst = document.createElement('canvas');
  dst.width = src.width * scale; dst.height = src.height * scale;
  const ctx = dst.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, dst.width, dst.height);
  const id = ctx.getImageData(0, 0, dst.width, dst.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    const b    = Math.min(255, Math.max(0, (gray - 128) * 1.6 + 128));
    d[i] = d[i+1] = d[i+2] = b;
  }
  ctx.putImageData(id, 0, 0);
  return dst;
}

async function runOCR() {
  const rect  = viewfinder.getBoundingClientRect();
  const minTop = Math.min(...strokes.map(s => s.top));
  const maxBot = Math.max(...strokes.map(s => s.top + s.height));
  const scaleX = (video.videoWidth  || rect.width)  / rect.width;
  const scaleY = (video.videoHeight || rect.height) / rect.height;
  canvas.width  = Math.round(rect.width * scaleX);
  canvas.height = Math.round((maxBot - minTop) * scaleY);
  const ctx = canvas.getContext('2d');
  if (cameraStream && video.readyState >= 2) {
    ctx.drawImage(video, 0, Math.round(minTop * scaleY), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#f8f6f1'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1a1a'; ctx.font = '20px sans-serif';
    ctx.fillText('불안은 선택이다. 우리가 두려워하는 것들은', 10, 40);
    ctx.fillText('대부분 우리 마음이 만들어낸 미래다.', 10, 70);
  }
  showResult();
  showOcrLoading(true);
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
    await worker.setParameters({ tessedit_pageseg_mode: config.ocr.psm });
    const { data: { text } } = await worker.recognize(preprocessForOCR(canvas));
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

function showResult()     { root.querySelector('#viewfinder-step').style.display = 'none'; root.querySelector('#result-step').style.display = 'flex'; }
function showViewfinder() { root.querySelector('#result-step').style.display = 'none'; root.querySelector('#viewfinder-step').style.display = 'flex'; }

function resetCaptureUI() {
  showViewfinder();
  hlLayer.innerHTML = ''; strokes = [];
  updateConfirmBtn();
  root.querySelectorAll('[data-capture-tag].selected').forEach(t => t.classList.remove('selected'));
  root.querySelectorAll('.book-input').forEach(i => i.value = '');
  root.querySelector('.memo-input').value = '';
  root.querySelector('#ocr-text').value = '';
  showOcrLoading(false);
}

// ── 책 검색 ─────────────────────────────────────────────
let bsState = { query: '', loading: false, error: null, results: [] };
let bsDebounce = null;

function openBookSearch() {
  const bsRoot = root.querySelector('#book-search-root');
  if (!bsRoot) return;
  bsState = { query: '', loading: false, error: null, results: [] };

  bsRoot.innerHTML = `
    <div class="bs-search-bar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" id="bs-input" class="bs-input" placeholder="제목, 저자로 검색" autocomplete="off" />
    </div>
    <div id="bs-results"></div>`;

  const input = bsRoot.querySelector('#bs-input');
  input.addEventListener('input', onBsInput);
  input.focus();
  bsRoot.querySelector('#bs-results').addEventListener('click', onBsResultClick);
  renderBsResults();
}

function onBsInput(e) {
  const q = e.target.value;
  bsState.query = q;
  clearTimeout(bsDebounce);
  if (!q.trim()) {
    bsState = { query: q, loading: false, error: null, results: [] };
    renderBsResults();
    return;
  }
  bsState.loading = true;
  bsState.error = null;
  renderBsResults();
  bsDebounce = setTimeout(async () => {
    const queried = q;
    try {
      const results = await searchBooks(queried);
      if (bsState.query !== queried) return; // stale
      bsState.results = results;
      bsState.loading = false;
      renderBsResults();
    } catch (err) {
      if (bsState.query !== queried) return;
      bsState.loading = false;
      bsState.error = err.message || '검색 중 오류가 났어요';
      renderBsResults();
    }
  }, 300);
}

function onBsResultClick(e) {
  const li = e.target.closest('.bs-result-item');
  if (!li) return;
  const id = li.dataset.bookId;
  if (!id || li.classList.contains('added')) return;
  const item = bsState.results.find(b => b.id === id);
  if (!item) return;
  addBook(item);
  renderBsResults();
}

function renderBsResults() {
  const el = root.querySelector('#bs-results');
  if (!el) return;
  const { query, loading, error, results } = bsState;
  const addedIds = new Set((getStore().books || []).map(b => b.id));

  if (loading) {
    el.innerHTML = `<div class="bs-empty"><p>검색 중…</p></div>`;
    return;
  }
  if (error) {
    el.innerHTML = `<div class="bs-empty"><p>${esc(error)}</p></div>`;
    return;
  }
  if (!query.trim()) {
    el.innerHTML = `<div class="bs-empty"><p>제목이나 저자를 입력해보세요.</p></div>`;
    return;
  }
  if (!results.length) {
    el.innerHTML = `<div class="bs-empty"><p>"${esc(query)}" 결과가 없어요.</p></div>`;
    return;
  }

  el.innerHTML = `
    <ul class="bs-result-list">
      ${results.map(b => {
        const exists = addedIds.has(b.id);
        const year = (b.publishedDate || '').slice(0, 4);
        const extra = [b.publisher, year].filter(Boolean).join(' · ');
        return `
          <li class="bs-result-item${exists ? ' added' : ''}" data-book-id="${b.id}">
            <div class="bs-result-cover">
              ${b.cover ? `<img src="${esc(b.cover)}" alt="" />` : '<span>📖</span>'}
            </div>
            <div class="bs-result-meta">
              <p class="bs-result-title">${esc(b.title)}</p>
              <p class="bs-result-author">${esc((b.authors || []).join(', '))}</p>
              ${extra ? `<p class="bs-result-extra">${esc(extra)}</p>` : ''}
            </div>
            <button class="bs-result-add"${exists ? ' disabled' : ''}>${exists ? '추가됨' : '추가'}</button>
          </li>`;
      }).join('')}
    </ul>`;
}

// ── 초기 렌더 ────────────────────────────────────────────
renderAll();
