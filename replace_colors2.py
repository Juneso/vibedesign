import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Remaining backgrounds
content = content.replace('bg-[#f5f5f5]', 'bg-[var(--surface-bg)]')
content = content.replace('bg-[#1a1a1a]', 'bg-[var(--text-primary)]')
content = content.replace('background: #f7f7f7;', 'background: var(--surface-bg);')

# Remaining text
content = content.replace('text-[#4d4d4d]', 'text-[var(--text-secondary)]')
content = content.replace('text-[#333]', 'text-[var(--text-primary)]')
content = content.replace('color: #1a1a1a;', 'color: var(--text-primary);')
content = content.replace('color: #545454;', 'color: var(--text-secondary);')

# SVG icons
content = content.replace('stroke="#1A1A1A"', 'stroke="currentColor"')
content = content.replace('fill="#E6E6E6"', 'fill="var(--card-border)"')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Remaining colors successfully replaced in index.html")
