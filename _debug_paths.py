"""Debug Quartz image path generation."""
import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

public = r'G:\OpenClaw-Workspace\notes-website\public'

# Check 亲密关系读书笔记
html_path = os.path.join(public, '🎓-讲座笔记', '亲密关系读书笔记.html')
img_dir = os.path.join(public, '🎓-讲座笔记', '亲密关系读书笔记_图片')
alt_img_dir = os.path.join(public, '亲密关系读书笔记_图片')

print(f'HTML: {html_path}')
print(f'HTML exists: {os.path.exists(html_path)}')
print(f'Image dir: {img_dir}')
print(f'Image dir exists: {os.path.isdir(img_dir)}')
print(f'Alt image dir: {alt_img_dir}')
print(f'Alt image dir exists: {os.path.isdir(alt_img_dir)}')

# Read HTML and check img tags
if os.path.exists(html_path):
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    # Find img src using regex without escaping issues
    pattern = r'src="([^"]+)"'
    srcs = re.findall(pattern, html)
    img_srcs = []
    for src in srcs:
        if any(ext in src.lower() for ext in ['.jpg', '.png', '.jpeg', '.gif', '.webp']):
            img_srcs.append(src)
    
    print(f'\nImage srcs found in HTML ({len(img_srcs)}):')
    for src in img_srcs[:3]:
        html_dir = os.path.dirname(html_path)
        resolved = os.path.normpath(os.path.join(html_dir, src))
        exists = os.path.exists(resolved)
        print(f'  src: {src}')
        print(f'  resolves to: {resolved}')
        print(f'  exists: {exists}')
        print()

# Also check markdown source to confirm what we wrote
md_path = r'G:\OpenClaw-Workspace\notes-website\content\🎓 讲座笔记\亲密关系读书笔记.md'
with open(md_path, 'r', encoding='utf-8') as f:
    md = f.read()

# Find image lines
for line in md.split('\n'):
    if '亲密关系读书笔记_图片' in line:
        print(f'MARKDOWN: {line.strip()[:120]}')
