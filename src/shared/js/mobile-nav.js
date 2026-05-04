import { toggleTheme } from './theme.js';

export const initMobileNav = () => {
  const toggleBtn = document.getElementById('mobile-nav-toggle');
  const closeBtn = document.getElementById('mobile-nav-close');
  const sidebar = document.querySelector('.lab-sidebar');
  const mobileNavList = document.querySelector('.mobile-nav-list');

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
      });
    }

    // 화면 아무 곳이나 누르면 모달 닫기
    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('mobile-open')) {
        if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
          sidebar.classList.remove('mobile-open');
        }
      }
    });

    // 메뉴 항목 클릭 시 닫기
    if (mobileNavList) {
      mobileNavList.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI' || e.target.tagName === 'A') {
          sidebar.classList.remove('mobile-open');
        }
      });
    }

    // iframe 안에서 클릭 시에도 닫도록
    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'IFRAME_CLICK' && sidebar.classList.contains('mobile-open')) {
        sidebar.classList.remove('mobile-open');
      }
    });
  }
};
