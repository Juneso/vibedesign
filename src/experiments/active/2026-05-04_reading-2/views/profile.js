// 내정보 탭 — 프로필 헤더 + 통계 + 설정 리스트
import { Books, Quotes } from '../services/storage.js';
import { currentUser } from '../config.js';

let mounted = false;

export function init(deps) {
  render();
  mounted = true;
}

export function update(deps) {
  if (mounted) render();
}

function render() {
  const root = document.querySelector('#profile-root');
  if (!root) return;

  const bookCount = Books.all().length;
  const quoteCount = Quotes.all().length;
  const wikiSessions = 3; // 데모용 고정값

  const joined = formatJoined(currentUser.joinedAt);

  root.innerHTML = `
    <header class="tab-header"><h1 class="tab-title">내정보</h1></header>

    <div class="profile-head">
      <div class="profile-avatar">${escapeHtml(currentUser.initial)}</div>
      <div>
        <h2 class="profile-name">${escapeHtml(currentUser.name)}</h2>
        <p class="profile-handle">${escapeHtml(currentUser.handle)} · ${escapeHtml(joined)} 가입</p>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-cell">
        <p class="stat-num">${bookCount}</p>
        <p class="stat-label">책</p>
      </div>
      <div class="stat-cell">
        <p class="stat-num">${quoteCount}</p>
        <p class="stat-label">인용</p>
      </div>
      <div class="stat-cell">
        <p class="stat-num">${wikiSessions}</p>
        <p class="stat-label">위키 세션</p>
      </div>
    </div>

    <ul class="profile-list">
      ${row(iconBook(),       '독서 목표',   '월 4권')}
      ${row(iconBell(),       '알림',        '켜짐')}
      ${row(iconCircleHalf(), '테마',        '자동')}
      ${row(iconCloud(),      '데이터 백업', 'iCloud')}
      ${row(iconInfo(),       '도움말',      '')}
      ${row(iconLogOut(),     '로그아웃',    '', 'color: var(--accent)')}
    </ul>

    <div class="tab-bottom-pad"></div>
  `;
}

function row(icon, label, value, extraStyle = '') {
  return `
    <li class="profile-row-item"${extraStyle ? ` style="${extraStyle}"` : ''}>
      <span class="profile-row-icon">${icon}</span>
      <span class="profile-row-label">${escapeHtml(label)}</span>
      ${value ? `<span class="profile-row-value">${escapeHtml(value)}</span>` : ''}
    </li>`;
}

// joinedAt: "2026-01" → "2026.01"
function formatJoined(s) {
  if (!s) return '';
  return String(s).replace('-', '.');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- inline icons (24x24, stroke-currentColor) ---
const SVG = (inner) => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
function iconBook()       { return SVG('<path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17h14"/>'); }
function iconBell()       { return SVG('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5z"/><path d="M10 20a2 2 0 0 0 4 0"/>'); }
function iconCircleHalf() { return SVG('<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" opacity="0.18"/>'); }
function iconCloud()      { return SVG('<path d="M7 18a5 5 0 1 1 1.5-9.8A6 6 0 0 1 20 11a4 4 0 0 1-1 7H7z"/>'); }
function iconInfo()       { return SVG('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.8" fill="currentColor"/>'); }
function iconLogOut()     { return SVG('<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M16 16l4-4-4-4"/><path d="M20 12H10"/>'); }
