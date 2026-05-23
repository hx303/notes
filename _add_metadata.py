"""Task C: Add missing YAML frontmatter (title, date) to notes that need them.

Strategy:
- Missing title: Extract from first # Heading in content, or use filename stem
- Missing date: Use file modification time as fallback
- Both ends: Obsidian + Quartz
"""
import os, re, sys
from pathlib import Path
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

CONTENT = Path(r'G:\OpenClaw-Workspace\notes-website\content')
OBSIDIAN = Path(r'D:\Obsidian\notes\覆水知识库\notes')


def parse_frontmatter(content):
    """Parse YAML frontmatter. Returns (fm_dict, body)."""
    if not content.startswith('---'):
        return {}, content
    
    parts = content.split('---', 2)
    if len(parts) < 3:
        return {}, content
    
    fm = {}
    fm_text = parts[1]
    body = parts[2]
    
    for line in fm_text.strip().split('\n'):
        m = re.match(r'(\w+):\s*(.*)', line.strip())
        if m:
            key = m.group(1)
            val = m.group(2).strip().strip('"').strip("'")
            fm[key] = val
    
    return fm, body


def extract_title_from_body(body):
    """Extract title from first # Heading."""
    for line in body.strip().split('\n'):
        line = line.strip()
        if line.startswith('# '):
            return line[2:].strip()
    return None


def ensure_frontmatter(content, file_stem, mtime):
    """Ensure content has title and date in frontmatter."""
    fm, body = parse_frontmatter(content)
    changed = False
    
    # If no title, try to extract from heading
    if 'title' not in fm or not fm.get('title'):
        heading_title = extract_title_from_body(body)
        if heading_title:
            fm['title'] = heading_title
            changed = True
        else:
            fm['title'] = file_stem
            changed = True
    
    # If no date, use file modification time
    if 'date' not in fm or not fm.get('date'):
        fm['date'] = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d')
        changed = True
    
    if not changed:
        return content
    
    # Rebuild frontmatter
    fm_lines = ['---']
    for key in ['title', 'subject', 'tags', 'date', 'created', 'updated']:
        if key in fm:
            val = fm[key]
            if isinstance(val, list):
                val_str = '[' + ', '.join(val) + ']'
            elif ' ' in str(val) and not str(val).startswith('['):
                val_str = f'"{val}"'
            else:
                val_str = str(val)
            fm_lines.append(f'{key}: {val_str}')
    fm_lines.append('---')
    
    new_fm = '\n'.join(fm_lines)
    
    if content.startswith('---'):
        # Replace existing frontmatter
        parts = content.split('---', 2)
        new_content = new_fm + parts[2] if len(parts) >= 3 else new_fm + '\n\n' + content
    else:
        new_content = new_fm + '\n\n' + content
    
    return new_content


# Scan all content files
fixed_count = 0
for md_path in CONTENT.rglob('*.md'):
    rel = md_path.relative_to(CONTENT)
    
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    fm, _ = parse_frontmatter(content)
    has_title = 'title' in fm and fm.get('title')
    has_date = 'date' in fm and fm.get('date')
    
    if has_title and has_date:
        continue  # Already complete
    
    # Fix Quartz content
    fixed = ensure_frontmatter(content, md_path.stem, md_path.stat().st_mtime)
    if fixed != content:
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(fixed)
        
        # Also fix Obsidian
        opath = OBSIDIAN / rel
        if opath.exists():
            with open(opath, 'r', encoding='utf-8') as f:
                oc = f.read()
            ofixed = ensure_frontmatter(oc, opath.stem, opath.stat().st_mtime)
            if ofixed != oc:
                with open(opath, 'w', encoding='utf-8') as f:
                    f.write(ofixed)
        
        added = []
        if not has_title: added.append('title')
        if not has_date: added.append('date')
        print(f'  +{",".join(added)}: {rel}')
        fixed_count += 1

print(f'\nTotal files fixed: {fixed_count}')
