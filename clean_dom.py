import sys
from bs4 import BeautifulSoup
from bs4 import Comment

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')
container = soup.find(id='pages-container')

if container:
    # 1. 유지할 페이지 제외하고 모든 <section> DOM 구조에서 완전 삭제
    for child in container.find_all('section', recursive=False):
        if 'data-page' in child.attrs:
            page = child['data-page']
            if page not in ['toast-entrance-custom', 'ai-recent-gradient-adjust']:
                child.decompose()
        else:
            child.decompose()

    # 2. 불필요한 주석(<!-- Page: ... -->) 및 기타 요소 제거
    for comment in container.find_all(string=lambda text: isinstance(text, Comment)):
        if "Page:" in comment and "토스트 등장 (커스텀 섀도우)" not in comment and "상단 그라 조정" not in comment:
            comment.extract()

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(str(soup))
print("DOM Structure cleanly refactored.")
