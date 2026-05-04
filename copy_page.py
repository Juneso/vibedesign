import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Locate ai-impact-entrance
impact_match = re.search(r'(<!-- Page: ai 임팩트있게 등장(.*?)<section class="lab-page" data-page="ai-impact-entrance">.*?</section>\n)', html, re.DOTALL)
if impact_match:
    impact_html = impact_match.group(1)
    # create the new section
    new_html = impact_html.replace('ai-impact-entrance', 'ai-recent-gradient-adjust')
    new_html = new_html.replace('ai-top-gradient-impact', 'ai-top-gradient-recent-gradient-adjust')
    new_html = new_html.replace('ai-ellipse-impact', 'ai-ellipse-recent-gradient-adjust')
    new_html = new_html.replace('ai-card-impact', 'ai-card-recent-gradient-adjust')
    new_html = new_html.replace('ai-lottie-impact', 'ai-lottie-recent-gradient-adjust')
    new_html = new_html.replace('ai-gradient-card-impact', 'ai-gradient-card-recent-gradient-adjust')
    new_html = new_html.replace('dialer-display-impact', 'dialer-display-recent-gradient-adjust')
    new_html = new_html.replace('kb-banner-impact', 'kb-banner-recent-gradient-adjust')
    new_html = new_html.replace('<!-- Page: ai 임팩트있게 등장 (Duplicate of Snappy Entrance) -->', '<!-- Page: 상단 그라 조정 (Duplicate of Impact) -->')
    
    # insert it right after ai-recent-entrance or before it? "최근 기록에서 등장 하위 메뉴로"
    # let's insert it after ai-recent-entrance
    recent_match = re.search(r'(<section class="lab-page" data-page="ai-recent-entrance">.*?</section>\n)', html, re.DOTALL)
    if recent_match:
        html = html.replace(recent_match.group(1), recent_match.group(1) + "\n" + new_html)
        
        # update desktop menu
        desktop_menu_target = '        <a class="lab-nav-item" href="#" data-page="ai-recent-entrance">\n          <span class="lab-nav-dot"></span>\n          <span class="lab-nav-label">최근 기록에서 등장</span>\n        </a>\n'
        desktop_menu_new = desktop_menu_target + '        <a class="lab-nav-item sub-item" href="#" data-page="ai-recent-gradient-adjust" style="padding-left: 32px;">\n          <span class="lab-nav-dot" style="width: 4px; height: 4px;"></span>\n          <span class="lab-nav-label" style="font-size: 13px;">↳ 상단 그라 조정</span>\n        </a>\n'
        html = html.replace(desktop_menu_target, desktop_menu_new)

        # update mobile menu
        mobile_menu_target = '        <li data-page="ai-recent-entrance" class="active">최근 기록에서 등장</li>\n'
        mobile_menu_new = mobile_menu_target + '        <li data-page="ai-recent-gradient-adjust" style="padding-left: 32px; font-size: 13px;">↳ 상단 그라 조정</li>\n'
        html = html.replace(mobile_menu_target, mobile_menu_new)

        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(html)
        print("Successfully updated index.html")
    else:
        print("Could not find ai-recent-entrance section")
else:
    print("Could not find ai-impact-entrance section")
