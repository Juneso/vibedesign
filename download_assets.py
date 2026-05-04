import re
import os
import urllib.request

output_file = "/Users/1522684/.gemini/antigravity/brain/1004dece-e237-4eeb-8e74-a6ebdc487ef4/.system_generated/steps/713/output.txt"
assets_dir = "./assets"

os.makedirs(assets_dir, exist_ok=True)

with open(output_file, 'r') as f:
    content = f.read()

urls = set(re.findall(r'http://localhost:3845/assets/[a-zA-Z0-9]+\.(?:svg|png|jpg)', content))

for url in urls:
    filename = url.split('/')[-1]
    filepath = os.path.join(assets_dir, filename)
    if not os.path.exists(filepath):
        print(f"Downloading {filename}...")
        try:
            urllib.request.urlretrieve(url, filepath)
        except Exception as e:
            print(f"Failed to download {url}: {e}")

print("Done downloading assets.")
