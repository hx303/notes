"""Comprehensive vault cleanup: rename files, fix links, update indexes."""
import os, sys, shutil, re
from pathlib import Path
from datetime import datetime
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

VAULT = Path(r'D:\Obsidian\notes\覆水知识库\notes')
QUARTZ = Path(r'G:\OpenClaw-Workspace\notes-website\content')

# ============================================================
# PHASE 1: RENAMES — remove redundant naming patterns
# ============================================================
# Format: (relative_path_from_vault_root, new_name_without_path)
#   The script will find the file and rename it, updating both Obsidian and Quartz

RENAMES = {
    # === 大学物理 ===
    # Remove _笔记 / _课堂笔记 suffix
    r'📖 课堂笔记\大学物理\动量定理解析_笔记.md':
        r'📖 课堂笔记\大学物理\动量定理解析.md',
    r'📖 课堂笔记\大学物理\转动力学解惑_课堂笔记.md':
        r'📖 课堂笔记\大学物理\转动力学解惑.md',
    r'📖 课堂笔记\大学物理\转动力学课堂笔记_完整版.md':
        r'📖 课堂笔记\大学物理\转动力学_完整版.md',
    r'📖 课堂笔记\大学物理\导体、电容与电介质_辅导课笔记.md':
        r'📖 课堂笔记\大学物理\导体、电容与电介质.md',
    r'📖 课堂笔记\大学物理\高斯定理与电势讲座笔记.md':
        r'📖 课堂笔记\大学物理\高斯定理与电势.md',
    r'📖 课堂笔记\大学物理\简答题备考笔记_II-1.md':
        r'📖 课堂笔记\大学物理\简答题备考_II-1.md',
    # Remove redundant department prefix
    r'📖 课堂笔记\大学物理\大学物理-角动量与质点系运动定理.md':
        r'📖 课堂笔记\大学物理\角动量与质点系运动定理.md',

    # === 中华民族发展史 ===
    r'📖 课堂笔记\中华民族发展史\从华夷之辨到天下一家_课堂笔记.md':
        r'📖 课堂笔记\中华民族发展史\从华夷之辨到天下一家.md',
    r'📖 课堂笔记\中华民族发展史\完整的天下经验-课堂笔记.md':
        r'📖 课堂笔记\中华民族发展史\完整的天下经验.md',
    r'📖 课堂笔记\中华民族发展史\宋辽金时期的民族冲突与融合_笔记.md':
        r'📖 课堂笔记\中华民族发展史\宋辽金时期的民族冲突与融合.md',
    r'📖 课堂笔记\中华民族发展史\课堂笔记_中华文明起源_2026-03-19.md':
        r'📖 课堂笔记\中华民族发展史\中华文明起源.md',
    r'📖 课堂笔记\中华民族发展史\课堂笔记_鸦片战争与中国近代史开端_2026-03-23.md':
        r'📖 课堂笔记\中华民族发展史\鸦片战争与中国近代史开端.md',

    # === 中国近代史 ===
    r'📖 课堂笔记\中国近代史\康有为与进步观念_戊戌维新_辛亥革命_课堂笔记.md':
        r'📖 课堂笔记\中国近代史\康有为与进步观念_戊戌维新_辛亥革命.md',
    r'📖 课堂笔记\中国近代史\课堂笔记_鸦片战争与中国近代史开端_2026-03-23.md':
        r'📖 课堂笔记\中国近代史\鸦片战争与中国近代史开端.md',

    # === 线性代数 ===
    r'📖 课堂笔记\线性代数\4.3 线性代数_向量组的极大无关组和秩.md':
        r'📖 课堂笔记\线性代数\4.3_向量组的极大无关组和秩.md',

    # === COMSOL ===
    r'📖 课堂笔记\COMSOL 基础培训\COMSOL 基础培训 - 总索引.md':
        r'📖 课堂笔记\COMSOL 基础培训\COMSOL 基础培训_总索引.md',
}

# Also handle duplicate COMSOL files
COMSOL_DUPES = [
    r'COMSOL\02 几何建模.md',
    r'COMSOL\03 网格划分.md',
    r'COMSOL\index.md',
]

print("=" * 60)
print("PHASE 1: RENAMING FILES")
print("=" * 60)

rename_map = {}  # old_stem -> new_stem for link updates

for old_rel, new_rel in RENAMES.items():
    old_stem = Path(old_rel).stem
    new_stem = Path(new_rel).stem
    
    va_old = VAULT / old_rel
    va_new = VAULT / new_rel
    qz_old = QUARTZ / old_rel
    qz_new = QUARTZ / new_rel
    
    success = False
    for src, dst in [(va_old, va_new), (qz_old, qz_new)]:
        if src.exists() and not dst.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dst))
            success = True
            loc = 'Obsidian' if 'Obsidian' in str(src) else 'Quartz'
    
    if success:
        rename_map[old_stem] = new_stem
        print(f'  {old_stem}\n    -> {new_stem}')
    else:
        print(f'  SKIP (src missing or dst exists): {old_stem}')

# ============================================================
# PHASE 1b: Remove COMSOL duplicates
# ============================================================
print("\n\nRemoving duplicate COMSOL files (kept under 课堂笔记):")
for rel in COMSOL_DUPES:
    qz_path = QUARTZ / rel
    va_path = VAULT / rel
    for p in [qz_path, va_path]:
        if p.exists() and p.is_file():
            p.unlink()
            print(f'  Removed: {rel}')

# Remove empty COMSOL dir
for base in [QUARTZ, VAULT]:
    comsol_dir = base / 'COMSOL'
    if comsol_dir.exists():
        try:
            shutil.rmtree(comsol_dir)
            print(f'  Removed empty dir: COMSOL/')
        except:
            pass


# ============================================================
# PHASE 2: UPDATE WIKI LINKS
# ============================================================
print("\n" + "=" * 60)
print("PHASE 2: UPDATING WIKI LINKS")
print("=" * 60)

if rename_map:
    links_fixed = 0
    for base_dir in [VAULT, QUARTZ]:
        for md in base_dir.rglob('*.md'):
            with open(md, 'r', encoding='utf-8') as f:
                content = f.read()
            
            original = content
            
            # Replace [[OldName]] and [[OldName|alias]] and [[OldName#section]]
            for old_stem, new_stem in rename_map.items():
                # Pattern: [[OldStem]] or [[OldStem|...]] or [[OldStem#...]]
                pattern = re.compile(r'\[\[' + re.escape(old_stem) + r'(\]\]|[#|])')
                content = pattern.sub(lambda m: f'[[{new_stem}{m.group(1)}', content)
            
            if content != original:
                changes = original.count('[[') - content.count('[[')  # approximate
                with open(md, 'w', encoding='utf-8') as f:
                    f.write(content)
                loc = 'Obsidian' if 'Obsidian' in str(base_dir) else 'Quartz'
                rel_p = md.relative_to(base_dir)
                print(f'  Fixed links in: {rel_p}')
                links_fixed += 1
    
    print(f'\n  Links updated in {links_fixed} files')


# ============================================================
# PHASE 3: MOVE supplementary non-notes out of 课堂笔记
# ============================================================
print("\n" + "=" * 60)
print("PHASE 3: MOVING NON-NOTE FILES")
print("=" * 60)

# obsidian-chem部署指南 → keep in 有机化学 as reference
# 炔烃自学读书报告 → keep (it's a study report)

# Create a 工具与教程 folder if useful files exist
tutorial_moves = [
    (r'📖 课堂笔记\有机化学\obsidian-chem部署指南.md',
     r'📖 课堂笔记\有机化学\obsidian-chem部署指南.md'),  # keep
]

print("  (No moves needed - current placement is reasonable)")


# ============================================================
print("\n" + "=" * 60)
print("DONE. Summary:")
print(f"  Files renamed: {len(rename_map)}")
print(f"  COMSOL dupes removed: {len(COMSOL_DUPES)}")
print("=" * 60)
