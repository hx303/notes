import os, sys
OBSIDIAN_DIR = r"D:\Obsidian\notes\覆水知识库\notes"
MEDIA_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp",
                    ".mp4", ".webm", ".mov", ".avi", ".mkv",
                    ".mp3", ".wav", ".ogg", ".m4a", ".pdf"}
EXCLUDE_PATTERNS = ["private", "templates", ".obsidian", ".trash", ".git", "__pycache__", "node_modules", "_backup"]

count = 0
total_size = 0
for dirpath, dirnames, filenames in os.walk(OBSIDIAN_DIR, topdown=True):
    dirnames[:] = [d for d in dirnames if not any(pat in (dirpath + "\\" + d).lower() for pat in EXCLUDE_PATTERNS)]
    for fname in filenames:
        ext = os.path.splitext(fname)[1].lower()
        if ext not in MEDIA_EXTENSIONS:
            continue
        if "_backup" in fname.lower():
            continue
        fpath = os.path.join(dirpath, fname)
        size = os.path.getsize(fpath)
        total_size += size
        count += 1
        rel = os.path.relpath(fpath, OBSIDIAN_DIR)
        if count <= 20:
            print(f"  {rel} ({size/1024:.1f} KB)")

print(f"\nTotal: {count} media files, {total_size/1024/1024:.1f} MB")
