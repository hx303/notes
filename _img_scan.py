import os, re
root = r'G:\OpenClaw-Workspace\notes-website\content'

imgs = []
for dirpath, dirnames, filenames in os.walk(root):
    for f in filenames:
        if f.endswith('.md'):
            path = os.path.join(dirpath, f)
            with open(path, encoding='utf-8', errors='ignore') as fh:
                content = fh.read()
            found = re.findall(r'!\[(.*?)\]\((.*?)\)', content)
            for alt, src in found:
                if any(src.endswith(ext) for ext in ['.png','.jpg','.jpeg','.gif','.webp','.svg']):
                    rel = os.path.relpath(path, root)
                    has_caption = len(alt.strip()) > 0
                    imgs.append((rel, alt, src, has_caption))

print(f'Total images: {len(imgs)}')
print(f'With caption: {sum(1 for _,_,_,c in imgs if c)}')
print(f'Without caption: {sum(1 for _,_,_,c in imgs if not c)}')
print()
for rel, alt, src, c in imgs:
    status = "Y" if c else "N"
    print(f'  [{status}] {rel}')
    print(f'       ![{alt[:50]}]({src[:60]})')
