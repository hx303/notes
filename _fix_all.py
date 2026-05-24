"""Fix emoji in math blocks + convert wiki links."""
import sys, re
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')

CONTENT = Path(r'G:\OpenClaw-Workspace\notes-website\content')

# Characters to fix inside $$ blocks & their replacements
REPLACEMENTS = {
    '✗': '\\times',           # Use LaTeX cross
    '✅': '\\checkmark',       # Use LaTeX checkmark  
    '❌': '\\times',           # Use LaTeX cross
    '⚠️': '**WARNING:**',     # Move to text
    '📌': '**Note:**',         # Move to text
    '💡': '**Tip:**',          # Move to text
    '📝': '**Note:**',         # Move to text
    '🔬': '',                  # Remove
    '🎤': '',                  # Remove
    '🔥': '',                  # Remove
    '📖': '',                  # Remove
    '📚': '',                  # Remove
    '📘': '',                  # Remove
}


def fix_math_emoji(text):
    """Replace problematic Unicode chars inside $$...$$ blocks."""
    
    def fix_block(m):
        full_match = m.group(0)
        body = m.group(1)
        if not any(c in body for c in REPLACEMENTS):
            return full_match
        
        # Replace each problematic character
        new_body = body
        for old, new in REPLACEMENTS.items():
            if old in new_body:
                if new.startswith('**'):
                    new_body = new_body.replace(old, '')
                else:
                    new_body = new_body.replace(old, new)
        
        # Preserve original format (single-line vs multi-line)
        if '\n' in body or '$$\n' in full_match:
            return '$$\n' + new_body.strip('\n') + '\n$$'
        else:
            return '$$' + new_body + '$$'
    
    return re.sub(r'\$\$([\s\S]*?)\$\$', fix_block, text)


def convert_wiki_links(text, slug_map):
    """Convert [[target]] and [[target|alias]] to standard MD links."""
    
    def replace_link(m):
        inner = m.group(1)
        target = inner
        alias = None
        anchor = None
        
        if '|' in inner:
            parts = inner.split('|', 1)
            target = parts[0]
            alias = parts[1]
        if '#' in target:
            parts = target.split('#', 1)
            target = parts[0]
            anchor = parts[1]
        
        target_slug = None
        if target in slug_map:
            target_slug = target
        else:
            target_name = target.split('/')[-1] if '/' in target else target
            for k in slug_map:
                if k == target_name:
                    target_slug = k
                    break
        
        if not target_slug:
            return m.group(0)
        
        display = alias if alias else target
        link = target_slug
        if anchor:
            link += '#' + anchor
        
        return f'[{display}]({link})'
    
    return re.sub(r'(?<!!)\[\[([^\]]+)\]\]', replace_link, text)


# Build slug map
slug_map = {}
for f in CONTENT.rglob('*.md'):
    slug_map[f.stem] = str(f.relative_to(CONTENT)).replace('\\', '/')

# Process all files
emoji_count = 0
wiki_count = 0
emoji_files = []
wiki_files = []

for f in sorted(CONTENT.rglob('*.md')):
    txt = f.read_text(encoding='utf-8')
    rel = str(f.relative_to(CONTENT))
    modified = False
    
    # Phase 1: Fix emoji in math
    new_txt = fix_math_emoji(txt)
    if new_txt != txt:
        emoji_count += 1
        emoji_files.append(rel)
        modified = True
        txt = new_txt
    
    # Phase 2: Convert wiki links
    new_txt = convert_wiki_links(txt, slug_map)
    if new_txt != txt:
        wiki_count += 1
        wiki_files.append(rel)
        modified = True
    
    if modified:
        f.write_text(new_txt, encoding='utf-8')

print(f"Phase 1 (emoji in math): {emoji_count} files fixed")
for ef in emoji_files:
    print(f"  {ef}")

print(f"\nPhase 2 (wiki links):   {wiki_count} files fixed")
for wf in wiki_files:
    print(f"  {wf}")

print(f"\nTotal: {emoji_count + wiki_count} files modified")
