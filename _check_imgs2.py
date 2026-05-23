"""Check image rendering in specific notes."""
import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

public = r'G:\OpenClaw-Workspace\notes-website\public'

# Find specific HTML pages by walking the tree
results = {}

for dirpath, dirnames, filenames in os.walk(public):
    for f in filenames:
        if not f.endswith('.html'):
            continue
        fullpath = os.path.join(dirpath, f)
        if '亲密关系' in fullpath and fullpath.endswith('index.html'):
            results['亲密关系读书笔记'] = fullpath
        elif 'SrSeO3' in fullpath and fullpath.endswith('index.html'):
            results['SrSeO3'] = fullpath
        elif '太阳能电池物理' in fullpath and fullpath.endswith('index.html'):
            results['太阳能电池'] = fullpath
        elif '有机化学' in fullpath and 'attachments' not in fullpath and f != 'index.html':
            results.setdefault('有机化学_sample', []).append(fullpath)
        elif '炔烃' in fullpath and fullpath.endswith('index.html'):
            results['炔烃'] = fullpath

for name, path in results.items():
    if isinstance(path, list):
        path = path[0] if path else None
    if not path or not os.path.exists(path):
        print(f"[{name}] NOT FOUND")
        continue
    with open(path, 'r', encoding='utf-8') as fp:
        html = fp.read()

    # Count img tags
    imgs = re.findall(r'<img[^>]+>', html)
    print(f"\n[{name}] ({path})")
    print(f"  Total <img> tags: {len(imgs)}")

    if not imgs:
        # Check for picture/source
        pics = re.findall(r'<picture[^>]*>.*?</picture>', html, re.DOTALL)
        print(f"  Total <picture> tags: {len(pics)}")
        # Also check if [[ ]] image syntax was left as-is (not processed)
        wiki_imgs = re.findall(r'!\[\[', html)
        print(f"  Raw '![[' occurrences: {len(wiki_imgs)}")
        continue

    for img in imgs[:8]:
        src_m = re.search(r'src="([^"]+)"', img)
        src = src_m.group(1) if src_m else "?"
        alt_m = re.search(r'alt="([^"]*)"', img)
        alt = alt_m.group(1) if alt_m else ""

        # Determine if src would resolve
        if src.startswith('http'):
            exists = "external"
        else:
            check_path = os.path.join(os.path.dirname(path), src)
            exists = os.path.exists(os.path.normpath(check_path))
        status = "OK" if exists == True else "MISSING"
        print(f"  [{status}] {src}")
