"""Regenerate all existing index.md files to reflect new directory structure."""
import os, re, sys
from pathlib import Path
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

CONTENT = Path(r'G:\OpenClaw-Workspace\notes-website\content')
OBSIDIAN = Path(r'D:\Obsidian\notes\覆水知识库\notes')

def extract_frontmatter(md_path):
    try:
        with open(md_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except:
        return {}
    if not content.startswith('---'):
        return {}
    parts = content.split('---', 2)
    if len(parts) < 3:
        return {}
    fm = {}
    for line in parts[1].strip().split('\n'):
        m = re.match(r'(\w+):\s*(.*)', line.strip())
        if m:
            key = m.group(1)
            val = m.group(2).strip().strip('"').strip("'")
            fm[key] = val
    return fm


def get_display_title(fm, stem):
    return fm.get('title', stem)


def generate_index(dir_path):
    dir_name = dir_path.name
    all_items = []
    
    for item in sorted(dir_path.iterdir()):
        if item.name == 'index.md' or item.name.startswith('.') or item.name.startswith('_'):
            continue
        if item.name in ['attachments']:
            continue
        if item.name.endswith('_图片'):
            continue
        
        if item.is_dir():
            has_md = any(item.rglob('*.md'))
            if has_md:
                all_items.append({
                    'type': 'folder',
                    'name': item.name,
                    'path': item.name + '/',
                })
        elif item.suffix == '.md':
            fm = extract_frontmatter(item)
            title = get_display_title(fm, item.stem)
            all_items.append({
                'type': 'file',
                'name': item.name.replace('.md', ''),
                'title': title,
            })
    
    if not all_items:
        return None
    
    now = datetime.now().strftime('%Y-%m-%d')
    lines = [
        '---',
        f'title: "{dir_name}"',
        f'date: {now}',
        '---',
        '',
        f'# {dir_name}',
        '',
        f'共 {len(all_items)} 篇笔记：',
        '',
    ]
    
    for item in all_items:
        if item['type'] == 'folder':
            lines.append(f'- 📁 [{item["name"]}]({item["path"]})')
        elif item['type'] == 'file':
            name = item['name']
            title = item['title']
            link = f'[[{name}|{title}]]' if name != title else f'[[{name}]]'
            lines.append(f'- {link}')
    
    lines.append('')
    return '\n'.join(lines)


# Regenerate ALL existing index.md files
regenerated = 0
for obs_dir in OBSIDIAN.rglob('*'):
    if not obs_dir.is_dir():
        continue
    if obs_dir.name.startswith('.') or obs_dir.name.startswith('_'):
        continue
    if obs_dir.name in ['attachments']:
        continue
    if obs_dir.name.endswith('_图片'):
        continue
    
    index_file = obs_dir / 'index.md'
    if not index_file.exists():
        continue  # Skip dirs without index
    
    content = generate_index(obs_dir)
    if content is None:
        print(f'  SKIP (empty): {obs_dir.relative_to(OBSIDIAN)}/')
        continue
    
    # Update Obsidian
    with open(index_file, 'w', encoding='utf-8') as f:
        f.write(content)
    
    # Update Quartz
    rel = obs_dir.relative_to(OBSIDIAN)
    qz_index = CONTENT / rel / 'index.md'
    if qz_index.parent.exists():
        with open(qz_index, 'w', encoding='utf-8') as f:
            f.write(content)
    
    notes = content.count('- [[') + content.count('- 📁')
    print(f'  REGEN: {rel}/index.md ({notes} entries)')
    regenerated += 1

print(f'\nRegenerated: {regenerated} indexes')
