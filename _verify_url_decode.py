"""Verify images after Quartz build, handling URL-encoded paths."""
import os, re, sys
from urllib.parse import unquote

sys.stdout.reconfigure(encoding='utf-8')
public = r'G:\OpenClaw-Workspace\notes-website\public'

# Check all pages with images
pages = {
    '亲密关系': os.path.join(public, '🎓-讲座笔记', '亲密关系读书笔记.html'),
    'SrSeO3': os.path.join(public, '🔬-科研笔记', 'SrSeO3基质稀土离子掺杂发光晶体研究.html'),
    '太阳能电池': os.path.join(public, '🔬-科研笔记', '太阳能电池物理原理及其效率提升策略分析.html'),
}

all_ok = True
for name, html_path in pages.items():
    if not os.path.exists(html_path):
        print(f'SKIP {name}: no HTML')
        continue
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    # Find image srcs
    img_tags = re.findall(r'<img[^>]*>', html)
    imgs = []
    for tag in img_tags:
        m = re.search(r'src="([^"]+)"', tag)
        if m:
            imgs.append(m.group(1))
    
    print(f'=== {name} ({len(imgs)} images) ===')
    html_dir = os.path.dirname(html_path)
    page_ok = True
    for src in imgs:
        decoded = unquote(src)  # Decode URL-encoded Chinese characters
        resolved = os.path.normpath(os.path.join(html_dir, decoded))
        exists = os.path.exists(resolved)
        if not exists:
            page_ok = False
            all_ok = False
        status = 'OK' if exists else 'MISSING'
        print(f'  [{status}] {decoded[:70]}')
    print(f'  Page all OK: {page_ok}')
    print()

print(f'ALL IMAGES WORKING: {all_ok}')
