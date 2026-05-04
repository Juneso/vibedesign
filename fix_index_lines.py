with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

del lines[2357:2358]
del lines[1906:2101]
del lines[63:67]

# Insert left gradient
for i, line in enumerate(lines):
    if 'id="ai-top-gradient-recent-gradient-adjust"' in line:
        lines.insert(i + 1, '                <div class="ai-left-gradient" id="ai-left-gradient-adjust"></div>\n')
        break

with open('index.html', 'w', encoding='utf-8') as f:
    f.writelines(lines)
print("Fixed duplicates by exact line indices")
