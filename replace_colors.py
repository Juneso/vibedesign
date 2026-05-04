import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Substitutions mapping for backgrounds
content = content.replace('!bg-[#f5f5f5]', '!bg-[var(--surface-bg)]')
content = content.replace('bg-[#f7f7f7]', 'bg-[var(--surface-bg)]')
content = content.replace('bg-white', 'bg-[var(--card-bg)]')

# Substitutions mapping for text
content = content.replace('text-[#1a1a1a]', 'text-[var(--text-primary)]')
content = content.replace('text-[#444]', 'text-[var(--text-primary)]')
content = content.replace('text-[#4263eb]', 'text-[var(--accent-blue)]')
content = content.replace('text-[#808080]', 'text-[var(--text-secondary)]')
content = content.replace('text-[#6e6e6e]', 'text-[var(--text-secondary)]')
content = content.replace('text-[#777]', 'text-[var(--text-secondary)]')

# Substitutions mapping for borders
content = content.replace('border-[#ebebeb]', 'border-[var(--card-border)]')
content = content.replace('border-[#e6e6e6]', 'border-[var(--card-border)]')

# Substitutions mapping for specific inline styles
content = content.replace('background: white;', 'background: var(--card-bg);')
content = content.replace('background: #f2f3f8;', 'background: var(--surface-bg);')
content = content.replace('border: 1px solid #e6e6e6;', 'border: 1px solid var(--card-border);')
content = content.replace('color: #4263eb;', 'color: var(--accent-blue);')
content = content.replace('stroke="#26282b"', 'stroke="currentColor"')
content = content.replace('fill="#1a1a1a"', 'fill="currentColor"')
content = content.replace('stroke="#ECEEF3"', 'stroke="currentColor"')

# Let's fix specific layouts
content = content.replace('device-frame !bg-[var(--surface-bg)] flex flex-col', 'device-frame  flex flex-col')
content = content.replace('w-full bg-[var(--card-bg)] relative flex', 'w-full relative flex')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Colors successfully replaced in index.html")
