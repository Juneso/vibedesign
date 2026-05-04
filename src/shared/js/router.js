import { experiments } from '../../experiments/registry.js';
import { toggleTheme } from './theme.js';

export const initRouter = () => {
  const desktopNav = document.querySelector('.lab-nav');
  const mobileNavList = document.querySelector('.mobile-nav-list');
  const iframeContainer = document.getElementById('experiment-frame');

  if (!desktopNav || !iframeContainer) return;

  desktopNav.innerHTML = '';
  let themeToggleLi = null;
  if (mobileNavList) {
    themeToggleLi = mobileNavList.querySelector('.theme-toggle');
    mobileNavList.innerHTML = '';
  }

  const VIEWER_PATH = 'src/shared/viewer/viewer.html';
  let firstValidLoadFn = null;

  const renderGroup = (title, items) => {
    if (items.length === 0) return;

    // Desktop Header
    const desktopHeader = document.createElement('div');
    desktopHeader.className = 'nav-section-title';
    desktopHeader.textContent = title;
    desktopNav.appendChild(desktopHeader);

    // Mobile Header
    if (mobileNavList) {
      const mobHeader = document.createElement('li');
      mobHeader.className = 'nav-section-title';
      mobHeader.style.padding = '16px 24px 8px';
      mobHeader.style.fontSize = '12px';
      mobHeader.style.color = 'rgba(255,255,255,0.3)';
      mobHeader.style.textTransform = 'uppercase';
      mobHeader.style.fontWeight = 'bold';
      mobHeader.textContent = title;
      mobileNavList.appendChild(mobHeader);
    }

    items.forEach((exp) => {
      // ---------------- Desktop Nav ----------------
      const desktopGroup = document.createElement('div');
      desktopGroup.className = 'nav-group';
      desktopGroup.style.marginBottom = '2px';

      const groupTitle = document.createElement('div');
      groupTitle.className = 'nav-group-title';
      const groupLabel = document.createElement('span');
      groupLabel.className = 'nav-group-label';
      groupLabel.textContent = exp.title;
      if (exp.chip) {
        const chip = document.createElement('span');
        chip.className = 'nav-chip';
        chip.textContent = exp.chip;
        groupLabel.appendChild(chip);
      }
      const groupChevron = document.createElement('span');
      groupChevron.className = 'nav-group-chevron';
      groupChevron.innerHTML = `<svg viewBox="0 0 10 10" fill="currentColor"><path d="M3.5 2 L7.5 5 L3.5 8 Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
      groupTitle.appendChild(groupLabel);
      groupTitle.appendChild(groupChevron);
      desktopGroup.appendChild(groupTitle);

      // ---------------- Mobile Nav ----------------
      const mobProtoBtn = document.createElement('li');
      if (mobileNavList) {
        const mobGroupTitle = document.createElement('li');
        mobGroupTitle.style.fontSize = '14px';
        mobGroupTitle.style.fontWeight = '600';
        mobGroupTitle.style.color = 'rgba(255,255,255,0.6)';
        mobGroupTitle.style.padding = '8px 24px 4px';
        mobGroupTitle.textContent = exp.title;
        mobileNavList.appendChild(mobGroupTitle);

        mobProtoBtn.textContent = '▶ 프로토타입 재생';
        mobileNavList.appendChild(mobProtoBtn);
      }

      const loadPrototype = (e) => {
        e?.preventDefault();
        document.querySelectorAll('.nav-group-title, .lab-nav-item, .mobile-nav-list li').forEach(el => el.classList.remove('active'));
        groupTitle.classList.add('active');
        mobProtoBtn.classList.add('active');
        iframeContainer.src = exp.path;
        document.getElementById('mobile-nav-overlay')?.classList.remove('active');
      };

      const toggleExpand = (e) => {
        e?.preventDefault();
        e?.stopPropagation();
        const willExpand = !desktopGroup.classList.contains('expanded');
        // Exclusive accordion: 다른 그룹은 모두 접기
        document.querySelectorAll('.nav-group').forEach(group => {
          if (group !== desktopGroup) group.classList.remove('expanded');
        });
        desktopGroup.classList.toggle('expanded', willExpand);
      };

      groupTitle.addEventListener('click', loadPrototype);
      groupChevron.addEventListener('click', toggleExpand);
      mobProtoBtn.addEventListener('click', loadPrototype);

      if (!firstValidLoadFn && exp.status === 'active') {
        firstValidLoadFn = loadPrototype;
      }

      // Source files (Accordion container)
      const filesContainer = document.createElement('div');
      filesContainer.className = 'nav-files-container';

      if (exp.files && exp.files.length > 0) {
        exp.files.forEach(fileName => {
          const fileBtn = document.createElement('a');
          fileBtn.href = '#';
          fileBtn.className = 'lab-nav-item source-file';
          fileBtn.innerHTML = `<span class="lab-nav-label">${fileName}</span>`;

          const mobFileBtn = document.createElement('li');
          if (mobileNavList) {
            mobFileBtn.textContent = `📄 ${fileName}`;
            mobFileBtn.style.paddingLeft = '40px';
            mobFileBtn.style.fontSize = '13px';
            mobFileBtn.style.fontFamily = 'monospace';
            mobFileBtn.style.opacity = '0.7';
            mobileNavList.appendChild(mobFileBtn);
          }

          const loadFileViewer = (e) => {
            e?.preventDefault();
            document.querySelectorAll('.nav-group-title, .lab-nav-item, .mobile-nav-list li').forEach(el => el.classList.remove('active'));
            fileBtn.classList.add('active');
            mobFileBtn.classList.add('active');
            const fullFilePath = `../../../${exp.folder}/${fileName}`; 
            iframeContainer.src = `${VIEWER_PATH}?file=${fullFilePath}`;
            document.getElementById('mobile-nav-overlay')?.classList.remove('active');
          };

          fileBtn.addEventListener('click', loadFileViewer);
          mobFileBtn.addEventListener('click', loadFileViewer);
          filesContainer.appendChild(fileBtn);
        });
      }
      desktopGroup.appendChild(filesContainer);
      desktopNav.appendChild(desktopGroup);
    });
  };

  // ─── Playground: owner별 폴더 dropdown 렌더 ───
  // 구조: section title → 각 owner는 접힘/펼침 폴더 → 내부에 해당 owner의 experiment(자기 accordion 내 files)
  const renderPlayground = (title, items) => {
    if (items.length === 0) return;

    const desktopHeader = document.createElement('div');
    desktopHeader.className = 'nav-section-title';
    desktopHeader.textContent = title;
    desktopNav.appendChild(desktopHeader);

    if (mobileNavList) {
      const mobHeader = document.createElement('li');
      mobHeader.className = 'nav-section-title';
      mobHeader.style.padding = '16px 24px 8px';
      mobHeader.style.fontSize = '12px';
      mobHeader.style.color = 'rgba(255,255,255,0.3)';
      mobHeader.style.textTransform = 'uppercase';
      mobHeader.style.fontWeight = 'bold';
      mobHeader.textContent = title;
      mobileNavList.appendChild(mobHeader);
    }

    // owner로 그룹핑
    const byOwner = new Map();
    items.forEach(exp => {
      const key = exp.owner || 'misc';
      if (!byOwner.has(key)) byOwner.set(key, []);
      byOwner.get(key).push(exp);
    });

    byOwner.forEach((ownerItems, owner) => {
      // owner folder (dropdown)
      const folderGroup = document.createElement('div');
      folderGroup.className = 'nav-group playground-folder';
      folderGroup.style.marginBottom = '4px';

      const folderTitle = document.createElement('div');
      folderTitle.className = 'nav-group-title playground-folder-title';
      const folderLabel = document.createElement('span');
      folderLabel.className = 'nav-group-label';
      folderLabel.textContent = owner;
      const folderChevron = document.createElement('span');
      folderChevron.className = 'nav-group-chevron';
      folderChevron.innerHTML = `<svg viewBox="0 0 10 10" fill="currentColor"><path d="M3.5 2 L7.5 5 L3.5 8 Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
      folderTitle.appendChild(folderLabel);
      folderTitle.appendChild(folderChevron);
      folderGroup.appendChild(folderTitle);

      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'nav-files-container';
      folderGroup.appendChild(childrenContainer);

      // playground 폴더 자체는 페이지가 없음 — 타이틀/쉐브론 모두 토글만
      folderTitle.addEventListener('click', () => {
        folderGroup.classList.toggle('expanded');
      });

      // mobile owner header
      if (mobileNavList) {
        const mobOwnerTitle = document.createElement('li');
        mobOwnerTitle.style.padding = '12px 24px 4px';
        mobOwnerTitle.style.fontSize = '13px';
        mobOwnerTitle.style.fontWeight = '600';
        mobOwnerTitle.style.color = 'rgba(255,255,255,0.55)';
        mobOwnerTitle.textContent = `📁 ${owner}`;
        mobileNavList.appendChild(mobOwnerTitle);
      }

      ownerItems.forEach((exp) => {
        // experiment entry — Current/Archived와 동일한 accordion 구조, 한 단계 들여쓰기
        const expGroup = document.createElement('div');
        expGroup.className = 'nav-group';
        expGroup.style.marginLeft = '12px';

        const expTitle = document.createElement('div');
        expTitle.className = 'nav-group-title';
        const expLabel = document.createElement('span');
        expLabel.className = 'nav-group-label';
        expLabel.textContent = exp.title;
        if (exp.chip) {
          const chip = document.createElement('span');
          chip.className = 'nav-chip';
          chip.textContent = exp.chip;
          expLabel.appendChild(chip);
        }
        const expChevron = document.createElement('span');
        expChevron.className = 'nav-group-chevron';
        expChevron.innerHTML = `<svg viewBox="0 0 10 10" fill="currentColor"><path d="M3.5 2 L7.5 5 L3.5 8 Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
        expTitle.appendChild(expLabel);
        expTitle.appendChild(expChevron);
        expGroup.appendChild(expTitle);

        const mobProtoBtn = document.createElement('li');
        if (mobileNavList) {
          const mobGroupTitle = document.createElement('li');
          mobGroupTitle.style.fontSize = '14px';
          mobGroupTitle.style.fontWeight = '600';
          mobGroupTitle.style.color = 'rgba(255,255,255,0.6)';
          mobGroupTitle.style.padding = '6px 40px 4px';
          mobGroupTitle.textContent = exp.title;
          mobileNavList.appendChild(mobGroupTitle);

          mobProtoBtn.textContent = '▶ 프로토타입 재생';
          mobProtoBtn.style.paddingLeft = '40px';
          mobileNavList.appendChild(mobProtoBtn);
        }

        const loadPrototype = (e) => {
          e?.preventDefault();
          document.querySelectorAll('.nav-group-title, .lab-nav-item, .mobile-nav-list li').forEach(el => el.classList.remove('active'));
          expTitle.classList.add('active');
          mobProtoBtn.classList.add('active');
          iframeContainer.src = exp.path;
          document.getElementById('mobile-nav-overlay')?.classList.remove('active');
        };

        const toggleExpExpand = (e) => {
          e?.preventDefault();
          e?.stopPropagation();
          const willExpand = !expGroup.classList.contains('expanded');
          document.querySelectorAll('.nav-group').forEach(group => {
            if (group !== expGroup && !group.classList.contains('playground-folder')) {
              group.classList.remove('expanded');
            }
          });
          expGroup.classList.toggle('expanded', willExpand);
        };

        expTitle.addEventListener('click', loadPrototype);
        expChevron.addEventListener('click', toggleExpExpand);
        mobProtoBtn.addEventListener('click', loadPrototype);

        const filesContainer = document.createElement('div');
        filesContainer.className = 'nav-files-container';

        if (exp.files && exp.files.length > 0) {
          exp.files.forEach(fileName => {
            const fileBtn = document.createElement('a');
            fileBtn.href = '#';
            fileBtn.className = 'lab-nav-item source-file source-file--nested';
            fileBtn.innerHTML = `<span class="lab-nav-label">${fileName}</span>`;

            const mobFileBtn = document.createElement('li');
            if (mobileNavList) {
              mobFileBtn.textContent = `📄 ${fileName}`;
              mobFileBtn.style.paddingLeft = '56px';
              mobFileBtn.style.fontSize = '13px';
              mobFileBtn.style.fontFamily = 'monospace';
              mobFileBtn.style.opacity = '0.7';
              mobileNavList.appendChild(mobFileBtn);
            }

            const loadFileViewer = (e) => {
              e?.preventDefault();
              document.querySelectorAll('.nav-group-title, .lab-nav-item, .mobile-nav-list li').forEach(el => el.classList.remove('active'));
              fileBtn.classList.add('active');
              mobFileBtn.classList.add('active');
              const fullFilePath = `../../../${exp.folder}/${fileName}`;
              iframeContainer.src = `${VIEWER_PATH}?file=${fullFilePath}`;
              document.getElementById('mobile-nav-overlay')?.classList.remove('active');
            };

            fileBtn.addEventListener('click', loadFileViewer);
            mobFileBtn.addEventListener('click', loadFileViewer);
            filesContainer.appendChild(fileBtn);
          });
        }
        expGroup.appendChild(filesContainer);
        childrenContainer.appendChild(expGroup);
      });

      desktopNav.appendChild(folderGroup);
    });
  };

  const activeExp = experiments.filter(e => e.status === 'active');
  const archiveExp = experiments.filter(e => e.status === 'archive');
  const playgroundExp = experiments.filter(e => e.status === 'playground');

  renderGroup('Current', activeExp);
  renderGroup('Archived', archiveExp);
  renderPlayground('Playground', playgroundExp);

  if (themeToggleLi && mobileNavList) {
    mobileNavList.appendChild(themeToggleLi);
  }

  const desktopThemeBtn = document.getElementById('theme-toggle');
  if (desktopThemeBtn) {
    desktopThemeBtn.addEventListener('click', toggleTheme);
  }

  if (firstValidLoadFn) {
    firstValidLoadFn();
  }
};
