import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

content_dir = r'G:\OpenClaw-Workspace\notes-website\content'

# Find notes with ![[...]] image refs
found = []
for root, dirs, files in os.walk(content_dir):
    for f in files:
        if not f.endswith('.md'):
            continue
        fp = os.path.join(root, f)
        with open(fp, encoding='utf-8') as fh:
            text = fh.read()
        refs = re.findall(r'!\[\[(.*?)\]\]', text)
        if refs:
            rel = os.path.relpath(fp, content_dir)
            note_dir = os.path.dirname(fp)
            found.append((rel, note_dir, refs))

print(f'Notes with image refs: {len(found)}')
for rel, note_dir, refs in found:
    print(f'\n--- {rel} ---')
    for ref in refs:
        # Clean up ref (remove size suffix like |697)
        clean_ref = ref.split('|')[0].strip()
        # Check in same dir
        same_dir = os.path.join(note_dir, clean_ref)
        # Check in note_dir subdirs
        found_any = False
        for root, dirs, files in os.walk(note_dir):
            for fname in files:
                if fname == clean_ref or fname == os.path.basename(clean_ref):
                    sub = os.path.relpath(os.path.join(root, fname), note_dir)
                    print(f'  ![[{ref}]] => FOUND: {sub}')
                    found_any = True
                    break
            if found_any:
                break
        if not found_any:
            print(f'  ![[{ref}]] => MISSING')
