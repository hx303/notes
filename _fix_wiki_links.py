"""Task A: Fix all broken wiki links [[...]] in Quartz + Obsidian content.

Categories:
1. [[#section|alias]]  → [alias](#section-id)  (intra-page anchor)
2. [[DeadPage|alias]]  → alias                (dead cross-page link → text)
3. [[DeadPage]]        → DeadPage             (dead cross-page link → text)
4. [[WorkingPage|X]]   → leave as-is          (OFM handles these)
"""
import os, re, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')

CONTENT = Path(r'G:\OpenClaw-Workspace\notes-website\content')
OBSIDIAN = Path(r'D:\Obsidian\notes\覆水知识库\notes')

# Collect all valid page names
all_stems = set()
for md in CONTENT.rglob('*.md'):
    all_stems.add(md.stem)
for md in OBSIDIAN.rglob('*.md'):
    all_stems.add(md.stem)


def anchor_slug(heading_text):
    """Convert heading text to Quartz anchor ID (github-slugger for Chinese).
    
    github-slugger removes 、 () （） ？ ！ etc. from Chinese text,
    keeps Chinese chars and spaces.
    """
    # Remove Chinese-specific punctuation that github-slugger strips
    result = heading_text
    for ch in '、（）（）？！《》，。；：""''【】':
        result = result.replace(ch, '')
    # Remove non-CJK word-breaking chars
    result = re.sub(r'[^\w\u4e00-\u9fff\s-]', '', result)
    return result.strip()


def fix_wiki_links(content, file_stem):
    """Fix broken [[...]] wiki links in content."""
    
    def replacer(m):
        inner = m.group(1)
        original = f'[[{inner}]]'
        
        # Split by | for alias, then by # for anchor
        # Cases:
        # inner = "#section|alias"
        # inner = "#section"
        # inner = "page|alias"
        # inner = "page"
        # inner = "page#section|alias"
        # inner = "page#section"
        
        has_anchor = '#' in inner
        has_alias = '|' in inner
        
        # Parse the inner content
        alias = None
        anchor = None
        
        if has_alias and has_anchor:
            # [[page#section|alias]]
            parts = inner.split('|', 1)
            path_part = parts[0]
            alias = parts[1]
            if '#' in path_part:
                page_part, anchor = path_part.split('#', 1)
            else:
                page_part = path_part
        elif has_alias:
            # [[page|alias]]
            page_part, alias = inner.split('|', 1)
        elif has_anchor:
            # [[page#section]] or [[#section]]
            if inner.startswith('#'):
                page_part = ''
                anchor = inner[1:]
            else:
                page_part, anchor = inner.split('#', 1)
        else:
            # [[page]]
            page_part = inner
            alias = inner
        
        # If it's an intra-page anchor (no page part or page part is empty)
        if page_part == '':
            # [[#section]] or [[#section|alias]]
            target = anchor or ''
            display = alias or target
            anchor_id = anchor_slug(target)
            return f'[{display}](#{anchor_id})'
        
        # Cross-page link
        # Check if target page exists
        target_name = page_part.split('/')[-1] if '/' in page_part else page_part
        
        if target_name in all_stems:
            # Page exists — OFM handles it, leave as-is
            return original
        
        # Page doesn't exist — convert to text
        display = alias or page_part
        return display
    
    # Find all [[...]] that are NOT ![[...]] (image embeds)
    fixed = re.sub(r'(?<!!)\[\[([^\[\]]+)\]\]', replacer, content)
    return fixed


# Process all affected files
files_to_fix = [
    # Quartz content
    r'📖 课堂笔记\线性代数\1.2_行化简与阶梯形矩阵.md',
    r'📖 课堂笔记\线性代数\2.1&2.2_矩阵的代数运算.md',
    r'📖 课堂笔记\线性代数\2.3_逆矩阵.md',
    r'📖 课堂笔记\线性代数\2.4_转置矩阵与特殊方阵.md',
    r'📖 课堂笔记\线性代数\2.5_分块矩阵.md',
    r'📖 课堂笔记\线性代数\3.1_方阵的行列式.md',
    r'📖 课堂笔记\线性代数\3.2_行列式的主要性质.md',
    r'📖 课堂笔记\线性代数\3.3_行列式的应用.md',
    r'📖 课堂笔记\线性代数\4.1&4.2_向量的线性相关与线性无关.md',
    r'📖 课堂笔记\中国近代史\五四运动与中共讲座笔记.md',
    r'📖 课堂笔记\中国近代史\清代多语政治讲座笔记.md',
    r'📖 课堂笔记\军事理论\强军思想解析讲座笔记.md',
    r'📖 课堂笔记\大学物理\导体、电容与电介质_辅导课笔记.md',
    r'📖 课堂笔记\大学物理\高斯定理与电势讲座笔记.md',
    r'📖 课堂笔记\有机化学\第十六章_烷烃.md',
    r'COMSOL\02 几何建模.md',
    r'📖 课堂笔记\COMSOL 基础培训\02 几何建模.md',
]

fixed_count = 0
for rel in files_to_fix:
    qpath = CONTENT / rel
    opath = OBSIDIAN / rel
    
    for target in [qpath, opath]:
        if not target.exists():
            continue
        with open(target, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original = content
        fixed = fix_wiki_links(content, target.stem)
        
        if fixed != original:
            with open(target, 'w', encoding='utf-8') as f:
                f.write(fixed)
            # Count changes
            changes = len(re.findall(r'(?<!!)\[\[([^\[\]]+)\]\]', original))
            kept = len(re.findall(r'(?<!!)\[\[([^\[\]]+)\]\]', fixed))
            print(f'FIXED: {os.path.basename(str(target))} ({changes - kept} links changed)')
            fixed_count += 1
        else:
            print(f'(no changes needed): {os.path.basename(str(target))}')

print(f'\nTotal files fixed: {fixed_count}')
