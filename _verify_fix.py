"""Verify the image fixes: check HTML output for correct image references."""
import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

public = r'G:\OpenClaw-Workspace\notes-website\public'

# 1. 亲密关系读书笔记
note_html = os.path.join(public, '🎓-讲座笔记', '亲密关系读书笔记.html')
with open(note_html, 'r', encoding='utf-8') as f:
    html = f.read()

imgs = re.findall(r'<img[^>]+src="([^"]+)"', html)
print(f'=== 亲密关系读书笔记 ({len(imgs)} images) ===')
all_ok = True
for src in imgs:
    check_path = os.path.normpath(os.path.join(os.path.dirname(note_html), src))
    exists = os.path.exists(check_path)
    all_ok = all_ok and exists
    print(f'  {"OK" if exists else "XX"} {src}')
print(f'  All images OK: {all_ok}')

# 2. 大学物理 导体电容
phys_html = os.path.join(public, '📖-课堂笔记', '大学物理', '导体、电容与电介质_辅导课笔记.html')
if os.path.exists(phys_html):
    with open(phys_html, 'r', encoding='utf-8') as f:
        html = f.read()
    imgs2 = re.findall(r'<img[^>]+src="([^"]+)"', html)
    print(f'\n=== 大学物理/导体电容 ({len(imgs2)} images) ===')
    if imgs2:
        for src in imgs2:
            print(f'  {src}')
    else:
        print('  No broken images — pseudo-img successfully removed!')

# 3. Quick summary of all pages with images
print(f'\n=== All pages with <img> tags ===')
for dirpath, dirnames, filenames in os.walk(public):
    for f in filenames:
        if not f.endswith('.html'):
            continue
        fpath = os.path.join(dirpath, f)
        with open(fpath, 'r', encoding='utf-8', errors='replace') as fp:
            html = fp.read()
        imgs = re.findall(r'<img[^>]+src="([^"]+)"', html)
        if imgs:
            rel = os.path.relpath(fpath, public)
            missing = 0
            for src in imgs:
                check_path = os.path.normpath(os.path.join(os.path.dirname(fpath), src))
                if not os.path.exists(check_path):
                    missing += 1
            status = "ALL OK" if missing == 0 else f"{missing}/{len(imgs)} MISSING"
            print(f'  [{status}] {rel}')
