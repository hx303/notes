# Comprehensive fix for YAML frontmatter issues that crash Quartz build
import os, sys

CONTENT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "content")

def fix_frontmatter(text: str) -> tuple[str, list]:
    """
    Fix YAML frontmatter issues:
    1. Windows paths: backslash sequences replaced with forward slashes
    2. Nested double quotes in YAML strings escaped
    """
    lines = text.split('\n')
    log = []
    in_fm, fm_start, fm_end = False, -1, -1
    
    for i, line in enumerate(lines):
        if line.strip() == '---':
            if not in_fm:
                in_fm, fm_start = True, i
            else:
                fm_end = i
                break
    
    if fm_end < 0:
        return text, log
    
    result = lines.copy()
    
    for i in range(fm_start + 1, fm_end):
        line = lines[i]
        if ':' not in line:
            continue
        
        col_idx = line.index(':')
        key = line[:col_idx]
        value_str = line[col_idx + 1:]
        value = value_str.strip()
        
        new_value = value
        
        # Fix 1: Windows paths with backslashes → forward slashes
        if '\\' in value:
            # Only replace within double-quoted strings to be safe
            if value.startswith('"') and value.endswith('"'):
                inner = value[1:-1]
                if '\\' in inner and inner[0] not in '\\"ntrbfuU':
                    # This is likely a Windows path
                    new_value = '"' + inner.replace('\\', '/') + '"'
        
        # Fix 2: Nested unescaped double quotes in double-quoted YAML strings
        if value.startswith('"') and value.endswith('"'):
            inner = value[1:-1]
            # Count unescaped double quotes inside
            unescaped = 0
            prev = ''
            for c in inner:
                if c == '"' and prev != '\\':
                    unescaped += 1
                prev = c
            if unescaped > 0:
                escaped = inner.replace('"', '\\"')
                new_value = '"' + escaped + '"'
        
        if new_value != value:
            result[i] = key + ':' + value_str[:len(value_str) - len(value)] + new_value
            log.append(f"{key}: {value[:60]}... → fixed")
    
    return '\n'.join(result), log


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
            except Exception:
                continue
            
            new_content, log = fix_frontmatter(content)
            if log:
                rel = os.path.relpath(fpath, CONTENT_DIR)
                print(f"\n{rel}")
                for entry in log:
                    print(f"  {entry}")
                with open(fpath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                total += len(log)
    
    print(f"\nTotal: {total} fixes")
    return 0

if __name__ == '__main__':
    sys.exit(main())
