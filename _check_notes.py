"""Check notes for common issues: missing frontmatter, wiki links, thin content."""
import os, re, sys

sys.stdout.reconfigure(encoding='utf-8')
root = r'G:\OpenClaw-Workspace\notes-website\content'
issues = {'no_title': [], 'no_date': [], 'wiki_links': [], 'small_notes': []}

for dirpath, dirnames, filenames in os.walk(root):
    for fname in filenames:
        if not fname.endswith('.md'):
            continue
        fpath = os.path.join(dirpath, fname)
        rel = os.path.relpath(fpath, root)
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Check frontmatter
        fm_match = re.match(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
        has_title = False
        has_date = False
        if fm_match:
            fm = fm_match.group(1)
            has_title = bool(re.search(r'^title:\s*\S', fm, re.MULTILINE))
            has_date = bool(re.search(r'^(date|created):\s*\S', fm, re.MULTILINE))
        else:
            has_title = bool(re.search(r'^#\s+\S', content, re.MULTILINE))

        if not has_title:
            issues['no_title'].append(rel)
        if not has_date:
            issues['no_date'].append(rel)

        # Wiki links [[...]]
        wiki_links = re.findall(r'\[\[([^\]]+)\]\]', content)
        if wiki_links:
            issues['wiki_links'].append((rel, wiki_links))

        # Thin content
        body = re.sub(r'^---.*?---\s*', '', content, flags=re.DOTALL).strip()
        if 0 < len(body) < 200:
            issues['small_notes'].append((rel, len(body)))

# Report
print("=== MISSING TITLE ===")
for f in issues['no_title'][:15]:
    print(f"  !! {f}")
if len(issues['no_title']) > 15:
    print(f"  ... and {len(issues['no_title']) - 15} more")

print(f"\n=== MISSING DATE (total: {len(issues['no_date'])}) ===")
for f in issues['no_date'][:15]:
    print(f"  ?? {f}")
if len(issues['no_date']) > 15:
    print(f"  ... and {len(issues['no_date']) - 15} more")

print(f"\n=== WIKI LINKS [[ ]] (files: {len(issues['wiki_links'])}) ===")
for rel, links in issues['wiki_links'][:10]:
    preview = ", ".join(links[:3])
    print(f"  @@ {rel}: [{preview}]")
if len(issues['wiki_links']) > 10:
    print(f"  ... and {len(issues['wiki_links']) - 10} more")

print(f"\n=== THIN CONTENT <200 chars (total: {len(issues['small_notes'])}) ===")
for rel, size in issues['small_notes'][:10]:
    print(f"  .. {rel} ({size} chars)")
if len(issues['small_notes']) > 10:
    print(f"  ... and {len(issues['small_notes']) - 10} more")

print(f"\n=== SUMMARY ===")
print(f"Files with missing title: {len(issues['no_title'])}")
print(f"Files with missing date: {len(issues['no_date'])}")
print(f"Files with wiki links: {len(issues['wiki_links'])}")
print(f"Thin content files: {len(issues['small_notes'])}")
total = sum(1 for _, _, fns in os.walk(root) for f in fns if f.endswith('.md'))
print(f"Total files scanned: {total}")
