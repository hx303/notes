"""Merge Obsidian vault and Quartz content before creating junction."""
import sys, shutil, re
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')

OBSIDIAN = Path(r'D:\Obsidian\notes\覆水知识库\notes')
QUARTZ = Path(r'G:\OpenClaw-Workspace\notes-website\content')

# Files newer in Obsidian (user edits not yet in Quartz)
OBS_NEWER = [
    r'🎓 讲座笔记\亲密关系读书笔记.md',
    r'🎬 视频笔记\meta_game_analysis.md',
    r'🎬 视频笔记\meta_game_philosophy_analysis.md',
    r'📖 课堂笔记\中华民族发展史\从华夷之辨到天下一家.md',
    r'📖 课堂笔记\大学物理\补充_惯性系与伽利略变换.md',
    r'📖 课堂笔记\大学物理\高斯定理与电势.md',
]

# Files newer in Quartz (wiki link + emoji fixes)
QZ_NEWER = [
    r'🎓 讲座笔记\index.md',
    r'🎬 视频笔记\index.md',
    r'📖 课堂笔记\COMSOL 基础培训\02 几何建模.md',
    r'📖 课堂笔记\COMSOL 基础培训\03 网格划分.md',
    r'📖 课堂笔记\COMSOL 基础培训\COMSOL 基础培训_总索引.md',
    r'📖 课堂笔记\COMSOL 基础培训\index.md',
    r'📖 课堂笔记\中华民族发展史\index.md',
    r'📖 课堂笔记\中华民族发展史\元明两代藏地流迁史.md',
    r'📖 课堂笔记\中华民族发展史\明代西藏关系探析——柔性治理与多元一体.md',
    r'📖 课堂笔记\中国近代史\index.md',
    r'📖 课堂笔记\中国近代史\五四运动与中共讲座笔记.md',
    r'📖 课堂笔记\军事理论\index.md',
    r'📖 课堂笔记\军事理论\强军思想解析讲座笔记.md',
    r'📖 课堂笔记\大学物理\index.md',
    r'📖 课堂笔记\大学物理\导体、电容与电介质.md',
    r'📖 课堂笔记\大学物理\第一章_质点的运动.md',
    r'📖 课堂笔记\大学物理\第三章_质点系的运动定理.md',
    r'📖 课堂笔记\大学物理\第二章_质点的运动定理.md',
    r'📖 课堂笔记\大学物理\第五章_真空中的静电场.md',
    r'📖 课堂笔记\大学物理\第四章_刚体的转动.md',
    r'📖 课堂笔记\微积分上\index.md',
    r'📖 课堂笔记\微积分上\微积分-§1.4 无穷小量.md',
    r'📖 课堂笔记\微积分下\index.md',
    r'📖 课堂笔记\思政与社会\index.md',
    r'📖 课堂笔记\有机化学\index.md',
    r'📖 课堂笔记\有机化学\第十七章_不饱和烃.md',
    r'📖 课堂笔记\有机化学\第十八章_脂环烃.md',
    r'📖 课堂笔记\有机化学\第十六章_烷烃.md',
    r'📖 课堂笔记\线性代数\index.md',
    r'📖 课堂笔记\计算机科学\index.md',
    r'📚 文献检索\index.md',
    r'🔬 科研笔记\index.md',
]

# Only in Quartz
QZ_ONLY = ['index.md', r'线性代数\index.md']

# Build slug map for wiki link conversion
slug_map = {}
for f in QUARTZ.rglob('*.md'):
    slug_map[f.stem] = str(f.relative_to(QUARTZ)).replace('\\', '/')

def convert_wiki_links(text):
    """Convert [[target]] and [[target|alias]] to standard MD links."""
    def replace_link(m):
        inner = m.group(1)
        target = inner
        alias = None
        anchor = None
        if '|' in inner:
            parts = inner.split('|', 1)
            target = parts[0]
            alias = parts[1]
        if '#' in target:
            parts = target.split('#', 1)
            target = parts[0]
            anchor = parts[1]
        target_slug = None
        if target in slug_map:
            target_slug = target
        else:
            target_name = target.split('/')[-1] if '/' in target else target
            for k in slug_map:
                if k == target_name:
                    target_slug = k
                    break
        if not target_slug:
            return m.group(0)
        display = alias if alias else target
        link = target_slug
        if anchor:
            link += '#' + anchor
        return f'[{display}]({link})'
    return re.sub(r'(?<!!)\[\[([^\]]+)\]\]', replace_link, text)

def fix_math_emoji(text):
    REPLACEMENTS = {
        '✗': '\\times', '✅': '\\checkmark', '❌': '\\times',
        '⚠️': '', '📌': '', '💡': '', '📝': '', '🔬': '', '🎤': '', '🔥': '',
        '📖': '', '📚': '', '📘': '',
    }
    def fix_block(m):
        full = m.group(0)
        body = m.group(1)
        if not any(c in body for c in REPLACEMENTS):
            return full
        new_body = body
        for old, new in REPLACEMENTS.items():
            if old in new_body:
                new_body = new_body.replace(old, new)
        if '\n' in body:
            return '$$\n' + new_body.strip('\n') + '\n$$'
        else:
            return '$$' + new_body + '$$'
    return re.sub(r'\$\$([\s\S]*?)\$\$', fix_block, text)


print("=" * 60)
print("Step 1: Sync Obsidian → Quartz (6 user-edited files)")
print("=" * 60)

for rel_path in OBS_NEWER:
    obs_file = OBSIDIAN / rel_path
    qz_file = QUARTZ / rel_path
    
    if obs_file.exists():
        txt = obs_file.read_text(encoding='utf-8')
        
        # Apply wiki link + emoji fixes
        txt = convert_wiki_links(txt)
        txt = fix_math_emoji(txt)
        
        qz_file.parent.mkdir(parents=True, exist_ok=True)
        qz_file.write_text(txt, encoding='utf-8')
        print(f"  Copied + fixed: {rel_path}")
    else:
        print(f"  SKIPPED (not found): {rel_path}")

print()
print("=" * 60)
print("Step 2: Sync Quartz → Obsidian (32 wiki-fixed files)")
print("=" * 60)

for rel_path in QZ_NEWER:
    obs_file = OBSIDIAN / rel_path
    qz_file = QUARTZ / rel_path
    
    if qz_file.exists():
        txt = qz_file.read_text(encoding='utf-8')
        obs_file.parent.mkdir(parents=True, exist_ok=True)
        obs_file.write_text(txt, encoding='utf-8')
        print(f"  Copied: {rel_path}")
    else:
        print(f"  SKIPPED (not found): {rel_path}")

print()
print("=" * 60)
print("Step 3: Handle Quartz-only files")
print("=" * 60)

for rel_path in QZ_ONLY:
    qz_file = QUARTZ / rel_path
    obs_file = OBSIDIAN / rel_path
    
    if qz_file.exists():
        txt = qz_file.read_text(encoding='utf-8')
        obs_file.parent.mkdir(parents=True, exist_ok=True)
        obs_file.write_text(txt, encoding='utf-8')
        print(f"  Copied to Obsidian: {rel_path}")
    else:
        print(f"  SKIPPED (not found): {rel_path}")

print()
print("Merge complete. Ready to create junction.")
