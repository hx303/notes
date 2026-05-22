"""Fix YAML frontmatter: replace backslashes with forward slashes in Windows paths."""
import os
import sys

CONTENT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "content")

def fix_frontmatter(content: str) -> tuple[str, int]:
    lines = content.split('\n')
    fixes = 0
    in_fm = False
    result = []
    
    for line in lines:
        stripped = line.strip()
        if stripped == '---':
            in_fm = not in_fm
            result.append(line)
            continue
        
        if in_fm and '\\' in line:
            # Replace single backslashes with forward slashes in frontmatter values
            # But preserve YAML escape sequences already present
            old = line
            # Only fix Windows paths: lines containing ":\" pattern
            if ':\\' in line or ':\\\\' in line:
                line = line.replace('\\', '/')
                # Fix double forward slash from previously double-escaped
                line = line.replace('//', '/')
                if line != old:
                    fixes += 1
        
        result.append(line)
    
    return '\n'.join(result), fixes


def main():
    total = 0
    for dirpath, _, filenames in os.walk(CONTENT_DIR):
        for fname in filenames:
            if not fname.endswith('.md'):
                continue
            fpath = os.path.join(dirpath, fname)
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    content = f.read()
            except Exception as e:
                continue
            
            new_content, fixes = fix_frontmatter(content)
            if fixes > 0:
                rel = os.path.relpath(fpath, CONTENT_DIR)
                print(f"  {rel} ({fixes} fixes)")
                with open(fpath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                total += fixes
    
    print(f"\nTotal: {total} fixes across all files")
    return 0

if __name__ == '__main__':
    sys.exit(main())
