"""Fix ALL wiki-style image embeds: ![[...]] -> ![](relative/path).

The issue: Quartz's ObsidianFlavoredMarkdown generates img src with an extra ../ 
that breaks all wiki-style image embeds. Fix: use standard Markdown ![]() syntax.
"""
import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

content_root = r'G:\OpenClaw-Workspace\notes-website\content'
obsidian_root = r'D:\Obsidian\notes\覆水知识库\notes'

# Files to fix (content relative paths)
FILES_TO_FIX = [
    # 亲密关系读书笔记
    r'🎓 讲座笔记\亲密关系读书笔记.md',
    # 科研笔记
    r'🔬 科研笔记\SrSeO3基质稀土离子掺杂发光晶体研究.md',
    r'🔬 科研笔记\太阳能电池物理原理及其效率提升策略分析.md',
]

total_fixed = 0

for rel_path in FILES_TO_FIX:
    quartz_path = os.path.join(content_root, rel_path)
    obsidian_path = os.path.join(obsidian_root, rel_path)

    for target_path in [obsidian_path, quartz_path]:
        if not os.path.exists(target_path):
            print(f"SKIP (not found): {target_path}")
            continue

        with open(target_path, 'r', encoding='utf-8') as f:
            content = f.read()

        original = content

        # Replace ![[path/to/image.jpg]] with ![](./path/to/image.jpg)
        # Pattern: ![[X]] where X might contain |size suffix
        def replace_wiki_img(m):
            inner = m.group(1)
            # Strip |size suffix
            path = inner.split('|')[0].strip()
            # Note: same-directory images, use ./ prefix
            return f'![]({path})'

        content = re.sub(r'!\[\[([^\]]+)\]\]', replace_wiki_img, content)

        if content != original:
            with open(target_path, 'w', encoding='utf-8') as f:
                f.write(content)
            count = len(re.findall(r'!\[\]\(', content)) - len(re.findall(r'!\[\]\(', original))
            print(f"FIXED: {target_path}")
            total_fixed += 1
        else:
            print(f"(no wiki images found): {target_path}")

print(f"\nTotal files fixed: {total_fixed}")
