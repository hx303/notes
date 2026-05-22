#!/usr/bin/env python3
"""
Sync Obsidian notes → Quartz website content, then git push.
Usage:
  python sync_notes.py                    # Interactive mode: pick files
  python sync_notes.py --all              # Sync ALL notes
  python sync_notes.py --list             # List available notes without syncing
  python sync_notes.py --push-only        # Only git add/commit/push (no copy)
"""

import os
import sys
import shutil
import subprocess
import json
import re
from pathlib import Path
from datetime import datetime

# ==================== CONFIG ====================
OBSIDIAN_DIR = r"D:\Obsidian\notes\覆水知识库\notes"
QUARTZ_CONTENT = r"G:\OpenClaw-Workspace\notes-website\content"
QUARTZ_ROOT = r"G:\OpenClaw-Workspace\notes-website"
STATE_FILE = r"G:\OpenClaw-Workspace\notes-website\.sync_state.json"

# Folders to exclude from Obsidian (private / system)
EXCLUDE_PATTERNS = [
    "private", "templates", ".obsidian", ".trash",
    ".git", "__pycache__", "node_modules",
    "_backup",  # skip backup files
]

# Media file extensions to sync alongside notes
MEDIA_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp",
                    ".mp4", ".webm", ".mov", ".avi", ".mkv",
                    ".mp3", ".wav", ".ogg", ".m4a",
                    ".pdf"}


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"synced": {}, "last_sync": None}


def save_state(state):
    state["last_sync"] = datetime.now().isoformat()
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


def find_markdown_files(root_dir, exclude_patterns):
    """Find all .md files, respecting directory exclusions."""
    files = []
    for dirpath, dirnames, filenames in os.walk(root_dir, topdown=True):
        # Filter excluded directories
        dirnames[:] = [
            d for d in dirnames
            if not any(pat in os.path.join(dirpath, d).lower() for pat in exclude_patterns)
        ]
        rel_dir = os.path.relpath(dirpath, root_dir)
        for fname in filenames:
            if not fname.lower().endswith(".md"):
                continue
            # Skip backup files
            if "_backup" in fname.lower():
                continue
            src_path = os.path.join(dirpath, fname)
            rel_path = os.path.join(rel_dir, fname) if rel_dir != "." else fname
            files.append({
                "src": src_path,
                "rel": rel_path,
                "size": os.path.getsize(src_path),
                "mtime": os.path.getmtime(src_path),
            })
    return files


def list_notes():
    """List available notes with size info."""
    files = find_markdown_files(OBSIDIAN_DIR, EXCLUDE_PATTERNS)
    if not files:
        print("No .md files found in Obsidian notes directory.")
        return []

    print(f"\n📂 Found {len(files)} notes in Obsidian:\n")
    for i, f in enumerate(files, 1):
        kb = f["size"] / 1024
        print(f"  [{i:3d}] {f['rel']}  ({kb:.1f} KB)")

    return files


def fix_frontmatter_yaml(content: str) -> str:
    """Fix YAML frontmatter issues that crash Quartz build."""
    lines = content.split('\n')
    in_fm, fm_start, fm_end = False, -1, -1
    for i, line in enumerate(lines):
        if line.strip() == '---':
            if not in_fm:
                in_fm, fm_start = True, i
            else:
                fm_end = i
                break
    if fm_end < 0:
        return content

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
        # Fix: backslashes in double-quoted strings → forward slashes
        if value.startswith('"') and value.endswith('"'):
            inner = value[1:-1]
            if '\\' in inner:
                new_value = '"' + inner.replace('\\', '/') + '"'
            # Fix: nested double quotes
            if '"' in inner.replace('\\"', ''):
                new_value = '"' + inner.replace('"', '\\"') + '"'
        if new_value != value:
            result[i] = key + ':' + value_str[:len(value_str) - len(value)] + new_value
    return '\n'.join(result)


def find_media_files(root_dir, exclude_patterns):
    """Find all media files alongside notes."""
    files = []
    for dirpath, dirnames, filenames in os.walk(root_dir, topdown=True):
        dirnames[:] = [
            d for d in dirnames
            if not any(pat in (dirpath + "\\" + d).lower() for pat in exclude_patterns)
        ]
        rel_dir = os.path.relpath(dirpath, root_dir)
        for fname in filenames:
            ext = os.path.splitext(fname)[1].lower()
            if ext not in MEDIA_EXTENSIONS:
                continue
            if "_backup" in fname.lower():
                continue
            src_path = os.path.join(dirpath, fname)
            rel_path = os.path.join(rel_dir, fname) if rel_dir != "." else fname
            files.append({"src": src_path, "rel": rel_path, "size": os.path.getsize(src_path)})
    return files


def copy_note_to_quartz(src_path, rel_path):
    """Copy a single note to Quartz content directory, fixing YAML frontmatter."""
    dest = os.path.join(QUARTZ_CONTENT, rel_path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(src_path, "r", encoding="utf-8") as f:
        content = f.read()
    content = fix_frontmatter_yaml(content)
    with open(dest, "w", encoding="utf-8") as f:
        f.write(content)
    return dest


def git_commit_and_push(message="Update notes"):
    """Run git add, commit, push in Quartz repo."""
    print("\n📤 Pushing to GitHub...")
    cmds = [
        f"git -C {QUARTZ_ROOT} add content/",
        f"git -C {QUARTZ_ROOT} commit -m \"{message}\"",
        f"git -C {QUARTZ_ROOT} push origin HEAD:main",
    ]
    for cmd in cmds:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if result.returncode != 0:
            # "nothing to commit" is not a real error
            stderr = (result.stderr or "")
            stdout = (result.stdout or "")
            if "nothing to commit" in stderr or "nothing to commit" in stdout:
                print("  (no changes to commit)")
                return True
            print(f"  ⚠️  {stderr.strip()}")
        else:
            output = ((result.stdout or "") + (result.stderr or "")).strip()
            if output:
                print(f"  {output}")
    return True


def interactive_sync():
    """Interactive mode: pick files to sync."""
    files = list_notes()
    if not files:
        return

    print("\n" + "=" * 60)
    print("Type numbers to sync (comma/space separated), e.g.: 1,3,5-8")
    print("Or: 'all' / 'q' to quit")
    print("=" * 60)

    choice = input("\nSelect notes > ").strip()

    if choice.lower() == "q":
        print("Cancelled.")
        return
    if choice.lower() == "all":
        selected = files
    else:
        indices = parse_selection(choice, len(files))
        selected = [files[i] for i in indices]

    if not selected:
        print("No valid selection.")
        return

    print(f"\n📋 Syncing {len(selected)} notes...")
    state = load_state()
    synced = []

    for f in selected:
        dest = copy_note_to_quartz(f["src"], f["rel"])
        state["synced"][f["rel"]] = {
            "mtime": f["mtime"],
            "size": f["size"],
            "synced_at": datetime.now().isoformat(),
        }
        synced.append(f["rel"])
        print(f"  ✅ {f['rel']}")

    save_state(state)

    # Git push
    print()
    confirm = input("Push to GitHub? [Y/n] ").strip().lower()
    if confirm in ("", "y", "yes"):
        note_names = ", ".join(s.rsplit(".md", 1)[0] for s in synced)
        git_commit_and_push(f"Sync notes: {note_names}")
        print("\n🎉 Done! GitHub Actions will deploy automatically.")
    else:
        print("Files copied locally. Run 'python sync_notes.py --push-only' to push later.")


def parse_selection(text, max_index):
    """Parse selection like '1,3,5-8' into list of 0-based indices."""
    indices = set()
    for part in re.split(r"[,\s]+", text.strip()):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            try:
                start, end = part.split("-", 1)
                start, end = int(start), int(end)
                for i in range(max(1, start), min(end, max_index) + 1):
                    indices.add(i - 1)
            except ValueError:
                pass
        else:
            try:
                i = int(part)
                if 1 <= i <= max_index:
                    indices.add(i - 1)
            except ValueError:
                pass
    return sorted(indices)


def sync_all():
    """Sync all notes and media from Obsidian to Quartz."""
    files = find_markdown_files(OBSIDIAN_DIR, EXCLUDE_PATTERNS)
    media = find_media_files(OBSIDIAN_DIR, EXCLUDE_PATTERNS)

    if not files and not media:
        print("No notes found.")
        return

    print(f"\n📋 Syncing {len(files)} notes + {len(media)} media files...")
    state = load_state()

    for f in files:
        dest = copy_note_to_quartz(f["src"], f["rel"])
        state["synced"][f["rel"]] = {
            "mtime": f["mtime"],
            "size": f["size"],
            "synced_at": datetime.now().isoformat(),
        }

    for m in media:
        dest = os.path.join(QUARTZ_CONTENT, m["rel"])
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(m["src"], dest)

    save_state(state)
    total = len(files) + len(media)
    git_commit_and_push(f"Sync all ({len(files)} notes + {len(media)} media files)")
    print(f"\n✅ {len(files)} notes synced.")
    print(f"✅ {len(media)} media files synced.")
    print(f"\n🎉 Total: {total} files pushed!")


def main():
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd == "--all":
            sync_all()
        elif cmd == "--list":
            list_notes()
        elif cmd == "--push-only":
            git_commit_and_push()
        elif cmd == "--help":
            print(__doc__)
        else:
            print(f"Unknown option: {cmd}")
            print(__doc__)
    else:
        interactive_sync()


if __name__ == "__main__":
    main()
