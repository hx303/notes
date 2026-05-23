"""Check organic chemistry notes for image rendering."""
import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

public = r'G:\OpenClaw-Workspace\notes-website\public'
ochem_dir = os.path.join(public, '📖-课堂笔记', '有机化学')

if not os.path.isdir(ochem_dir):
    print("Organic chemistry dir not found")
    sys.exit(1)

import os, re
for fname in sorted(os.listdir(ochem_dir)):
    if not fname.endswith('.html') or fname == 'index.html':
        continue
    fpath = os.path.join(ochem_dir, fname)
    with open(fpath, 'r', encoding='utf-8', errors='replace') as fp:
        html = fp.read()
    imgs = re.findall(r'<img[^>]+src="([^"]+)"', html)
    # Also check for <picture> elements
    pics = re.findall(r'<picture[^>]*>.*?</picture>', html, re.DOTALL)
    
    if imgs or pics:
        print(f"\n{fname}:")
        print(f"  <img>: {len(imgs)}, <picture>: {len(pics)}")
        for src in imgs[:3]:
            # Check if file exists
            check_path = os.path.normpath(os.path.join(os.path.dirname(fpath), src))
            exists = os.path.exists(check_path)
            print(f"  {'OK' if exists else 'XX'} {src}")
    else:
        print(f"{fname}: no images")
