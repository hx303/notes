"""Task A: Analyze and fix [[wiki links]] in Quartz content."""
import os, re, sys, json
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')

CONTENT = Path(r'G:\OpenClaw-Workspace\notes-website\content')
OBSIDIAN = Path(r'D:\Obsidian\notes\覆水知识库\notes')

# Collect all valid slugs (page filenames without .md)
all_md_files = {}
for md in CONTENT.rglob('*.md'):
    rel = md.relative_to(CONTENT)
    stem = md.stem
    all_md_files[stem] = str(rel)

# Also collect Obsidian pages
obsidian_files = {}
for md in OBSIDIAN.rglob('*.md'):
    rel = md.relative_to(OBSIDIAN)
    stem = md.stem
    obsidian_files[stem] = str(rel)

# Scan all content files for [[...]] wiki links (not ![[...]] image embeds)
wiki_link_files = []
total_links = 0
working = 0
broken = 0

for md_path in CONTENT.rglob('*.md'):
    rel = str(md_path.relative_to(CONTENT))
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find all [[...]] that are not ![[...]]
    # Match [[link|alias]] or [[link]] or [[link#section]]
    wiki_links = []
    for m in re.finditer(r'(?<!!)\[\[([^\[\]]+)\]\]', content):
        inner = m.group(1)
        # Strip anchor and alias: link#anchor|alias
        parts = re.split(r'[#|]', inner, maxsplit=1)
        link_target = parts[0].strip()
        # Also handle alias after |: link|alias#anchor etc
        if '|' in inner:
            link_target = inner.split('|')[0].split('#')[0].strip()
        elif '#' in inner:
            link_target = inner.split('#')[0].strip()
        
        wiki_links.append({
            'full': inner,
            'target': link_target,
            'pos': m.start()
        })
    
    if wiki_links:
        # Check if targets resolve
        file_working = 0
        file_broken = 0
        for wl in wiki_links:
            target = wl['target']
            # Remove any leading path components
            target_name = target.split('/')[-1] if '/' in target else target
            if target_name in all_md_files or target in all_md_files.values():
                wl['status'] = 'ok'
                wl['resolved'] = all_md_files.get(target_name, target)
                file_working += 1
            elif target_name in obsidian_files:
                wl['status'] = 'ok_obsidian'
                wl['resolved'] = obsidian_files.get(target_name, target)
                file_working += 1
            else:
                wl['status'] = 'broken'
                file_broken += 1
        
        wiki_link_files.append({
            'file': rel,
            'total': len(wiki_links),
            'working': file_working,
            'broken': file_broken,
            'links': wiki_links
        })
        total_links += len(wiki_links)
        working += file_working
        broken += file_broken

print(f"=== Wiki Link Analysis ===")
print(f"Files with [[links]]: {len(wiki_link_files)}")
print(f"Total [[links]]:     {total_links}")
print(f"Working:             {working}")
print(f"Broken:              {broken}")
print(f"Pages in content:    {len(all_md_files)}")
print()

# Show broken links
if broken > 0:
    print("=== BROKEN LINKS ===")
    for entry in wiki_link_files:
        broken_links = [l for l in entry['links'] if l['status'] == 'broken']
        if broken_links:
            print(f"\nFile: {entry['file']}")
            for wl in broken_links:
                print(f"  -> [[{wl['full']}]] (target: {wl['target']})")

print()
print("=== ALL FILES WITH WIKI LINKS ===")
for entry in wiki_link_files:
    status = 'OK' if entry['broken'] == 0 else f'{entry["broken"]} broken'
    print(f"  [{status}] {entry['file']} ({entry['working']} ok / {entry['broken']} broken)")
