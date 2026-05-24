"""Analyze emoji-in-math and wiki link patterns for fixing."""
import sys, re, json
from pathlib import Path
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')

CONTENT = Path(r'G:\OpenClaw-Workspace\notes-website\content')

# ===================== EMOJI IN MATH =====================
def is_emoji(ch):
    """Check if character is emoji or special symbol."""
    cp = ord(ch)
    return (
        (0x2600 <= cp <= 0x27BF) or  # Miscellaneous Symbols
        (0x2700 <= cp <= 0x27BF) or
        (0x2B50 <= cp <= 0x2B55) or
        cp in (0x2714, 0x2716, 0x2718, 0x2705, 0x274C, 0x274E,  # check, x marks
               0x26A0, 0x26A1, 0x2753, 0x2757, 0x2728,  # warning, !, ?, sparkle
               0x2795, 0x2796, 0x2797, 0x270D, 0x261D,  # +-, hand
               0x23F0, 0x231B, 0x2139, 0x2611, 0x2612,  # clock, info, checkbox
               0x260E, 0x2620, 0x2622, 0x2623, 0x262F,  # phone, skull, biohaz
               0x2638, 0x2639, 0x263A,  # faces
               0x267B, 0x267F, 0x2693, 0x2696,  # recycle, wheelchair, anchor, scales
               0x26AA, 0x26AB, 0x26BD, 0x26C4, 0x26C5,  # circle, soccer, snowman
               0x26C8, 0x26CE, 0x26CF, 0x26D1, 0x26D3, 0x26D4,
               0x26E9, 0x26EA, 0x26F0, 0x26F5, 0x26F7, 0x26FA, 0x26FD,
               0x2702, 0x2705, 0x2708, 0x270F, 0x2712, 0x271D, 0x2721,
               0x2733, 0x2734, 0x2744, 0x2747, 0x2763, 0x2764,
               0x27A1, 0x27B0, 0x2934, 0x2935, 0x2B05, 0x2B07,
               0x2B1B, 0x2B1C, 0x3030, 0x303D, 0x3297, 0x3299,
               0x1F300, 0x1F4D0, 0x1F4D6, 0x1F4D8,  # misc pictographs
               0x1F680, 0x1F6FF,  # transport
               0x1F900, 0x1F9FF,  # supplement
               0x1F600, 0x1F64F,  # emoticons
               0x1F300, 0x1F5FF,  # misc symbols
               0x0023, 0x002A, 0x0030, 0x0039,  # standard chars excluded
        ) or (0x1F300 <= cp <= 0x1FAFF) or (0x1FB00 <= cp <= 0x1FBEF)
    )

def has_emoji(text):
    """Check if text contains emoji-like characters."""
    for ch in text:
        cp = ord(ch)
        if cp >= 0x2600:
            return True
    return False

emoji_issues = defaultdict(list)

for f in sorted(CONTENT.rglob('*.md')):
    txt = f.read_text(encoding='utf-8')
    rel = str(f.relative_to(CONTENT))
    
    # Find $$...$$ blocks containing emoji
    for m in re.finditer(r'\$\$(.*?)\$\$', txt, re.DOTALL):
        body = m.group(1)
        if has_emoji(body):
            emoji_issues[rel].append({
                'type': 'double_dollar',
                'pos': m.start(),
                'snippet': body[:120]
            })
    
    # Find $...$ blocks containing emoji (single dollar, not double)
    # Split text by $$ first to avoid matching inside display math
    parts = re.split(r'\$\$', txt)
    for i, part in enumerate(parts):
        if i % 2 == 1:  # inside $$ block, skip
            continue
        for m in re.finditer(r'(?<!\$)\$(?!\$)(.+?)\$(?!\$)', part):
            body = m.group(1)
            if has_emoji(body):
                emoji_issues[rel].append({
                    'type': 'single_dollar',
                    'pos': m.start(),
                    'snippet': body[:120]
                })

print(f"=== EMOJI IN MATH ===")
print(f"Files affected: {len(emoji_issues)}")
total_emoji_blocks = sum(len(v) for v in emoji_issues.values())
print(f"Total blocks:   {total_emoji_blocks}")
print()

for fname, issues in emoji_issues.items():
    dd = [i for i in issues if i['type'] == 'double_dollar']
    sd = [i for i in issues if i['type'] == 'single_dollar']
    print(f"  {fname}: {len(issues)} blocks ({len(dd)} $$, {len(sd)} $)")
    for i in issues[:2]:
        chars = i['snippet'][:80].replace('\n', '↲')
        print(f"    [{i['type']}] {chars}...")

# ===================== WIKI LINKS =====================
print()
print("=== WIKI LINKS ===")

# Build slug -> relative path map
slug_map = {}
for f in CONTENT.rglob('*.md'):
    rel = str(f.relative_to(CONTENT))
    slug = f.stem  # Quartz uses stem as slug
    slug_map[slug] = rel

wiki_data = []
for f in sorted(CONTENT.rglob('*.md')):
    txt = f.read_text(encoding='utf-8')
    rel = str(f.relative_to(CONTENT))
    
    # Find [[target|alias]] or [[target]] or [[target#anchor]]
    wiki_links = re.finditer(r'(?<!!)\[\[([^\]]+)\]\]', txt)
    links = []
    for m in wiki_links:
        inner = m.group(1)
        # Parse: target#anchor|alias or target|alias or target#anchor
        parts = re.split(r'[#|]', inner, maxsplit=1)
        target = parts[0].strip()
        
        # Find target in slug_map
        if target in slug_map:
            resolved = slug_map[target]
        else:
            # Try with different separators
            resolved = None
            for k, v in slug_map.items():
                if k == target.split('/')[-1]:
                    resolved = v
                    break
        
        links.append({
            'inner': inner,
            'target': target,
            'resolved': resolved,
            'pos': m.start()
        })
    
    if links:
        wiki_data.append({
            'file': rel,
            'links': links
        })

total_links = sum(len(d['links']) for d in wiki_data)
resolved = sum(1 for d in wiki_data for l in d['links'] if l['resolved'])
unresolved = total_links - resolved
print(f"Files with [[links]]: {len(wiki_data)}")
print(f"Total links:         {total_links}")
print(f"Resolved:             {resolved}")
print(f"Unresolved:           {unresolved}")
print()

# Show unresolved if any
if unresolved:
    print("=== UNRESOLVED LINKS ===")
    for d in wiki_data:
        bad = [l for l in d['links'] if not l['resolved']]
        if bad:
            print(f"  {d['file']}:")
            for l in bad:
                print(f"    [[{l['inner']}]]")

# Show conversion examples
print()
print("=== CONVERSION EXAMPLES ===")
count = 0
for d in wiki_data:
    if count >= 5:
        break
    for l in d['links']:
        if l['resolved'] and count < 5:
            # Get the slug from resolved path
            resolved_path = l['resolved'].replace('\\', '/')
            target_slug = Path(resolved_path).stem
            alias = l['inner'].split('|')[1] if '|' in l['inner'] else None
            
            old = f"[[{l['inner']}]]"
            display = alias if alias else l['target']
            new = f"[{display}]({target_slug})"
            print(f"  {d['file']}:")
            print(f"    OLD: {old}")
            print(f"    NEW: {new}")
            count += 1

# Count link types
link_types = Counter()
for d in wiki_data:
    for l in d['links']:
        if '|' in l['inner']:
            link_types['with_alias'] += 1
        elif '#' in l['inner']:
            link_types['with_anchor'] += 1
        else:
            link_types['plain'] += 1

print(f"\nLink types: plain={link_types['plain']}, alias={link_types['with_alias']}, anchor={link_types['with_anchor']}")
