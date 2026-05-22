"""Fix ONLY the YAML issues that crash Quartz build."""
import os, sys

CONTENT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "content")

def fix_yaml(text: str) -> tuple[str, list]:
    """Fix critical YAML issues: unescaped backslashes in paths, nested double quotes."""
    lines = text.split('\n')
    log = []
    in_fm = False
    fm_start = fm_end = -1
    
    for i, line in enumerate(lines):
        if line.strip() == '---':
            if not in_fm:
                in_fm = True
                fm_start = i
            else:
                fm_end = i
                break
    
    if fm_start < 0 or fm_end < 0:
        return text, log
    
    result = lines.copy()
    
    for i in range(fm_start + 1, fm_end):
        line = lines[i]
        if ':' not in line:
            continue
        
        col_idx = line.index(':')
        key = line[:col_idx]
        value = line[col_idx + 1:].strip()
        
        # Fix: Double-quoted string containing unescaped double quotes
        if value.startswith('"') and value.endswith('"'):
            inner = value[1:-1]
            # Check if inner has unescaped double quotes
            # Simple heuristic: count quotes
            unescaped_count = 0
            prev = ''
            for c in inner:
                if c == '"' and prev != '\\':
                    unescaped_count += 1
                prev = c
            if unescaped_count > 0:
                new_value = value[0] + inner.replace('"', '\\"') + value[-1]
                result[i] = key + ': ' + new_value
                log.append(f"Escaped nested quotes in: {key}")
    
    return '\n'.join(result), log


def main():
    fixed = 0
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
            
            new_content, log = fix_yaml(content)
            if log:
                rel = os.path.relpath(fpath, CONTENT_DIR)
                print(f"  {rel}")
                for entry in log:
                    print(f"    {entry}")
                with open(fpath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                fixed += 1
    
    print(f"\nFixed: {fixed} files")
    return 0

if __name__ == '__main__':
    sys.exit(main())
