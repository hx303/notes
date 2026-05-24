"""Test fix on first few files - dry run."""
import sys, re
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')

CONTENT = Path(r'G:\OpenClaw-Workspace\notes-website\content')

REPLACEMENTS = {
    '✗': '\\times',
    '✅': '\\checkmark',
    '❌': '\\times',
    '⚠️': '',
    '📌': '',
    '💡': '',
    '📝': '',
    '🔬': '',
    '🎤': '',
    '🔥': '',
    '📖': '',
    '📚': '',
    '📘': '',
}

def fix_math_emoji(text):
    def fix_block(m):
        body = m.group(1)
        if not any(c in body for c in REPLACEMENTS):
            return m.group(0)
        new_body = body
        for old, new in REPLACEMENTS.items():
            if old in new_body:
                new_body = new_body.replace(old, new)
        return '$$\n' + new_body + '\n$$'
    return re.sub(r'\$\$([\s\S]*?)\$\$', fix_block, text)

found = 0
for f in sorted(CONTENT.rglob('*.md')):
    txt = f.read_text(encoding='utf-8')
    
    # Check if has emoji in math
    has_issue = False
    for m in re.finditer(r'\$\$([\s\S]*?)\$\$', txt):
        if any(c in m.group(1) for c in REPLACEMENTS):
            has_issue = True
            break
    
    if has_issue and found < 4:
        rel = str(f.relative_to(CONTENT))
        new_txt = fix_math_emoji(txt)
        if new_txt != txt:
            print(f"=== {rel} (would change) ===")
            # Show first diff
            lines_old = txt.split('\n')
            lines_new = new_txt.split('\n')
            for i, (lo, ln) in enumerate(zip(lines_old, lines_new)):
                if lo != ln:
                    ctx_start = max(0, i-1)
                    ctx_end = min(len(lines_old), i+3)
                    print(f"  ...lines {ctx_start}-{ctx_end}:")
                    for j in range(ctx_start, ctx_end):
                        if j == i:
                            print(f"  - {lines_old[j][:100]}")
                            print(f"  + {lines_new[j][:100]}")
                        else:
                            print(f"    {lines_old[j][:100]}")
                    break
            print()
            found += 1

print("Dry run complete.")
