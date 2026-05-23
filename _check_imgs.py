"""Check how images are rendered in built HTML."""
import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

public = r'G:\OpenClaw-Workspace\notes-website\public'

# Find all HTML files
html_files = []
for dirpath, dirnames, filenames in os.walk(public):
    for f in filenames:
        if f == 'index.html':
            rel = os.path.relpath(dirpath, public)
            html_files.append((rel, os.path.join(dirpath, f)))

print(f"Found {len(html_files)} HTML pages\n")

for rel, fpath in sorted(html_files):
    with open(fpath, 'r', encoding='utf-8') as f:
        html = f.read()
    imgs = re.findall(r'<img[^>]+>', html)
    if not imgs:
        continue
    print(f"--- {rel} ({len(imgs)} images) ---")
    for img in imgs:
        src_m = re.search(r'src="([^"]+)"', img)
        alt_m = re.search(r'alt="([^"]*)"', img)
        src = src_m.group(1) if src_m else "?"
        alt = alt_m.group(1) if alt_m else ""
        # Check if src file exists
        if src.startswith('/'):
            src_path = public + src
        elif src.startswith('http'):
            src_path = None
        else:
            src_path = os.path.join(os.path.dirname(fpath), src)
        exists = os.path.exists(src_path) if src_path else "external"
        status = "OK" if exists == True else ("MISSING" if exists == False else exists)
        print(f"  [{status}] src={src}")
    print()
