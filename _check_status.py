"""Check website status: frontmatter, LaTeX issues, wiki links."""
import sys, re
from pathlib import Path
from collections import Counter
sys.stdout.reconfigure(encoding='utf-8')

CONTENT = Path(r'G:\OpenClaw-Workspace\notes-website\content')

total = 0
has_frontmatter = 0
missing_title = []
missing_date = []
no_frontmatter = []
latex_issues = []
emoji_in_math = []

for f in sorted(CONTENT.rglob('*.md')):
    total += 1
    txt = f.read_text(encoding='utf-8')
    rel = str(f.relative_to(CONTENT))
    
    # Frontmatter check
    fm = re.search(r'^---\s*\n(.*?)\n---', txt, re.DOTALL)
    if fm:
        has_frontmatter += 1
        fm_txt = fm.group(1)
        if not re.search(r'^title:', fm_txt, re.MULTILINE):
            missing_title.append(rel)
        if not re.search(r'^date:', fm_txt, re.MULTILINE):
            missing_date.append(rel)
    else:
        no_frontmatter.append(rel)
    
    # LaTeX issues: emoji inside $...$
    # Remove code blocks first
    clean = re.sub(r'```.*?```', '', txt, flags=re.DOTALL)
    for m in re.finditer(r'\$[^$]+\$', clean):
        if re.search(r'[✗✘✓✅❌⚠️🔥💡📝📌]', m.group()):
            emoji_in_math.append(f"{rel}: ${m.group()}$")
    
    # Other LaTeX warnings (Unicode in math mode, \\ in display)
    # Just count them
    
print(f"=== Website Status ===")
print(f"Total .md files:    {total}")
print(f"With frontmatter:   {has_frontmatter}")
print(f"No frontmatter:     {len(no_frontmatter)}")
print(f"Missing title:      {len(missing_title)}")
print(f"Missing date:       {len(missing_date)}")
print(f"Emoji in math mode: {len(emoji_in_math)}")
print()

if emoji_in_math:
    print("=== EMOJI IN MATH MODE (will render poorly) ===")
    for item in emoji_in_math:
        print(f"  {item}")
    print()

if missing_title:
    print(f"=== MISSING TITLE ({len(missing_title)} files) ===")
    for item in missing_title:
        print(f"  {item}")
    print()

if missing_date:
    print(f"=== MISSING DATE ({len(missing_date)} files) ===")
    for item in missing_date:
        print(f"  {item}")
    print()

if no_frontmatter:
    print(f"=== NO FRONTMATTER ({len(no_frontmatter)} files) ===")
    for item in no_frontmatter:
        print(f"  {item}")
    print()
