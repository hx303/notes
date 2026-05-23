"""Deep scan of Obsidian vault for reorganization opportunities."""
import os, sys, re
from pathlib import Path
from collections import defaultdict
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

VAULT = Path(r'D:\Obsidian\notes\覆水知识库\notes')

def extract_fm(md_path):
    try:
        with open(md_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except:
        return {}, ''
    if not content.startswith('---'):
        return {}, content
    parts = content.split('---', 2)
    if len(parts) < 3:
        return {}, content
    fm = {}
    for line in parts[1].strip().split('\n'):
        m = re.match(r'(\w+):\s*(.*)', line.strip())
        if m:
            fm[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return fm, parts[2]


# 1. Naming inconsistencies
print("=" * 60)
print("1. NAMING INCONSISTENCIES")
print("=" * 60)

# Check each subfolder for patterns
for cat_dir in sorted(VAULT.iterdir()):
    if not cat_dir.is_dir() or cat_dir.name.startswith('.') or cat_dir.name.startswith('_'):
        continue
    
    for sub_dir in sorted(cat_dir.rglob('*')):
        if not sub_dir.is_dir() or sub_dir.name.startswith('.') or sub_dir.name.startswith('_'):
            continue
        
        files = sorted([f for f in sub_dir.iterdir() if f.suffix == '.md' and f.name != 'index.md'])
        if len(files) <= 1:
            continue
        
        patterns = defaultdict(list)
        for f in files:
            name = f.stem
            # Check prefix patterns
            if name.startswith('微积分-'):
                patterns['微积分-'].append(name)
            elif re.match(r'^\d', name):
                patterns['number_prefix'].append(name)
            elif re.match(r'^第[一二三四五六七八九十\d]', name):
                patterns['chinese_chapter'].append(name)
            elif '课堂笔记' in name:
                patterns['class_notes'].append(name)
            elif '_backup' in name:
                patterns['backup'].append(name)
            else:
                patterns['other'].append(name)
        
        if len(patterns) > 1:
            rel = sub_dir.relative_to(VAULT)
            print(f"\n  {rel}/")
            for pat, names in sorted(patterns.items()):
                status = ''
                if pat == 'backup':
                    status = ' [BACKUP - should move]'
                elif pat == 'other' and len(patterns) > 2:
                    status = ' [inconsistent naming]'
                print(f"    [{pat}] {', '.join(names[:3])}{status}")


# 2. Duplicate content detection
print("\n" + "=" * 60)
print("2. POTENTIAL DUPLICATE CONTENT")
print("=" * 60)

# Find files with same stem in different locations
stem_map = defaultdict(list)
for md in VAULT.rglob('*.md'):
    if md.name == 'index.md':
        continue
    stem_map[md.stem.lower()].append(md)

for stem, paths in sorted(stem_map.items()):
    if len(paths) > 1:
        # Check if they're in different top-level categories
        categories = set()
        for p in paths:
            rel = p.relative_to(VAULT)
            parts = rel.parts
            categories.add(parts[0] if len(parts) > 0 else 'root')
        
        if len(categories) > 1:
            sizes = [p.stat().st_size for p in paths]
            rels = [str(p.relative_to(VAULT)) for p in paths]
            print(f"\n  Duplicate: '{stem}'")
            for i, (r, s) in enumerate(zip(rels, sizes)):
                print(f"    [{s}B] {r}")

# Also check content similarity by first 200 chars
print("\n  Checking content similarity...")
content_map = defaultdict(list)
for md in VAULT.rglob('*.md'):
    if md.name == 'index.md' or md.name.startswith('_'):
        continue
    try:
        with open(md, 'r', encoding='utf-8') as f:
            head = f.read(300)
    except:
        continue
    # Normalize
    key = re.sub(r'\s+', ' ', head[:200])
    content_map[key].append(md)

for key, paths in content_map.items():
    if len(paths) > 1:
        rels = [str(p.relative_to(VAULT)) for p in paths]
        # Skip if they're already in same pattern check
        stems = [p.stem for p in paths]
        if len(set(stems)) == len(stems):  # Different names but same content
            print(f"\n  Content duplicate:")
            for r in rels:
                print(f"    {r}")


# 3. Misfiled notes (wrong category)
print("\n" + "=" * 60)
print("3. POTENTIALLY MISFILED NOTES")
print("=" * 60)

# Tag-based analysis
for md in VAULT.rglob('*.md'):
    if md.name == 'index.md':
        continue
    fm, body = extract_fm(md)
    tags = fm.get('tags', '')
    rel = str(md.relative_to(VAULT))
    
    # Check for notes in wrong subject area based on tags/content
    parent_cat = rel.split('\\')[0] if '\\' in rel else 'root'
    
    # If tags mention a subject that doesn't match folder
    tag_keywords = {
        '物理': '大学物理',
        '数学': ['微积分', '线性代数'],
        '化学': '有机化学',
        '历史': ['中国近代史', '中华民族发展史'],
        '军事': '军事理论',
        '计算机': '计算机科学',
        '科研': '科研笔记',
        '讲座': '讲座笔记',
    }
    
    for tag_kw, expected_cats in tag_keywords.items():
        if tag_kw in tags and not isinstance(expected_cats, list):
            expected_cats = [expected_cats]
        if tag_kw in tags:
            if parent_cat not in expected_cats and rel.split('\\')[1] if len(rel.split('\\')) > 1 else '' not in expected_cats:
                # Check if the folder name contains the tag keyword
                folder_has_kw = any(ekw in parent_cat for ekw in expected_cats)
                if not folder_has_kw:
                    print(f"  {rel}  [tagged '{tag_kw}' but in '{parent_cat}']")


# 4. Recommended restructure
print("\n" + "=" * 60)
print("4. FOLDER STRUCTURE ANALYSIS")
print("=" * 60)

for cat_dir in sorted(VAULT.iterdir()):
    if not cat_dir.is_dir() or cat_dir.name.startswith('.') or cat_dir.name.startswith('_'):
        continue
    
    md_count = sum(1 for _ in cat_dir.rglob('*.md'))
    sub_count = sum(1 for d in cat_dir.iterdir() if d.is_dir() and not d.name.startswith('.') and d.name != 'attachments' and not d.name.endswith('_图片'))
    
    rel = cat_dir.relative_to(VAULT)
    issues = []
    
    # Check for orphan notes in parent dir
    orphans = [f for f in cat_dir.iterdir() if f.suffix == '.md' and f.name != 'index.md']
    if orphans:
        issues.append(f'{len(orphans)} orphan notes')
    
    # Check nested depth
    max_depth = 0
    for d in cat_dir.rglob('*'):
        if d.is_dir() and not d.name.startswith('.'):
            depth = len(d.relative_to(cat_dir).parts)
            if depth > max_depth:
                max_depth = depth
    
    if issues:
        print(f"  {rel}/ ({md_count} notes, {sub_count} subdirs, depth {max_depth})")
        for issue in issues:
            print(f"    ⚠️ {issue}")


# 5. File name quality check
print("\n" + "=" * 60)
print("5. FILE NAME QUALITY")
print("=" * 60)

issues = 0
for md in VAULT.rglob('*.md'):
    if md.name == 'index.md':
        continue
    name = md.stem
    rel = md.relative_to(VAULT)
    problems = []
    
    if '_backup' in name.lower():
        problems.append('BACKUP file')
    
    if name.count('_') > 4:
        problems.append('too many underscores')
    
    # Inconsistent chapter numbering
    if re.match(r'^\d+[\.\s]', name) and any(c in name for c in '一二三四五六七八九十'):
        problems.append('mixed number formats')
    
    if len(name) > 60:
        problems.append(f'very long name ({len(name)} chars)')
    
    if problems:
        print(f"  {rel}")
        for p in problems:
            print(f"    ⚠️ {p}")
        issues += 1

if issues == 0:
    print("  All file names look good!")

print(f"\n  {issues} files with naming issues")
