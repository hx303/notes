"""Scan ALL HTML pages for image tags."""
import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

public = r'G:\OpenClaw-Workspace\notes-website\public'

pages_with_imgs = []
pages_with_wiki = []

for dirpath, dirnames, filenames in os.walk(public):
    for f in filenames:
        if not f.endswith('.html'):
            continue
        fullpath = os.path.join(dirpath, f)
        rel = os.path.relpath(dirpath, public)
        with open(fullpath, 'r', encoding='utf-8', errors='replace') as fp:
            html = fp.read()

        imgs = re.findall(r'<img[^>]+src="([^"]+)"', html)
        if imgs:
            pages_with_imgs.append((rel, f, len(imgs), imgs[:3]))

        # Check if !![[ syntax leaked through (wasn't processed)
        if '![' in html and len(imgs) == 0:
            pages_with_wiki.append((rel, f))

print("=== PAGES WITH <img> TAGS ===")
for rel, fname, count, sample_srcs in pages_with_imgs:
    prefix = os.path.join(rel, fname)
    print(f"  [{count} imgs] {prefix}")
    for s in sample_srcs:
        print(f"    -> {s}")

print(f"\n=== PAGES WITH POTENTIAL WIKI_IMG (no <img> but has '![') ===")
for rel, fname in pages_with_wiki:
    print(f"  {rel}/{fname}")

print(f"\nTotal pages: searched all HTML")
print(f"Pages with <img>: {len(pages_with_imgs)}")
print(f"Pages with potential wiki-img issues: {len(pages_with_wiki)}")
