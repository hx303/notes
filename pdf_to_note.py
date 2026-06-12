#!/usr/bin/env python3
"""PDF → Quartz Markdown 笔记 转换流水线

用法:
  python pdf_to_note.py input.pdf --out-dir "content/🔬 科研笔记/"

执行:
  1. markitdown 提取文字 → paper.md
  2. PyMuPDF 提取内嵌图片 → attachments/
  3. 清理格式 + 生成 frontmatter
  4. 放置到 notes-website 目录下
"""

import os, re, sys, json, argparse
from pathlib import Path
from datetime import datetime

NOTES_ROOT = Path(r"G:\OpenClaw-Workspace\notes-website")


def extract_text(pdf_path: str) -> str:
    """用 markitdown 提取 PDF 文本为 Markdown"""
    from markitdown import MarkItDown
    md = MarkItDown()
    result = md.convert(pdf_path)
    return result.text_content


def extract_images(pdf_path: str, out_dir: Path, prefix: str) -> list[dict]:
    """用 PyMuPDF 提取 PDF 内嵌图片，返回 [(页码, 文件名, 格式), ...]"""
    import fitz
    doc = fitz.open(pdf_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    images = []

    for page_num in range(doc.page_count):
        page = doc[page_num]
        for img_idx, img in enumerate(page.get_images(full=True)):
            xref = img[0]
            base_image = doc.extract_image(xref)
            ext = base_image["ext"]  # png, jpeg, etc.
            img_bytes = base_image["image"]
            w, h = base_image.get("width", 0), base_image.get("height", 0)

            fname = f"{prefix}_图{len(images)+1}.{ext}"
            fpath = out_dir / fname
            with open(fpath, "wb") as f:
                f.write(img_bytes)

            images.append({
                "page": page_num + 1,
                "filename": fname,
                "width": w,
                "height": h,
                "size_kb": len(img_bytes) / 1024,
            })
            print(f"  📸 Page {page_num+1}: {fname} ({w}×{h}, {len(img_bytes)/1024:.1f}KB)")

    doc.close()
    return images


def clean_markdown(text: str, pdf_name: str) -> str:
    """清理 markitdown 输出中的常见问题"""
    lines = text.split("\n")
    cleaned = []
    prev_empty = False

    for line in lines:
        stripped = line.strip()

        # 跳过版权声明行和下载信息
        if any(kw in stripped.lower() for kw in [
            "downloaded from", "wiley online library", "see the terms",
            "© 2017 wiley", "rules of use", "creative commons license",
        ]):
            continue

        # 跳过纯数字页码（单独的页码行）
        if re.match(r'^\d{7,}$', stripped):
            continue

        # 合并连续空行
        if not stripped:
            if not prev_empty:
                cleaned.append("")
                prev_empty = True
            continue
        prev_empty = False

        # 修复常见断词（如 "har-\nvesting" → "harvesting"）
        if cleaned and cleaned[-1].endswith("-") and not stripped.startswith(("-", " ")):
            cleaned[-1] = cleaned[-1][:-1] + stripped
            continue

        cleaned.append(stripped)

    return "\n".join(cleaned)


def find_image_insertion_points(text: str, images: list[dict]) -> dict[int, int]:
    """根据页码估算图片应插入的文字位置"""
    # 简单策略：按段落分布，将图片均匀插入到对应页码范围
    paragraphs = [p for p in text.split("\n\n") if p.strip() and not p.strip().startswith("#")]
    total_paras = len(paragraphs)
    total_pages = max((img["page"] for img in images), default=1)

    insertion = {}
    for img in images:
        ratio = (img["page"] - 1) / total_pages
        para_idx = int(ratio * total_paras)
        para_idx = max(0, min(para_idx, total_paras - 1))
        insertion[para_idx] = insertion.get(para_idx, 0) + 1

    return insertion


def generate_frontmatter(title: str, authors: str, journal: str = "", year: str = "") -> str:
    """生成 YAML frontmatter"""
    tags = ["钙钛矿", "太阳能电池"]
    fm = [
        "---",
        f'title: "{title}"',
        f"author: {authors.split(',')[0].strip() if authors else 'Unknown'}",
    ]
    if year:
        fm.append(f"date: {year}")
    fm.extend([
        "cssclasses:",
        "  - paper",
        "tags:",
    ])
    for t in tags:
        fm.append(f"  - {t}")
    fm.append("---")
    fm.append("")
    return "\n".join(fm)


def extract_metadata(text: str) -> dict:
    """从文本中提取论文元数据"""
    lines = text.strip().split("\n")
    meta = {"title": "Untitled", "authors": "Unknown", "journal": "", "year": ""}

    # 找标题（前几行中较长且非全大写的行）
    candidates = []
    for i, line in enumerate(lines[:30]):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.isupper() and len(stripped) < 20:
            continue  # 跳过 "FULL PAPER" 之类
        if len(stripped) > 30 and not stripped.startswith("www") and not stripped.startswith("http"):
            candidates.append((i, stripped))
    
    if candidates:
        meta["title"] = candidates[0][1]

    # 找作者（"Maarten van Eerden,* Manoj Jaysankar, ..." 模式）
    for line in lines[:40]:
        stripped = line.strip()
        if re.search(r'[A-Z][a-z]+ [a-z]{2,} [A-Z][a-z]+', stripped) and "," in stripped:
            if len(stripped) > 20:
                meta["authors"] = stripped
                break

    # 找期刊
    for line in lines[:10]:
        stripped = line.strip()
        if "Adv." in stripped or "Nature" in stripped or "Science" in stripped or "Journal" in stripped or "Phys." in stripped:
            if len(stripped) < 60:
                meta["journal"] = stripped
                break

    # 找年份
    for line in lines[:60]:
        m = re.search(r'\b(20\d{2})\b', line)
        if m:
            meta["year"] = m.group(1)
            break

    return meta


def insert_images(text: str, images: list[dict], image_dir: str) -> str:
    """在 Markdown 中插入图片引用"""
    # 简单策略：在对应页码的文字附近插入图片
    paragraphs = text.split("\n\n")
    total_paras = len(paragraphs)
    total_pages = max((img["page"] for img in images), default=1)

    # 为每张图片计算插入位置
    img_placements = []
    for img in images:
        ratio = (img["page"] - 1) / (total_pages - 1) if total_pages > 1 else 0
        para_idx = int(ratio * (total_paras - 1))
        para_idx = max(0, min(para_idx, total_paras - 1))
        img_placements.append((para_idx, f"![图{img['page']}]({image_dir}/{img['filename']})"))

    # 从后往前插入，避免索引偏移
    img_placements.sort(key=lambda x: -x[0])
    for para_idx, img_md in img_placements:
        paragraphs.insert(para_idx + 1, img_md)
        # 可能在图片后添加一个空行分隔
        if para_idx + 2 < len(paragraphs) and paragraphs[para_idx + 2].strip():
            paragraphs.insert(para_idx + 2, "")

    return "\n\n".join(paragraphs)


def build_paper_note(text: str, images: list[dict], image_dir: str, meta: dict) -> str:
    """组装完整的论文笔记"""
    # 生成 frontmatter
    fm = generate_frontmatter(meta["title"], meta["authors"], meta["journal"], meta["year"])

    # 清理文本
    text = clean_markdown(text, meta["title"])

    # 移除标题行（frontmatter 已包含），保留正文
    lines = text.strip().split("\n")
    body_lines = []
    in_body = False
    skip_count = 0
    for line in lines:
        stripped = line.strip()
        # 跳过前几行的期刊标题/作者信息
        if not in_body:
            if stripped == meta["title"] or stripped == meta["authors"] or stripped == meta["journal"]:
                skip_count += 1
                continue
            if skip_count >= 1 or (stripped and not stripped.startswith("www") and stripped[0] == "#"):
                in_body = True
        if in_body:
            body_lines.append(line)

    body = "\n".join(body_lines).strip()

    # 插入图片
    if images:
        body = insert_images(body, images, image_dir)

    # 合并
    full = fm + body
    return full


def main():
    parser = argparse.ArgumentParser(description="PDF → Quartz 论文笔记")
    parser.add_argument("pdf", help="PDF 文件路径")
    parser.add_argument("--out-dir", default="content/🔬 科研笔记/", help="输出目录（相对于 notes-website）")
    parser.add_argument("--image-dir", default="./attachments", help="图片相对路径")
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"❌ 文件不存在: {pdf_path}")
        sys.exit(1)

    pdf_name = pdf_path.stem
    note_dir = NOTES_ROOT / args.out_dir
    attach_dir = note_dir / "attachments"

    print(f"\n📄 PDF: {pdf_path.name} ({pdf_path.stat().st_size/1024:.0f} KB)")
    print(f"📁 输出: {note_dir / (pdf_name + '.md')}")

    # Step 1: Extract text
    print("\n📝 Step 1: 提取文字 (markitdown)...")
    text = extract_text(str(pdf_path))
    print(f"   ✅ {len(text):,} chars, ~{text.count(chr(10))} lines")

    # Step 2: Extract images
    print(f"\n🖼️  Step 2: 提取图片 (PyMuPDF)...")
    images = extract_images(str(pdf_path), attach_dir, pdf_name)
    print(f"   ✅ {len(images)} images extracted")

    # Step 3: Extract metadata
    print(f"\n🏷️  Step 3: 提取元数据...")
    meta = extract_metadata(text)
    for k, v in meta.items():
        print(f"   {k}: {v[:80]}")

    # Step 4: Build final note
    print(f"\n🔧 Step 4: 组装笔记...")
    final_md = build_paper_note(text, images, args.image_dir, meta)

    # Step 5: Save
    out_path = note_dir / (pdf_name + ".md")
    note_dir.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(final_md)

    print(f"\n✅ 完成！")
    print(f"   📝 笔记: {out_path}")
    print(f"   🖼️  图片: {attach_dir}/ ({len(images)} 张)")
    print(f"\n   下一步: cd {NOTES_ROOT}; npx quartz build")


if __name__ == "__main__":
    main()
