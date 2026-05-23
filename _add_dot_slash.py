"""Add ./ prefix to image paths to prevent Quartz CrawlLinks from adding ../"""
import os, sys
sys.stdout.reconfigure(encoding='utf-8')

files_to_fix = [
    r'G:\OpenClaw-Workspace\notes-website\content\🎓 讲座笔记\亲密关系读书笔记.md',
    r'D:\Obsidian\notes\覆水知识库\notes\🎓 讲座笔记\亲密关系读书笔记.md',
    r'G:\OpenClaw-Workspace\notes-website\content\🔬 科研笔记\SrSeO3基质稀土离子掺杂发光晶体研究.md',
    r'D:\Obsidian\notes\覆水知识库\notes\🔬 科研笔记\SrSeO3基质稀土离子掺杂发光晶体研究.md',
    r'G:\OpenClaw-Workspace\notes-website\content\🔬 科研笔记\太阳能电池物理原理及其效率提升策略分析.md',
    r'D:\Obsidian\notes\覆水知识库\notes\🔬 科研笔记\太阳能电池物理原理及其效率提升策略分析.md',
]

# Replace patterns: ![](path) -> ![](./path)
replacements = [
    ('](亲密关系读书笔记_图片/', '](./亲密关系读书笔记_图片/'),
    ('](attachments/', '](./attachments/'),
]

for target in files_to_fix:
    if not os.path.exists(target):
        print(f'SKIP: {target}')
        continue
    with open(target, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content
    for old, new in replacements:
        content = content.replace(old, new)
    if content != original:
        with open(target, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'FIXED: {os.path.basename(target)}')
    else:
        print(f'(no change): {os.path.basename(target)}')
