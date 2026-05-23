"""Fix 3 remaining full-path wiki links."""
import re, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')

file = Path(r'G:\OpenClaw-Workspace\notes-website\content\📖 课堂笔记\中华民族发展史\明代西藏关系探析——柔性治理与多元一体.md')
obs_file = Path(r'D:\Obsidian\notes\覆水知识库\notes\📖 课堂笔记\中华民族发展史\明代西藏关系探析——柔性治理与多元一体.md')

for target_path in [file, obs_file]:
    if not target_path.exists():
        continue
    with open(target_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # Fix full-path Obsidian links
    def replacer(m):
        inner = m.group(1)
        parts = inner.split('|')
        path = parts[0]
        alias = parts[1] if len(parts) > 1 else None
        
        # Extract page name from full path
        page_name = path.split('/')[-1].replace('.md', '')
        display = alias or page_name
        
        # Check if page exists in content
        content_root = Path(r'G:\OpenClaw-Workspace\notes-website\content')
        found = False
        for md in content_root.rglob('*.md'):
            if md.stem == page_name:
                found = True
                break
        
        if found:
            # Page exists - use [[page|display]]
            return f'[[{page_name}|{display}]]'
        else:
            # Page doesn't exist - convert to text
            return display
    
    content = re.sub(r'(?<!!)\[\[([^\[\]]*覆水知识库[^\[\]]*)\]\]', replacer, content)
    
    if content != original:
        with open(target_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'FIXED: {target_path.name}')
    else:
        print(f'(no change): {target_path.name}')
