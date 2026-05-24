"""Quick test: show first few emoji-in-math examples."""
import sys, re
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')

CONTENT = Path(r'G:\OpenClaw-Workspace\notes-website\content')

target_chars = set('✗✘✅❌⚠️📌💡📝🔥🔬🎤')

found = 0
for f in sorted(CONTENT.rglob('*.md')):
    if found >= 6:
        break
    txt = f.read_text(encoding='utf-8')
    for m in re.finditer(r'\$\$([\s\S]*?)\$\$', txt):
        body = m.group(1)
        if any(c in body for c in target_chars):
            rel = str(f.relative_to(CONTENT))
            start = max(0, m.start() - 80)
            end = min(len(txt), m.end() + 30)
            print(f"=== {rel} ===")
            print(txt[start:end])
            print()
            found += 1
            break
