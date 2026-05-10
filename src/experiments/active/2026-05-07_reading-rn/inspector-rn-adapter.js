// RN→Web 인스펙터 어댑터
// react-native-web가 만드는 클래스명은 r-bcqeeo 같은 해시라 인스펙터에서 의미 파악이 어렵다.
// RNInspectable 컴포넌트가 dataSet={{ rn: 'Name' }} 를 넣어 DOM에 data-rn="Name"이 박히면,
// 이 어댑터가 해당 노드의 className 앞에 'rn-Name'을 추가해 inspector buildSelector가 잘 잡도록 한다.

const TARGET_ATTR = 'data-rn';
const PREFIX = 'rn-';

const apply = (el) => {
  const name = el.getAttribute(TARGET_ATTR);
  if (!name) return;
  const cls = PREFIX + name;
  if (!el.classList.contains(cls)) el.classList.add(cls);
};

const sweep = (root = document.body) => {
  root.querySelectorAll(`[${TARGET_ATTR}]`).forEach(apply);
};

// 초기 + DOM 변경 시 자동 라벨링
const start = () => {
  sweep();
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'childList') {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.hasAttribute?.(TARGET_ATTR)) apply(n);
          n.querySelectorAll?.(`[${TARGET_ATTR}]`).forEach(apply);
        });
      } else if (m.type === 'attributes' && m.attributeName === TARGET_ATTR) {
        apply(m.target);
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: [TARGET_ATTR] });
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
