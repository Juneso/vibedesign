import re

def main():
    with open('styles.css', 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Write tokens.css
    with open('src/shared/styles/tokens.css', 'w', encoding='utf-8') as f:
        f.writelines(lines[0:82]) # Roughly based on the dark theme block ending around line 82

    # Write base.css
    with open('src/shared/styles/base.css', 'w', encoding='utf-8') as f:
        f.writelines(lines[83:106]) 

    # Write shell.css
    with open('src/shared/styles/shell.css', 'w', encoding='utf-8') as f:
        f.writelines(lines[106:226])
        # Also need the mobile nav overlay which is at the end of styles.css
        # I'll append it later using python regex

    # Write device.css
    with open('src/shared/styles/device.css', 'w', encoding='utf-8') as f:
        f.writelines(lines[226:298])

    # For experiments... let's identify the mobile nav overlay first
    css_content = "".join(lines)
    mobile_nav_match = re.search(r'(/\* 📱 모바일 네비게이션 오버레이.*\n)(.*)', css_content, re.DOTALL | re.IGNORECASE)
    if mobile_nav_match:
        with open('src/shared/styles/shell.css', 'a', encoding='utf-8') as f:
            f.write("\n" + mobile_nav_match.group(1) + mobile_nav_match.group(2))

if __name__ == '__main__':
    main()
