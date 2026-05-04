import os
import re

def fix_file(filepath):
    if not os.path.exists(filepath):
        print(f"Skipping {filepath}")
        return
        
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Replace src="assets/ with src="/assets/
    content = re.sub(r'src="assets/', 'src="/assets/', content)
    # Replace src='assets/ with src='/assets/
    content = re.sub(r"src='assets/", "src='/assets/", content)
    
    # Replace url('assets/...) with url('/assets/...)
    content = re.sub(r"url\('assets/", "url('/assets/", content)
    content = re.sub(r'url\("assets/', 'url("/assets/', content)
    content = re.sub(r'url\(assets/', 'url(/assets/', content)
    
    # Handle lottie.js relative paths: ../../assets/ -> /assets/
    content = re.sub(r'\.\.\/\.\.\/assets\/', '/assets/', content)

    # Make script.js import config.js properly maybe? No, relative imports for JS are fine.
    
    # Also handle call-end-dark.png in app.js/script.js just in case
    # In script.js of toast:
    content = re.sub(r"'/assets/", "'/assets/", content)  # if it already has slash, no need to touch, wait. This does nothing
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

# Files to fix
files_to_fix = [
    'src/experiments/active/2026-04-09_top-gradient-adjust/index.html',
    'src/experiments/active/2026-04-09_top-gradient-adjust/style.css',
    'src/experiments/active/2026-04-09_toast-custom-shadow/index.html',
    'src/experiments/active/2026-04-09_toast-custom-shadow/style.css',
    'src/experiments/active/2026-04-09_toast-custom-shadow/script.js', 
    'src/shared/styles/tokens.css',
    'src/shared/js/lottie.js',
    'src/shared/js/animation.js',
]

for file in files_to_fix:
    fix_file(file)
