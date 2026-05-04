import re

css_path = "/Users/1522684/Library/Mobile Documents/com~apple~CloudDocs/Antigravity/motion-canvas/styles.css"
with open(css_path, "r") as f:
    css = f.read()

# 1. Update text colors, borders and background transparencies correctly
replacements = [
    # General Text Colors
    (r'(\.toast-page-container\s*\{[^}]*color:\s*)#1a1a1a;', r'\1var(--text-primary);'),
    (r'(\.dialer-number h1\s*\{[^}]*color:\s*)#1a1a1a;', r'\1var(--text-primary);'),
    (r'(\.key\s*\{[^}]*color:\s*)#1a1a1a;', r'\1var(--text-primary);'),
    (r'(\.ko\s*\{[^}]*color:\s*)rgba\(0,\s*0,\s*0,\s*0\.8\);', r'\1var(--text-secondary);'),
    (r'(\.en\s*\{[^}]*color:\s*)rgba\(0,\s*0,\s*0,\s*0\.6\);', r'\1var(--text-tertiary);'),
    (r'(\.nav-item\.active span\s*\{[^}]*color:\s*)#1a1a1a;', r'\1var(--text-primary);'),
    (r'(\.nav-item span\s*\{[^}]*color:\s*)#808080;', r'\1var(--text-tertiary);'),
    (r'(\.search-input span\s*\{[^}]*color:\s*)#909090;', r'\1var(--text-tertiary);'),
    (r'(\.search-target\s*\{[^}]*color:\s*)#1a1a1a;', r'\1var(--text-primary);'),
    (r'(\.toast-tab\s*\{[^}]*color:\s*)#4d4d4d;', r'\1var(--text-secondary);'),
    (r'(\.toast-tab\.active\s*\{[^}]*color:\s*)#1a1a1a;', r'\1var(--text-primary);'),
    (r'(\.toast-tab\.active\s*\{[^}]*border-bottom:\s*2px solid\s*)#1a1a1a;', r'\1var(--text-primary);'),
    (r'(\.loc-btn,\s*\.filter-btn\s*\{[^}]*color:\s*)#808080;', r'\1var(--text-tertiary);'),
    (r'(\.filter-btn\.active\s*\{[^}]*color:\s*)#1a1a1a;', r'\1var(--text-primary);'),
    (r'(\.biz-title\s*\{[^}]*color:\s*)#1a1a1a;', r'\1var(--text-primary);'),
    (r'(\.biz-info\s*\{[^}]*color:\s*)#4d4d4d;', r'\1var(--text-secondary);'),
    (r'(\.biz-dist\s*\{[^}]*color:\s*)#959595;', r'\1var(--text-tertiary);'),
    (r'(\.contact-name\s*\{[^}]*color:\s*)#1a1a1a;', r'\1var(--text-primary);'),
    (r'(\.contact-recent\s*\{[^}]*color:\s*)#4d4d4d;', r'\1var(--text-secondary);'),
    (r'(\.banner-main\s*\{[^}]*color:\s*)#444;', r'\1var(--text-primary);'),
    (r'(\.banner-sub\s*\{[^}]*color:\s*)#777;', r'\1var(--text-secondary);'),
    
    # Borders & Lines
    (r'(\.toast-search-header\s*\{[^}]*background-color:\s*)#ffffff;', r'\1transparent;'),
    (r'(\.toast-tab-bar\s*\{[^}]*border-bottom:\s*1px solid\s*)#f5f5f5;', r'\1var(--card-border);'),
    (r'(\.toast-sub-header\s*\{[^}]*border-bottom:\s*1px solid\s*)#f5f5f5;', r'\1var(--card-border);'),
    (r'(\.biz-result-item\s*\{[^}]*border-bottom:\s*1px solid\s*)#f5f5f5;', r'\1var(--card-border);'),
    (r'(\.toast-search-bar\s*\{[^}]*border:\s*1px solid\s*)#f0f0f0;', r'\1var(--card-border);'),
    (r'(\.v-line\s*\{[^}]*background-color:\s*)#e6e6e6;', r'\1var(--card-border);'),
    (r'(\.biz-info \.dot\s*\{[^}]*background-color:\s*)#e6e6e6;', r'\1var(--card-border);'),
    (r'(\.biz-call-btn\s*\{[^}]*background-color:\s*)#ffffff;', r'\1transparent;'),
    (r'(\.biz-call-btn\s*\{[^}]*border:\s*1px solid\s*)#e6e6e6;', r'\1var(--card-border);'),
    (r'(\.contact-sync-banner\s*\{[^}]*border-top:\s*1px solid\s*)#F5F5F5;', r'\1var(--card-border);'),
    (r'(\.contact-sync-banner\s*\{[^}]*border-bottom:\s*1px solid\s*)#F5F5F5;', r'\1var(--card-border);'),
    (r'(\.search-input\s*\{[^}]*border:\s*1px solid\s*)#f0f0f0;', r'\1var(--card-border);'),
    (r'(\.bottom-nav\s*\{[^}]*border-top:\s*1px solid\s*)#ebebeb;', r'\1var(--card-border);'),
    (r'(\.dialer-home-indicator-bar\s*\{[^}]*background:\s*)#121214;', r'\1var(--text-primary);'),
    
    # SVG & Icons Edge Cases
    (r'(\.btn-video\s*\{[^}]*background-image:\s*)url\([^)]+\);', r'\1var(--btn-video-img, url(\'assets/044193b46e9718bb044e9d6bc1b19cfeb5772bed.svg\'));\n  border: var(--btn-video-border, none);'),
    (r'(\.key\.glyph \.asterisk\s*\{[^}]*object-fit:\s*contain;)', r'\1\n  filter: var(--icon-filter, none);'),
    (r'(\.key\.glyph \.asterisk-sub\s*\{[^}]*object-fit:\s*contain;)', r'\1\n  filter: var(--icon-filter, none);')
]

for pattern, repl in replacements:
    css = re.sub(pattern, repl, css, count=0)

# Inject the variables to Root & Dark mode overrides
root_vars = """  --toast-page-bg: #ffffff;
  --icon-filter: none;
  --btn-video-img: url('assets/044193b46e9718bb044e9d6bc1b19cfeb5772bed.svg');
  --btn-video-border: none;"""

dark_vars = """  --toast-page-bg: #1a1a1a;
  --icon-filter: brightness(0) invert(1);
  --btn-video-img: none;
  --btn-video-border: 1px solid var(--card-border);"""

css = css.replace("--toast-page-bg: #ffffff;", root_vars)
css = css.replace("--toast-page-bg: #1a1a1a;", dark_vars)

with open(css_path, "w") as f:
    f.write(css)

print("Text, Color, Border logic synchronized seamlessly!")
