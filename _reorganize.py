"""Reorganize Obsidian vault: move files, create dirs, sync to Quartz."""
import os, sys, shutil
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

VAULT = Path(r'D:\Obsidian\notes\覆水知识库\notes')
QUARTZ = Path(r'G:\OpenClaw-Workspace\notes-website\content')

MOVES = [
    # (source_relative, dest_relative)
    # Backup files -> _backups/
    ('🎓 讲座笔记/亲密关系读书笔记_backup.md', '_backups/亲密关系读书笔记_backup.md'),
    ('📖 课堂笔记/有机化学/第十七章_不饱和烃_backup.md', '_backups/第十七章_不饱和烃_backup.md'),
    ('📖 课堂笔记/有机化学/第十八章_脂环烃_backup_before_smiles.md', '_backups/第十八章_脂环烃_backup_before_smiles.md'),
    ('📖 课堂笔记/有机化学/第十六章_烷烃_backup_before_smiles.md', '_backups/第十六章_烷烃_backup_before_smiles.md'),
    # 宗教中国化 -> 思政与社会/
    ('宗教中国化调研资料汇编.md', '📖 课堂笔记/思政与社会/宗教中国化调研资料汇编.md'),
    # 计算机科学速成课 + 专利 -> 计算机科学/
    ('📖 课堂笔记/计算机科学速成课_第1集_计算机早期历史.md', '📖 课堂笔记/计算机科学/计算机科学速成课_第1集_计算机早期历史.md'),
    ('📖 课堂笔记/计算机科学速成课_第3集_布尔逻辑与逻辑门_v2.md', '📖 课堂笔记/计算机科学/计算机科学速成课_第3集_布尔逻辑与逻辑门_v2.md'),
    ('📖 课堂笔记/专利基本知识.md', '📖 课堂笔记/计算机科学/专利基本知识.md'),
]

print("=" * 50)
print("VAULT REORGANIZATION")
print("=" * 50)

for src_rel, dst_rel in MOVES:
    va_src = VAULT / src_rel
    va_dst = VAULT / dst_rel
    qz_src = QUARTZ / src_rel
    qz_dst = QUARTZ / dst_rel
    
    # Move in Obsidian vault
    va_dst.parent.mkdir(parents=True, exist_ok=True)
    if va_src.exists():
        shutil.move(str(va_src), str(va_dst))
        print(f'[Obsidian] {src_rel} -> {dst_rel}')
    else:
        print(f'[MISSING Obsidian] {src_rel}')
    
    # Move in Quartz content
    if qz_src.exists():
        qz_dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(qz_src), str(qz_dst))
        print(f'[Quartz]   {src_rel} -> {dst_rel}')
    else:
        print(f'[MISSING Quartz] {src_rel}')

print("\nDone moving files.")

# --- Verify: no empty dirs remain ---
print("\n" + "=" * 50)
print("POST-MOVE VERIFICATION")
print("=" * 50)

empty_dirs = []
for d in sorted(VAULT.rglob('*')):
    if d.is_dir() and not d.name.startswith('.') and d.name != '_backups':
        md_count = sum(1 for _ in d.rglob('*.md'))
        if md_count == 0:
            empty_dirs.append(d)

if empty_dirs:
    print("Remaining empty dirs (attachment-only):")
    for d in empty_dirs:
        print(f"  {d.relative_to(VAULT)}/")
else:
    print("No empty dirs with .md content!")

# --- Check orphans ---
root_notes = sorted([f for f in VAULT.iterdir() if f.suffix == '.md' and not f.name.startswith('.')])
if root_notes:
    print("\nRoot-level notes remaining:")
    for f in root_notes:
        print(f"  {f.name}")
else:
    print("\nNo root-level orphans!")

# --- Check 课堂笔记 root orphans ---
class_notes = VAULT / '📖 课堂笔记'
cn_orphans = sorted([f for f in class_notes.iterdir() if f.suffix == '.md' and f.name != 'index.md'])
if cn_orphans:
    print("\n📖 课堂笔记/ root orphans remaining:")
    for f in cn_orphans:
        print(f"  {f.name}")
else:
    print("\n📖 课堂笔记/ root clean!")
