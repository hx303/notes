"""Compare Obsidian vault and Quartz content for sync check."""
import sys, os, hashlib
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')

OBSIDIAN = Path(r'D:\Obsidian\notes\覆水知识库\notes')
QUARTZ_CONTENT = Path(r'G:\OpenClaw-Workspace\notes-website\content')

def collect_files(root, ignore_dirs=None):
    """Collect all .md files with their relative paths."""
    if ignore_dirs is None:
        ignore_dirs = {'.obsidian', '.git', '.trash', 'node_modules', '_backups'}
    
    files = {}
    for f in root.rglob('*.md'):
        # Skip ignored dirs
        skip = False
        for part in f.relative_to(root).parts:
            if part in ignore_dirs or part.startswith('.'):
                skip = True
                break
        if skip:
            continue
        
        rel = str(f.relative_to(root))
        files[rel] = {
            'size': f.stat().st_size,
            'mtime': f.stat().st_mtime,
        }
    return files

print("Collecting Obsidian vault files...")
obs_files = collect_files(OBSIDIAN, {'.obsidian', '.git', '.trash', '_backups'})

print("Collecting Quartz content files...")
qz_files = collect_files(QUARTZ_CONTENT, {'.obsidian', '.git', '.trash', '_backups', 'private', 'templates'})

obs_set = set(obs_files.keys())
qz_set = set(qz_files.keys())

only_obs = obs_set - qz_set
only_qz = qz_set - obs_set
common = obs_set & qz_set

print(f"\nObsidian files:   {len(obs_files)}")
print(f"Quartz files:     {len(qz_files)}")
print(f"Common:           {len(common)}")
print(f"Only in Obsidian: {len(only_obs)}")
print(f"Only in Quartz:   {len(only_qz)}")

if only_obs:
    print(f"\n=== Only in Obsidian vault ({len(only_obs)} files) ===")
    for f in sorted(only_obs):
        print(f"  + {f} ({obs_files[f]['size']}B)")

if only_qz:
    print(f"\n=== Only in Quartz content ({len(only_qz)} files) ===")
    for f in sorted(only_qz):
        print(f"  + {f} ({qz_files[f]['size']}B)")

# Check for files that differ
if common:
    newer_in_obs = []
    newer_in_qz = []
    for f in sorted(common):
        if obs_files[f]['size'] != qz_files[f]['size']:
            if obs_files[f]['mtime'] > qz_files[f]['mtime']:
                newer_in_obs.append(f)
            else:
                newer_in_qz.append(f)
    
    if newer_in_obs:
        print(f"\n=== Newer in Obsidian ({len(newer_in_obs)} files) ===")
        for f in newer_in_obs:
            print(f"  ! {f}")
    
    if newer_in_qz:
        print(f"\n=== Newer in Quartz ({len(newer_in_qz)} files) ===")
        for f in newer_in_qz:
            print(f"  ! {f}")

print("\n=== Summary ===")
if not only_qz and not newer_in_qz:
    print("SAFE: No data would be lost. Obsidian vault contains everything Quartz has.")
else:
    print("WARNING: Some Quartz content would be lost if we replace it.")
    print("We should back up or merge first.")
