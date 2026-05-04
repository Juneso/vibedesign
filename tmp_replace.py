import re

css_path = "/Users/1522684/Library/Mobile Documents/com~apple~CloudDocs/Antigravity/motion-canvas/styles.css"
with open(css_path, "r") as f:
    css = f.read()

# Replace hardcoded backgrounds with new CSS variables
replacements = [
    (r'(\.device-frame\s*\{[^}]*background-color:\s*)var\(--bg-color\);', r'\1var(--dialer-bg);'),
    (r'(\.dialer-ui\s*\{[^}]*background:\s*)var\(--bg-color\);', r'\1var(--dialer-bg);'),
    (r'(\.search-bar\s*\{[^}]*background:\s*)var\(--bg-color\);', r'\1var(--dialer-bg);'),
    (r'(\.dialer-number-area\s*\{[^}]*background:\s*)var\(--bg-color\);', r'\1var(--dialer-bg);'),
    (r'(\.dialer-keypad-area\s*\{[^}]*background:\s*)var\(--bg-color\);', r'\1var(--dialer-bg);'),
    (r'(\.key\s*\{[^}]*background:\s*)var\(--bg-color\);', r'\1var(--dialer-bg);'),
    (r'(\.call-controls\s*\{[^}]*background:\s*)var\(--bg-color\);', r'\1var(--dialer-bg);'),
    (r'(\.bottom-nav\s*\{[^}]*background:\s*)var\(--bg-color\);', r'\1var(--dialer-bg);'),
    (r'(\.dialer-home-indicator\s*\{[^}]*background:\s*)var\(--bg-color\);', r'\1var(--dialer-bg);'),
    (r'(\.toast-search-bar\s*\{[^}]*background:\s*)var\(--bg-color\);', r'\1var(--toast-page-bg);'),
    (r'(\.toast-page-container\s*\{[^}]*background-color:\s*)#ffffff;', r'\1var(--toast-page-bg);')
]

for pattern, repl in replacements:
    css = re.sub(pattern, repl, css, count=0) # count=0 replaces all occurrences

# Remove redundant dark mode keys explicitly (since handled by dialer-bg automatically now)
css = re.sub(r'body\[data-theme="dark"\]\s*\.dialer-keypad-area\s*\{[^}]*\}\s*', '', css)
css = re.sub(r'body\[data-theme="dark"\]\s*\.key\s*\{[^}]*\}\s*', '', css)

with open(css_path, "w") as f:
    f.write(css)

print("Background replacements completed!")
