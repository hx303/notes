"""Fix image references in 亲密关系读书笔记.md — Obsidian source + Quartz copy."""
import os, sys
sys.stdout.reconfigure(encoding='utf-8')

IMG_BASE = '亲密关系读书笔记_图片'

# Mapping: RECTIFY_IMG reference -> actual descriptive filename
MAPPING = {
    '![[RECTIFY_IMG_20260516_200055 1.jpg]]': f'![[{IMG_BASE}/01_Intro_Seven_Dimensions.jpg]]',
    '![[RECTIFY_IMG_20260516_200420.jpg|697]]': f'![[{IMG_BASE}/02_Need_to_Belong.jpg]]',
    '![[RECTIFY_IMG_20260516_201333.jpg]]': f'![[{IMG_BASE}/03_Cohabitation.jpg]]',
    '![[RECTIFY_IMG_20260516_235145 1.jpg]]': f'![[{IMG_BASE}/04_Attachment_Types.jpg]]',
    '![[RECTIFY_IMG_20260517_013135.jpg]]': f'![[{IMG_BASE}/05_Gender_Personality.jpg]]',
    '![[RECTIFY_IMG_20260517_013041 1.jpg]]': f'![[{IMG_BASE}/06_SelfEsteem_Sexuality.jpg]]',
}

# Files to update
targets = [
    r'D:\Obsidian\notes\覆水知识库\notes\🎓 讲座笔记\亲密关系读书笔记.md',
    r'G:\OpenClaw-Workspace\notes-website\content\🎓 讲座笔记\亲密关系读书笔记.md',
]

for target in targets:
    if not os.path.exists(target):
        print(f"SKIP (not found): {target}")
        continue

    with open(target, 'r', encoding='utf-8') as f:
        original = f.read()

    modified = original
    for old, new in MAPPING.items():
        if old not in modified:
            print(f"  WARNING: '{old}' not found in {target}")
        modified = modified.replace(old, new)

    if modified == original:
        print(f"NO CHANGE: {target}")
    else:
        with open(target, 'w', encoding='utf-8') as f:
            f.write(modified)
        count = sum(1 for old in MAPPING if old in original)
        print(f"FIXED {count} references in: {target}")

print("\nDone!")
