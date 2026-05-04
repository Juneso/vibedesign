import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Remove the second desktop menu item
desktop_item = r'(<a class="lab-nav-item sub-item" href="#" data-page="ai-recent-gradient-adjust" style="padding-left: 32px;">\s*<span class="lab-nav-dot" style="width: 4px; height: 4px;"></span>\s*<span class="lab-nav-label" style="font-size: 13px;">↳ 상단 그라 조정</span>\s*</a>\s*)'
html = re.sub(desktop_item + desktop_item, r'\1', html)

# Remove the second mobile menu item
mobile_item = r'(<li data-page="ai-recent-gradient-adjust" style="padding-left: 32px; font-size: 13px;">↳ 상단 그라 조정</li>\s*)'
html = re.sub(mobile_item + mobile_item, r'\1', html)

# Remove the second duplicated section
# The comment is <!-- Page: 상단 그라 조정 (Duplicate of Impact) -->
# We want to find two of these and keep only one.
section_pattern = r'(<!-- Page: 상단 그라 조정 \(Duplicate of Impact\) -->.*?)(?=<!-- Page: |\Z)'
# findall non-overlapping
sections = re.findall(section_pattern, html, re.DOTALL)
if len(sections) >= 2:
    # replace the second occurrence with empty string
    # careful, re.sub might replace all. We'll split and join.
    parts = html.split(sections[1])
    html = parts[0] + ''.join(parts[2:])

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Deduplicated index.html")
