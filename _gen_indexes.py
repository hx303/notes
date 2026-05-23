"""Task B: Generate index.md files for directories that lack them.

Uses existing frontmatter (title, date, tags) from content files to create
meaningful directory index pages with links to all child notes.
"""
import os, re, sys
from pathlib import Path
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

CONTENT = Path(r'G:\OpenClaw-Workspace\notes-website\content')
OBSIDIAN = Path(r'D:\Obsidian\notes\覆水知识库\notes')

def extract_frontmatter(md_path):
    """Extract YAML frontmatter from a markdown file."""
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
    """Get display title: frontmatter title > stem."""
    return fm.get('title', stem)


def generate_index(dir_path, dir_rel):
    """Generate index.md content for a directory."""
    dir_name = dir_path.name
    all_items = []
    
    # Collect all child items (subdirectories and markdown files)
    for item in sorted(dir_path.iterdir()):
        if item.name == 'index.md' or item.name.startswith('_'):
            continue
        if item.is_dir():
            # Check if subdirectory has content
            has_md = any(item.rglob('*.md'))
            if has_md and not (item / 'index.md').exists():
                all_items.append({
                    'type': 'folder',
                    'name': item.name,
                    'path': item.name + '/',
                })
        elif item.suffix == '.md':
            fm = extract_frontmatter(item)
            title = get_display_title(fm, item.stem)
            date = fm.get('date', fm.get('created', ''))
            tags = fm.get('tags', '')
            if isinstance(tags, str) and tags.startswith('['):
                tags = tags.strip('[]').replace("'", "").replace('"', '')
            all_items.append({
                'type': 'file',
                'name': item.name.replace('.md', ''),
                'title': title,
                'date': date,
                'tags': tags,
            })
    
    if not all_items:
        return None
    
    # Build markdown
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
            # Subfolder without index — link to it directly
            lines.append(f'- 📁 [{item["name"]}]({item["path"]})')
        elif item['type'] == 'file':
            name = item['name']
            title = item['title']
            # Escape spaces and special chars for markdown link
            link_name = name.replace(' ', '%20')
            link = f'[[{name}|{title}]]' if name != title else f'[[{name}]]'
            lines.append(f'- {link}')
    
    lines.append('')
    return '\n'.join(lines)


# Find directories that need indexes
indexes_created = 0
for dirpath, dirnames, filenames in os.walk(CONTENT):
    dir_path = Path(dirpath)
    
    # Skip directories that already have index.md
    if 'index.md' in filenames:
        continue
    
    # Skip image/attachment directories
    if dir_path.name.endswith('_图片') or dir_path.name == 'attachments':
        continue
    
    # Skip root
    if dir_path == CONTENT:
        continue
    
    # Generate index
    rel = dir_path.relative_to(CONTENT)
    content = generate_index(dir_path, rel)
    
    if content is None:
        print(f'  SKIP (empty): {rel}')
        continue
    
    # Write to Quartz content
    qpath = dir_path / 'index.md'
    with open(qpath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    # Also write to Obsidian
    opath = OBSIDIAN / rel / 'index.md'
    opath.parent.mkdir(parents=True, exist_ok=True)
    with open(opath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    notes_count = content.count('- [[') + content.count('- 📁')
    print(f'  CREATED: {rel}/index.md ({notes_count} entries)')
    indexes_created += 1

print(f'\nTotal indexes created: {indexes_created}')
