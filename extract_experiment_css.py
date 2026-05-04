with open('styles.css', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line 298 is before CARD STYLES
rest_of_css = []
for i in range(298, len(lines)):
    # Skip the mobile nav overlay section we already extracted to shell.css
    if '/* 📱 모바일 네비게이션 오버레이' in lines[i]:
        break
    rest_of_css.append(lines[i])

with open('src/experiments/active/2026-04-09_top-gradient-adjust/style.css', 'w', encoding='utf-8') as f:
    f.writelines(rest_of_css)

with open('src/experiments/active/2026-04-09_toast-custom-shadow/style.css', 'w', encoding='utf-8') as f:
    f.writelines(rest_of_css)
