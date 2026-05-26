"""Sync Obsidian vault -> Quartz content. Auto-finds vault path."""

import os, sys, shutil
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

# Auto-find the vault under D:\Obsidian\notes
BASE = Path(r'D:\Obsidian\notes')
VAULT = None
for sub in BASE.iterdir():
    if sub.is_dir() and not sub.name.startswith('.'):
        # Check if this dir has subdirs with .md files
        nested = sub / 'notes'
        if nested.is_dir():
            # Count .md files recursively
            md_count = sum(1 for _ in nested.rglob('*.md'))
            if md_count > 5:  # real vault has many files
                VAULT = nested
                break

if not VAULT:
    print("ERROR: Cannot find Obsidian vault under", BASE)
    sys.exit(1)

CONTENT = Path(r'G:\OpenClaw-Workspace\notes-website\content')
IGNORE = {'.obsidian', '.git', '.trash', '_backups', 'node_modules', 'templates', 'private'}

print("Vault found:", VAULT)
print("Dest:", CONTENT)

copied = skipped = removed = errors = 0

# Copy files
for root, dirs, files in os.walk(VAULT):
    dirs[:] = [d for d in dirs if d not in IGNORE and not d.startswith('.')]
    rel = Path(root).relative_to(VAULT)
    
    for f in files:
        if f.startswith('.'):
            continue
        src = Path(root) / f
        dst = CONTENT / rel / f
        
        if dst.exists() and src.stat().st_size == dst.stat().st_size:
            skipped += 1
            continue
        
        dst.parent.mkdir(parents=True, exist_ok=True)
        with open(src, 'rb') as fh:
            data = fh.read()
        try:
            text = data.decode('utf-8')
            with open(dst, 'w', encoding='utf-8', newline='') as fh:
                fh.write(text)
            copied += 1
        except:
            shutil.copy2(src, dst)
            errors += 1
            print('  BAD ENCODING:', rel / f)

# Remove stale files
for root, dirs, files in os.walk(CONTENT):
    dirs[:] = [d for d in dirs if d not in IGNORE and not d.startswith('.')]
    rel = Path(root).relative_to(CONTENT)
    for f in files:
        if f.startswith('.'):
            continue
        if not (VAULT / rel / f).exists():
            (Path(root) / f).unlink()
            removed += 1
            print('  REMOVED:', rel / f)

print()
print("DONE: copied=%d skipped=%d removed=%d errors=%d" % (copied, skipped, removed, errors))
