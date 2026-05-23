"""Check how Quartz generates heading anchor IDs for Chinese headings."""
import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

public = r'G:\OpenClaw-Workspace\notes-website\public'

# Check linear algebra page
paths = [
    os.path.join(public, '📖-课堂笔记', '线性代数', '3.1_方阵的行列式.html'),
    os.path.join(public, '📖-课堂笔记', '线性代数', '1.2_行化简与阶梯形矩阵.html'),
    os.path.join(public, '📖-课堂笔记', 'COMSOL 基础培训', '02 几何建模.html'),
]

for path in paths:
    if not os.path.exists(path):
        print(f'NOT FOUND: {path}')
        continue
    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    # Find all heading IDs
    ids = re.findall(r'<h[234]\s[^>]*id="([^"]+)"', html)
    if not ids:
        ids = re.findall(r"<h[234]\s[^>]*id='([^']+)'", html)
    
    fname = os.path.basename(path).replace('.html', '')
    print(f'\n=== {fname} ===')
    for i, hid in enumerate(ids[:8]):
        print(f'  id={hid}')
    
    if not ids:
        # Try another pattern
        ids2 = re.findall(r'h[234][^>]*id[= ]([^ >"]+)', html)
        if ids2:
            print(f'  (alt) {ids2[:5]}')
        else:
            print('  No heading IDs found!')
    
    # Also search for anchor elements
    anchors = re.findall(r'<a[^>]*id="([^"]+)"[^>]*>', html)
    if anchors:
        print(f'  Anchor IDs: {anchors[:3]}')
