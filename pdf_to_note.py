#!/usr/bin/env python3
"""
PDF → Quartz 论文笔记 转换流水线

默认模式（整页渲染 + 手写摘要）:
  python pdf_to_note.py input.pdf --out-dir "content/🔬 科研笔记/"
  → 渲染 200dpi 页面 PNG → attachments/
  → 生成含 paper-meta card + abstract 占位 + 页面图的 .md

旧模式（markitdown 文字提取，仅限单栏 PDF）:
  python pdf_to_note.py input.pdf --mode=markitdown

用法:
  python pdf_to_note.py paper.pdf
  python pdf_to_note.py paper.pdf --dpi 300 --mode render
  python pdf_to_note.py paper.pdf --mode markitdown  # 仅单栏 PDF
"""

import os, re, sys, json, argparse
from pathlib import Path
from datetime import datetime

NOTES_ROOT = Path(r"G:\OpenClaw-Workspace\notes-website")


# ── 公共：PDF 页数 ────────────────────────────────────────────
def get_page_count(pdf_path: str) -> int:
    import fitz
    doc = fitz.open(pdf_path)
    n = doc.page_count
    doc.close()
    return n


# ═══════════════════════════════════════════════════════════════
# 模式 A: 整页渲染（默认）
# ═══════════════════════════════════════════════════════════════

def render_pages(pdf_path: str, out_dir: Path, prefix: str, dpi: int = 200) -> list[str]:
    """用 PyMuPDF 渲染 PDF 每一页为 PNG，返回文件名列表"""
    import fitz
    doc = fitz.open(pdf_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    filenames = []

    for i in range(doc.page_count):
        page = doc[i]
        pix = page.get_pixmap(dpi=dpi)
        fname = f"{prefix}_p{i+1:02d}.png"
        fpath = out_dir / fname
        pix.save(str(fpath))
        kb = fpath.stat().st_size / 1024
        filenames.append(fname)
        print(f"  📄 Page {i+1}/{doc.page_count}: {fname} ({pix.width}×{pix.height}, {kb:.0f} KB)")

    doc.close()
    return filenames


def extract_metadata_from_pdf(pdf_path: str) -> dict:
    """从 PDF 元数据和第一页文字提取论文元数据"""
    import fitz
    doc = fitz.open(pdf_path)

    meta = {
        "title": "Untitled",
        "authors": "Unknown",
        "journal": "",
        "year": "",
        "doi": "",
    }

    # 尝试 PDF 内置元数据
    pdf_meta = doc.metadata
    if pdf_meta.get("title"):
        meta["title"] = pdf_meta["title"].strip()
    if pdf_meta.get("author"):
        meta["authors"] = pdf_meta["author"].strip()

    # 从第一页文字提取
    page1_text = doc[0].get_text("text")

    # 找 DOI
    doi_match = re.search(r'10\.\d{4,}/[^\s]+', page1_text)
    if doi_match:
        meta["doi"] = doi_match.group(0).rstrip(".,;")

    # 找年份
    year_match = re.search(r'\b(20[01]\d)\b', page1_text)
    if year_match:
        meta["year"] = year_match.group(1)

    # 从文件名或标题页推断期刊
    lines = [l.strip() for l in page1_text.split("\n") if l.strip()]
    for line in lines[:10]:
        if any(kw in line.lower() for kw in ["Adv.", "Nature", "Science", "Journal", "Phys.", "Solar", "Energy"]):
            if len(line) < 80 and len(line) > 5:
                meta["journal"] = line
                break

    doc.close()
    return meta


def build_render_note(pdf_name: str, page_files: list[str], meta: dict,
                       attach_rel: str = "./attachments") -> str:
    """生成渲染模式的 Markdown 笔记"""

    # Frontmatter
    tags = ["钙钛矿", "太阳能电池", "光学分析"]
    fm_lines = [
        "---",
        f'title: "{meta["title"]}"',
        f'author: {meta["authors"].split(",")[0].strip() if meta["authors"] else "Unknown"}',
        f'date: {meta["year"] or datetime.now().year}',
        "cssclasses:",
        "  - paper",
        "tags:",
    ]
    for t in tags:
        fm_lines.append(f"  - {t}")
    if meta["doi"]:
        fm_lines.append(f'doi: "{meta["doi"]}"')
    if meta["journal"]:
        fm_lines.append(f'journal: "{meta["journal"]}"')
    fm_lines.append("---")
    fm = "\n".join(fm_lines)

    # 排版 metadata 变量
    display_title = meta["title"]
    display_authors = meta["authors"]
    display_journal = meta["journal"] or "期刊信息待补充"
    display_doi = meta["doi"] or "待补充"
    if meta["doi"]:
        doi_link = f'https://doi.org/{meta["doi"]}'
        display_doi = f'<a href="{doi_link}" target="_blank">{meta["doi"]}</a>'
    if meta["year"]:
        display_journal = f'{display_journal} · {meta["year"]}'

    # 页面图片
    page_descriptions = _get_page_descriptions(len(page_files))
    page_imgs = []
    for i, fname in enumerate(page_files):
        desc = page_descriptions[i] if i < len(page_descriptions) else f"Page {i+1}"
        page_imgs.append(f"![{desc}]({attach_rel}/{fname})")

    tag_span = "".join(f'\n    <span class="paper-tag">{t}</span>' for t in tags)

    note = fm + f"""

<div class="paper-meta">
  <span class="paper-title">{display_title}</span>
  <span class="paper-authors">✍ {display_authors}</span>
  <span class="paper-journal">📄 {display_journal}</span>
  <span class="paper-doi">📎 DOI: {display_doi}</span>
  <div class="paper-tags">{tag_span}
  </div>
</div>

> [!abstract] 摘要
> *（待补充 — 阅读论文后在此处填写中文摘要）*
>
> **关键词：** 待补充

---

> [!key-finding] 核心发现
>
> *（待补充 — 列出 3–5 条核心发现）*

---

## 📖 论文全文（渲染页）

> **注：** 以下为高分辨率渲染的原始页面，可直接阅读。

""" + "\n\n".join(page_imgs)

    return note


def _get_page_descriptions(num_pages: int) -> list[str]:
    """为各页生成描述性 alt-text"""
    # 通用模板，可根据论文类型调整
    descriptions = {
        1: "Page 1 — 标题、作者与摘要",
        2: "Page 2 — 引言（Introduction）",
        3: "Page 3 — 结果与讨论",
    }
    mid_start = 4
    mid_end = num_pages - 2
    result = []
    for i in range(1, num_pages + 1):
        if i in descriptions:
            result.append(descriptions[i])
        elif i == num_pages - 1:
            result.append(f"Page {i} — 实验方法（Experimental Section）")
        elif i == num_pages:
            result.append(f"Page {i} — 参考文献（References）")
        else:
            result.append(f"Page {i}")
    return result


# ═══════════════════════════════════════════════════════════════
# 模式 B: markitdown 文字提取（旧模式，仅限单栏 PDF）
# ═══════════════════════════════════════════════════════════════

def extract_text(pdf_path: str) -> str:
    from markitdown import MarkItDown
    md = MarkItDown()
    result = md.convert(pdf_path)
    return result.text_content


def extract_images(pdf_path: str, out_dir: Path, prefix: str) -> list[dict]:
    import fitz
    doc = fitz.open(pdf_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    images = []
    for page_num in range(doc.page_count):
        page = doc[page_num]
        for img in page.get_images(full=True):
            xref = img[0]
            base_image = doc.extract_image(xref)
            ext = base_image["ext"]
            img_bytes = base_image["image"]
            w, h = base_image.get("width", 0), base_image.get("height", 0)
            fname = f"{prefix}_图{len(images)+1}.{ext}"
            fpath = out_dir / fname
            with open(fpath, "wb") as f:
                f.write(img_bytes)
            images.append({"page": page_num + 1, "filename": fname, "width": w, "height": h, "size_kb": len(img_bytes) / 1024})
            print(f"  📸 Page {page_num+1}: {fname} ({w}×{h}, {len(img_bytes)/1024:.1f}KB)")
    doc.close()
    return images


def clean_markdown(text: str, pdf_name: str) -> str:
    lines = text.split("\n")
    cleaned = []
    prev_empty = False
    for line in lines:
        stripped = line.strip()
        if any(kw in stripped.lower() for kw in [
            "downloaded from", "wiley online library", "see the terms",
            "© 2017 wiley", "rules of use", "creative commons license",
        ]):
            continue
        if re.match(r'^\d{7,}$', stripped):
            continue
        if not stripped:
            if not prev_empty:
                cleaned.append("")
                prev_empty = True
            continue
        prev_empty = False
        if cleaned and cleaned[-1].endswith("-") and not stripped.startswith(("-", " ")):
            cleaned[-1] = cleaned[-1][:-1] + stripped
            continue
        cleaned.append(stripped)
    return "\n".join(cleaned)


def insert_images(text: str, images: list[dict], image_dir: str) -> str:
    paragraphs = text.split("\n\n")
    total_paras = len(paragraphs)
    total_pages = max((img["page"] for img in images), default=1)
    img_placements = []
    for img in images:
        ratio = (img["page"] - 1) / (total_pages - 1) if total_pages > 1 else 0
        para_idx = int(ratio * (total_paras - 1))
        para_idx = max(0, min(para_idx, total_paras - 1))
        img_placements.append((para_idx, f"![图{img['page']}]({image_dir}/{img['filename']})"))
    img_placements.sort(key=lambda x: -x[0])
    for para_idx, img_md in img_placements:
        paragraphs.insert(para_idx + 1, img_md)
        if para_idx + 2 < len(paragraphs) and paragraphs[para_idx + 2].strip():
            paragraphs.insert(para_idx + 2, "")
    return "\n\n".join(paragraphs)


def extract_metadata(text: str) -> dict:
    lines = text.strip().split("\n")
    meta = {"title": "Untitled", "authors": "Unknown", "journal": "", "year": ""}
    candidates = []
    for i, line in enumerate(lines[:30]):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.isupper() and len(stripped) < 20:
            continue
        if len(stripped) > 30 and not stripped.startswith(("www", "http")):
            candidates.append((i, stripped))
    if candidates:
        meta["title"] = candidates[0][1]
    for line in lines[:40]:
        stripped = line.strip()
        if re.search(r'[A-Z][a-z]+ [a-z]{2,} [A-Z][a-z]+', stripped) and "," in stripped:
            if len(stripped) > 20:
                meta["authors"] = stripped
                break
    for line in lines[:10]:
        stripped = line.strip()
        if any(k in stripped for k in ["Adv.", "Nature", "Science", "Journal", "Phys."]):
            if len(stripped) < 60:
                meta["journal"] = stripped
                break
    for line in lines[:60]:
        m = re.search(r'\b(20\d{2})\b', line)
        if m:
            meta["year"] = m.group(1)
            break
    return meta


def generate_frontmatter(title: str, authors: str, journal: str = "", year: str = "") -> str:
    tags = ["钙钛矿", "太阳能电池"]
    fm = [
        "---",
        f'title: "{title}"',
        f"author: {authors.split(',')[0].strip() if authors else 'Unknown'}",
    ]
    if year:
        fm.append(f"date: {year}")
    fm.extend(["cssclasses:", "  - paper", "tags:"])
    for t in tags:
        fm.append(f"  - {t}")
    fm.append("---")
    fm.append("")
    return "\n".join(fm)


def build_markitdown_note(text: str, images: list[dict], image_dir: str, meta: dict) -> str:
    fm = generate_frontmatter(meta["title"], meta["authors"], meta["journal"], meta["year"])
    text = clean_markdown(text, meta["title"])
    lines = text.strip().split("\n")
    body_lines = []
    in_body = False
    skip_count = 0
    for line in lines:
        stripped = line.strip()
        if not in_body:
            if stripped == meta["title"] or stripped == meta["authors"] or stripped == meta["journal"]:
                skip_count += 1
                continue
            if skip_count >= 1 or (stripped and not stripped.startswith("www") and stripped[0] == "#"):
                in_body = True
        if in_body:
            body_lines.append(line)
    body = "\n".join(body_lines).strip()
    if images:
        body = insert_images(body, images, image_dir)
    return fm + body


# ═══════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="PDF → Quartz 论文笔记（默认：整页渲染 + 摘要占位）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python pdf_to_note.py paper.pdf
  python pdf_to_note.py paper.pdf --dpi 300
  python pdf_to_note.py paper.pdf --mode markitdown   # 仅单栏 PDF
        """,
    )
    parser.add_argument("pdf", help="PDF 文件路径")
    parser.add_argument("--out-dir", default=r"content\🔬 科研笔记", help="输出目录（相对于 notes-website）")
    parser.add_argument("--image-dir", default="./attachments", help="图片相对路径（markdown 引用用）")
    parser.add_argument("--dpi", type=int, default=200, help="渲染 DPI（默认 200）")
    parser.add_argument("--mode", choices=["render", "markitdown"], default="render",
                        help="模式：render（默认，整页渲染）| markitdown（文字提取，仅限单栏 PDF）")
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"❌ 文件不存在: {pdf_path}")
        sys.exit(1)

    pdf_name = pdf_path.stem
    note_dir = NOTES_ROOT / args.out_dir
    attach_dir = note_dir / "attachments"
    note_dir.mkdir(parents=True, exist_ok=True)
    attach_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n📄 PDF: {pdf_path.name} ({pdf_path.stat().st_size / 1024:.0f} KB)")
    print(f"📁 输出: {note_dir / (pdf_name + '.md')}")
    print(f"🎯 模式: {args.mode}")
    print(f"📄 页数: {get_page_count(str(pdf_path))}")

    if args.mode == "render":
        # ── 渲染模式 ──
        print(f"\n🖼️  Step 1: 渲染页面 (DPI={args.dpi})...")
        page_files = render_pages(str(pdf_path), attach_dir, pdf_name, args.dpi)
        print(f"   ✅ {len(page_files)} pages rendered")

        print(f"\n🏷️  Step 2: 提取元数据...")
        meta = extract_metadata_from_pdf(str(pdf_path))
        for k, v in meta.items():
            print(f"   {k}: {v[:100] if v else '(空)'}")

        print(f"\n📝 Step 3: 生成笔记...")
        note = build_render_note(pdf_name, page_files, meta, args.image_dir)

    else:
        # ── markitdown 模式（旧） ──
        print(f"\n📝 Step 1: 提取文字 (markitdown)...")
        text = extract_text(str(pdf_path))
        print(f"   ✅ {len(text):,} chars")

        print(f"\n🖼️  Step 2: 提取图片 (PyMuPDF)...")
        images = extract_images(str(pdf_path), attach_dir, pdf_name)
        print(f"   ✅ {len(images)} images")

        print(f"\n🏷️  Step 3: 提取元数据...")
        meta = extract_metadata(text)
        for k, v in meta.items():
            print(f"   {k}: {v[:80]}")

        print(f"\n🔧 Step 4: 组装笔记...")
        note = build_markitdown_note(text, images, args.image_dir, meta)

    # 保存
    out_path = note_dir / (pdf_name + ".md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(note)

    print(f"\n{'='*50}")
    print(f"✅ 完成！")
    print(f"   📝 笔记: {out_path}")
    print(f"   🖼️  资源: {attach_dir}/")
    print(f"   📋 下一步: 打开笔记，补充摘要 + 核心发现")
    print(f"            cd {NOTES_ROOT}; npx quartz build")


if __name__ == "__main__":
    main()
