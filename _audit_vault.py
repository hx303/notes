"""Audit Obsidian vault: find empty folders, misplaced notes, structure overview."""
import os, sys
from pathlib import Path
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

VAULT = Path(r'D:\Obsidian\notes\覆水知识库\notes')
CONTENT = Path(r'G:\OpenClaw-Workspace\notes-website\content')

# --- 1. Full directory tree ---
print("=" * 60)
print("1. VAULT DIRECTORY TREE")
print("=" * 60)

def tree(dir_path, prefix="", depth=0, max_depth=4):
    if depth > max_depth:
        print(f"{prefix}...")
        return
    children = sorted([c for c in dir_path.iterdir() if not c.name.startswith('.')])
    for i, child in enumerate(children):
        is_last = (i == len(children) - 1)
        connector = "└── " if is_last else "├── "
        if child.is_dir():
            has_content = any(True for _ in child.rglob('*'))
            content_count = sum(1 for _ in child.rglob('*.md'))
            tag = f" [{content_count} notes]" if content_count else " [EMPTY]"
            print(f"{prefix}{connector}{child.name}/{tag}")
            tree(child, prefix + ("    " if is_last else "│   "), depth + 1, max_depth)
        else:
            if child.suffix == '.md':
                print(f"{prefix}{connector}{child.name}")

# Root level
root_children = sorted([c for c in VAULT.iterdir() if not c.name.startswith('.')])
for i, child in enumerate(root_children):
    is_last = (i == len(root_children) - 1)
    connector = "└── " if is_last else "├── "
    if child.is_dir():
        has_md = sum(1 for _ in child.rglob('*.md'))
        has_sub_dirs = sum(1 for _ in child.iterdir() if _.is_dir())
        tag = f" [{has_md} notes, {has_sub_dirs} subdirs]" if has_md or has_sub_dirs else " [EMPTY]"
        print(f"{connector}{child.name}/{tag}")
        tree(child, "    " if is_last else "│   ", 1, 3)
    elif child.suffix == '.md':
        print(f"{connector}{child.name}")

# --- 2. Empty directories ---
print("\n" + "=" * 60)
print("2. EMPTY DIRECTORIES (no .md files, no subdirs with content)")
print("=" * 60)

empty_dirs = []
for d in sorted(VAULT.rglob('*')):
    if d.is_dir() and not d.name.startswith('.'):
        md_count = sum(1 for _ in d.rglob('*.md'))
        if md_count == 0:
            empty_dirs.append(d)

if empty_dirs:
    for d in empty_dirs:
        rel = d.relative_to(VAULT)
        print(f"  {rel}/")
    print(f"\n  Total: {len(empty_dirs)} empty directories")
else:
    print("  None!")

# --- 3. Root-level orphan notes ---
print("\n" + "=" * 60)
print("3. ROOT-LEVEL NOTES (not in any category folder)")
print("=" * 60)

root_notes = sorted([f for f in VAULT.iterdir() if f.suffix == '.md' and not f.name.startswith('.')])
if root_notes:
    for f in root_notes:
        print(f"  {f.name}")
    print(f"\n  Total: {len(root_notes)} orphan notes")
else:
    print("  None!")

# --- 4. Notes by category ---
print("\n" + "=" * 60)
print("4. NOTES BY CATEGORY")
print("=" * 60)

categories = defaultdict(list)
for md in VAULT.rglob('*.md'):
    if md.name.startswith('.') or md.name == 'index.md':
        continue
    rel = md.relative_to(VAULT)
    parts = rel.parts
    cat = parts[0] if parts else 'root'
    # Category is the top-level folder name
    if cat.endswith('.md'):
        categories['root'].append(rel)
    else:
        categories[cat].append(rel)

for cat, notes in sorted(categories.items()):
    print(f"\n  {cat}/ ({len(notes)} notes)")
    for n in sorted(notes, key=str):
        subpath = str(n).replace(cat + '\\', '  ', 1) if cat != 'root' else str(n)
        if len(str(n).split('\\')) <= 2 or cat == 'root':
            print(f"    {n.name}")

# --- 5. Attachments directories ---
print("\n" + "=" * 60)
print("5. ATTACHMENT DIRECTORIES (non-.md files)")
print("=" * 60)

for d in VAULT.rglob('attachments'):
    files = list(d.iterdir())
    if files:
        rel = d.relative_to(VAULT)
        print(f"  {rel}/ ({len(files)} files)")
        for f in files[:5]:
            print(f"    {f.name}")
        if len(files) > 5:
            print(f"    ... and {len(files) - 5} more")

for d in VAULT.rglob('*_图片'):
    files = list(d.iterdir())
    if files:
        rel = d.relative_to(VAULT)
        print(f"  {rel}/ ({len(files)} files)")
        for f in files[:5]:
            print(f"    {f.name}")
