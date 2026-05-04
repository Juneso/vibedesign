import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

template = """<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js"></script>
  <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
  <link rel="stylesheet" href="../../../shared/styles/tokens.css" />
  <link rel="stylesheet" href="../../../shared/styles/base.css" />
  <link rel="stylesheet" href="../../../shared/styles/device.css" />
  <link rel="stylesheet" href="style.css" />
</head>
<body data-theme="">
  {}
  <script type="module" src="script.js"></script>
</body>
</html>
"""

# Extract first section
section1_match = re.search(r'<section class="lab-page active" data-page="ai-recent-gradient-adjust">(.*?)</section>', html, re.DOTALL)
if section1_match:
    content = section1_match.group(1).strip()
    content = content.replace('class="dialer-ui safe-area-padding-top"', 'class="dialer-ui safe-area-padding-top" data-inspect="dialer-ui"')
    content = content.replace('id="ai-gradient-card-recent-gradient-adjust"', 'id="ai-gradient-card-recent-gradient-adjust" data-inspect="ai-gradient-card"')
    content = content.replace('class="ai-action-card"', 'class="ai-action-card" data-inspect="ai-action-card"')
    with open('src/experiments/active/2026-04-09_top-gradient-adjust/index.html', 'w', encoding='utf-8') as f:
        f.write(template.format(content))

# Extract second section
section2_match = re.search(r'<section class="lab-page" data-page="toast-entrance-custom">(.*?)</section>', html, re.DOTALL)
if section2_match:
    content2 = section2_match.group(1).strip()
    content2 = content2.replace('class="toast-page-container safe-area-padding-top"', 'class="toast-page-container safe-area-padding-top" data-inspect="toast-page"')
    content2 = content2.replace('id="toast-agent-call-custom"', 'id="toast-agent-call-custom" data-inspect="floating-toast"')
    with open('src/experiments/active/2026-04-09_toast-custom-shadow/index.html', 'w', encoding='utf-8') as f:
        f.write(template.format(content2))
