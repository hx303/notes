"""Verify image file existence for all note image references."""
import os, sys
sys.stdout.reconfigure(encoding='utf-8')

public = r'G:\OpenClaw-Workspace\notes-website\public'

# 1. 亲密关系读书笔记
note_dir = os.path.join(public, '🎓-讲座笔记')
imgs_1 = ['RECTIFY_IMG_20260516_200055-1.jpg', 'RECTIFY_IMG_20260516_200420.jpg',
          'RECTIFY_IMG_20260516_201333.jpg', 'RECTIFY_IMG_20260516_235145-1.jpg',
          'RECTIFY_IMG_20260517_013135.jpg', 'RECTIFY_IMG_20260517_013041-1.jpg']
print("=== 亲密关系读书笔记 ===")
for img in imgs_1:
    path = os.path.join(note_dir, img)
    exists = os.path.exists(path)
    print(f"  {'OK' if exists else 'XX'} {img}")

img_subdir = os.path.join(note_dir, '亲密关系读书笔记_图片')
if os.path.isdir(img_subdir):
    print(f"\n  Actual images in _图片/: {len(os.listdir(img_subdir))} files")
    for f in sorted(os.listdir(img_subdir)):
        print(f"    {f}")

# 2. 科研笔记 attachments
print("\n=== 科研笔记 ===")
for sub in ['🔬-科研笔记', '📖-课堂笔记/有机化学']:
    att_dir = os.path.join(public, sub, 'attachments')
    print(f"  {sub}/attachments:")
    if os.path.isdir(att_dir):
        files = sorted(os.listdir(att_dir))
        print(f"    {len(files)} files exist")
        for f in files[:3]:
            print(f"      {f}")
        if len(files) > 3:
            print(f"      ... and {len(files)-3} more")
    else:
        print(f"    XX DIRECTORY NOT FOUND")

# 3. Check if 有机化学 notes use standard markdown images
ochem_html = os.path.join(public, '📖-课堂笔记', '有机化学')
if os.path.isdir(ochem_html):
    # Find any HTML that might have img tags
    for f in os.listdir(ochem_html):
        if f.endswith('.html'):
            import re
            fpath = os.path.join(ochem_html, f)
            with open(fpath, 'r', encoding='utf-8', errors='replace') as fp:
                html = fp.read()
            imgs = re.findall(r'<img[^>]+src="([^"]+)"', html)
            if imgs:
                print(f"\n  {f}: {len(imgs)} img tags")
                for s in imgs[:5]:
                    print(f"    -> {s}")
