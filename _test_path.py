"""Test different image path formats to see which one Quartz handles correctly."""
import os, sys
sys.stdout.reconfigure(encoding='utf-8')

content_root = r'G:\OpenClaw-Workspace\notes-website\content'

# Test file: 亲密关系读书笔记
note_path = os.path.join(content_root, r'🎓 讲座笔记\亲密关系读书笔记.md')
with open(note_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace ![](path) with ![](./path)
import re
original = content
content = re.sub(
    r'!\[\]\(((?:亲密关系读书笔记_图片|attachments)/[^)]+)\)',
    r'![](\1)',
    content
)

# Actually, let me add ./ prefix
content = re.sub(
    r'!\[\]\(((?:亲密关系读书笔记_图片|attachments)/[^)]+)\)',
    r'![](\1)',  # First capture current state
    content
)

# Try adding ./ prefix 
content = re.sub(
    r'!\[\]\(((?:亲密关系读书笔记_图片|attachments)/[^)]+)\)',
    r'![](\1)', 
    content
)

# OK let me just directly find and add ./
lines = content.split('\n')
new_lines = []
for line in lines:
    # Match ![](亲密关系读书笔记_图片/xxx) or ![](attachments/xxx)
    m = re.match(r'^!\[\]\((?!https?://)([^)]+)\)$', line.strip())
    if m and not m.group(1).startswith('./'):
        # Add ./ prefix
        new_line = line.replace(f']({m.group(1)})', f'](./{m.group(1)})')
        new_lines.append(new_line)
        print(f'Fixed: {line.strip()} -> {new_line.strip()}')
    else:
        new_lines.append(line)

fixed_content = '\n'.join(new_lines)

if fixed_content != original:
    # Save to both Obsidian and Quartz
    targets = [
        note_path,
        r'D:\Obsidian\notes\覆水知识库\notes\🎓 讲座笔记\亲密关系读书笔记.md',
    ]
    for t in targets:
        if os.path.exists(t):
            with open(t, 'w', encoding='utf-8') as f:
                f.write(fixed_content)
            print(f'Saved: {t}')
else:
    print('No changes needed')
