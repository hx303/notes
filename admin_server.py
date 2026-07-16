#!/usr/bin/env python3
"""
Notes-Website Admin Server
===========================
本地 FastAPI 服务器 — 提供 PDF 导入等管理功能

启动:
  python admin_server.py
  python admin_server.py --port 8765

功能:
  POST /api/import-pdf    上传 PDF → 自动转换 + 渲染 + 提交到 git
  GET  /api/status         检查服务状态
"""

import os, sys, shutil, subprocess, json
from pathlib import Path
from datetime import datetime

NOTES_ROOT = Path(r"G:\OpenClaw-Workspace\notes-website")
CONTENT_DIR = NOTES_ROOT / "content" / "🔬 科研笔记"
UPLOAD_DIR = NOTES_ROOT / "_tmp_uploads"

try:
    from fastapi import FastAPI, UploadFile, File, Form
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import HTMLResponse, JSONResponse
    import uvicorn
except ImportError:
    print("❌ 缺少依赖，请先安装：pip install fastapi uvicorn python-multipart PyMuPDF")
    sys.exit(1)

app = FastAPI(title="Notes Admin Server", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Utils ──────────────────────────────────────────────────────

# Ensure pdf_to_note is importable
sys.path.insert(0, str(NOTES_ROOT))


def render_pages(pdf_path: str, out_dir: Path, prefix: str, dpi: int = 200) -> list[str]:
    """Render PDF pages to PNG"""
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
        filenames.append(fname)
    doc.close()
    return filenames


def extract_metadata(pdf_path: str) -> dict:
    """Extract paper metadata from PDF"""
    import fitz, re
    doc = fitz.open(pdf_path)
    meta = {"title": "Untitled", "authors": "Unknown", "doi": "", "year": ""}
    pdf_meta = doc.metadata
    if pdf_meta.get("title"):
        meta["title"] = pdf_meta["title"].strip()
    if pdf_meta.get("author"):
        meta["authors"] = pdf_meta["author"].strip()
    page1_text = doc[0].get_text("text")
    doi_match = re.search(r'10\.\d{4,}/[^\s]+', page1_text)
    if doi_match:
        meta["doi"] = doi_match.group(0).rstrip(".,;")
    year_match = re.search(r'\b(20[01]\d)\b', page1_text)
    if year_match:
        meta["year"] = year_match.group(1)
    doc.close()
    return meta


def build_note(pdf_name: str, page_files: list[str], meta: dict,
               dpi: int, attach_rel: str = "./attachments") -> str:
    """Build the markdown note"""
    tags = ["钙钛矿", "太阳能电池"]
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
    fm_lines.append("---")
    fm = "\n".join(fm_lines)

    title = meta["title"]
    authors = meta["authors"]
    journal = f"📄 期刊信息待补充 · {meta['year']}" if meta["year"] else "📄 期刊信息待补充"
    doi = meta["doi"] or "待补充"
    if meta["doi"]:
        doi = f'<a href="https://doi.org/{meta["doi"]}" target="_blank">{meta["doi"]}</a>'

    tag_span = "".join(f'\n    <span class="paper-tag">{t}</span>' for t in tags)

    page_imgs = []
    for i, fname in enumerate(page_files):
        page_imgs.append(f"![Page {i+1}]({attach_rel}/{fname})")

    page_block = "\n\n".join(page_imgs)

    return fm + f"""

<div class="paper-meta">
  <span class="paper-title">{title}</span>
  <span class="paper-authors">✍ {authors}</span>
  <span class="paper-journal">{journal}</span>
  <span class="paper-doi">📎 DOI: {doi}</span>
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

> **注：** 以下为 {dpi}dpi 渲染的原始页面，可直接阅读。

{page_block}
"""


def git_commit_and_push(pdf_name: str) -> dict:
    """Commit and push to git"""
    import subprocess
    results = {}

    try:
        r1 = subprocess.run(
            ["git", "add", "-A"],
            capture_output=True, text=True, cwd=str(NOTES_ROOT), timeout=30
        )
        results["add"] = r1.stdout.strip() or r1.stderr.strip()

        msg = f"import: {pdf_name} (via admin)"
        r2 = subprocess.run(
            ["git", "commit", "-m", msg],
            capture_output=True, text=True, cwd=str(NOTES_ROOT), timeout=30
        )
        results["commit"] = r2.stdout.strip() or r2.stderr.strip()

        r3 = subprocess.run(
            ["git", "push", "origin", "v4"],
            capture_output=True, text=True, cwd=str(NOTES_ROOT), timeout=60
        )
        results["push"] = r3.stdout.strip() or r3.stderr.strip()
        results["success"] = True
    except Exception as e:
        results["error"] = str(e)
        results["success"] = False

    return results


# ── API Routes ─────────────────────────────────────────────────

@app.get("/api/status")
async def status():
    return JSONResponse({
        "status": "ok",
        "time": datetime.now().isoformat(),
        "notes_root": str(NOTES_ROOT),
    })


@app.post("/api/import-pdf")
async def import_pdf(file: UploadFile = File(...), dpi: int = Form(200)):
    """Upload a PDF and import it as a note"""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        return JSONResponse({"error": "Please upload a PDF file"}, status_code=400)

    pdf_name = Path(file.filename).stem
    if not pdf_name or len(pdf_name) < 3:
        return JSONResponse({"error": "Invalid filename"}, status_code=400)

    # Sanitize: remove special chars that break paths
    pdf_name = pdf_name.replace("/", "_").replace("\\", "_")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    CONTENT_DIR.mkdir(parents=True, exist_ok=True)
    attach_dir = CONTENT_DIR / "attachments"
    attach_dir.mkdir(parents=True, exist_ok=True)

    # Save uploaded PDF temporarily
    tmp_pdf = UPLOAD_DIR / f"{pdf_name}.pdf"
    with open(tmp_pdf, "wb") as f:
        content = await file.read()
        f.write(content)

    try:
        # Extract metadata
        meta = extract_metadata(str(tmp_pdf))

        # Render pages
        page_files = render_pages(str(tmp_pdf), attach_dir, pdf_name, dpi)

        # Build note
        note = build_note(pdf_name, page_files, meta, dpi)

        # Save note
        note_path = CONTENT_DIR / f"{pdf_name}.md"
        with open(note_path, "w", encoding="utf-8") as f:
            f.write(note)

        # Git commit + push
        git_results = git_commit_and_push(pdf_name)

        return JSONResponse({
            "success": True,
            "title": meta["title"],
            "authors": meta["authors"][:200] if meta["authors"] else "Unknown",
            "doi": meta["doi"],
            "year": meta["year"],
            "pages": len(page_files),
            "note_path": str(note_path),
            "git": git_results,
        })

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        # Cleanup temp file
        if tmp_pdf.exists():
            tmp_pdf.unlink()


@app.get("/", response_class=HTMLResponse)
async def admin_page():
    """Admin UI page"""
    return HTMLResponse("""
<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Notes Admin — PDF 导入</title>
<style>
  :root {
    --bg: #fdf6ee; --text: #2c2416; --card: #fff; --border: #e8ddd0;
    --accent: #5a7d63; --accent-hover: #4a6d53;
    --danger: #c0392b; --dim: #999; --input-bg: #faf5ed;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #1a1814; --text: #f0e8d8; --card: #2d2a24; --border: #444;
      --accent: #7dad8a; --accent-hover: #8dbd9a; --input-bg: #252220; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Noto Sans SC", sans-serif; background: var(--bg); color: var(--text);
    display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; padding: 2rem 1rem; }
  .container { max-width: 680px; width: 100%; }

  h1 { font-size: 1.6rem; margin-bottom: 0.25rem; font-weight: 700; }
  .subtitle { color: var(--dim); font-size: 0.9rem; margin-bottom: 2rem; }

  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px;
    padding: 1.5rem; margin-bottom: 1.25rem; }

  .card h2 { font-size: 1.1rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }

  .dropzone { border: 2px dashed var(--border); border-radius: 12px; padding: 2rem 1rem;
    text-align: center; cursor: pointer; transition: all 0.2s; position: relative; }
  .dropzone:hover, .dropzone.drag-over { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 5%, var(--card)); }
  .dropzone input { display: none; }
  .dropzone .icon { font-size: 2.5rem; margin-bottom: 0.5rem; }
  .dropzone .hint { color: var(--dim); font-size: 0.85rem; margin-top: 0.25rem; }

  .file-info { display: none; margin-top: 1rem; padding: 0.75rem; background: color-mix(in srgb, var(--accent) 8%, transparent); border-radius: 8px; }
  .file-info.visible { display: block; }
  .file-info .name { font-weight: 600; }
  .file-info .size { color: var(--dim); font-size: 0.85rem; }

  label { display: block; font-size: 0.9rem; margin: 1rem 0 0.3rem; color: var(--dim); }
  select, button { width: 100%; padding: 0.75rem 1rem; border-radius: 8px; font-size: 1rem;
    border: 1px solid var(--border); background: var(--input-bg); color: var(--text);
    font-family: inherit; cursor: pointer; }
  button { background: var(--accent); color: #fff; border: none; font-weight: 600; margin-top: 1rem; }
  button:hover { background: var(--accent-hover); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  #status { display: none; margin-top: 1rem; padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.9rem; }
  #status.success { display: block; background: color-mix(in srgb, #27ae60 12%, var(--card)); color: #27ae60; }
  #status.error { display: block; background: color-mix(in srgb, var(--danger) 10%, var(--card)); color: var(--danger); }
  #status.loading { display: block; background: color-mix(in srgb, var(--accent) 10%, var(--card)); color: var(--accent); }

  .result-card { display: none; margin-top: 1rem; }
  .result-card.visible { display: block; }
  .result-card table { width: 100%; }
  .result-card td { padding: 0.3rem 0; }
  .result-card td:first-child { color: var(--dim); width: 80px; }

  .footer { text-align: center; color: var(--dim); font-size: 0.8rem; margin-top: 2rem; }
  a { color: var(--accent); }
</style>
</head>
<body>
<div class="container">
  <h1>📝 Notes Admin</h1>
  <p class="subtitle">PDF 导入 — 拖入论文 PDF，自动渲染为笔记</p>

  <!-- Upload Card -->
  <div class="card">
    <h2>📄 导入论文 PDF</h2>
    <div class="dropzone" id="dropzone">
      <div class="icon">📤</div>
      <div>拖入 PDF 文件，或点击选择</div>
      <div class="hint">支持 .pdf 格式</div>
      <input type="file" id="fileInput" accept=".pdf">
    </div>
    <div class="file-info" id="fileInfo">
      <div class="name" id="fileName"></div>
      <div class="size" id="fileSize"></div>
    </div>

    <label for="dpiSelect">渲染分辨率</label>
    <select id="dpiSelect">
      <option value="150">150 DPI（较快，文件小）</option>
      <option value="200" selected>200 DPI（推荐）</option>
      <option value="300">300 DPI（高清，文件大）</option>
    </select>

    <button id="importBtn" disabled>导入论文</button>

    <div id="status"></div>
  </div>

  <!-- Result Card -->
  <div class="card result-card" id="resultCard">
    <h2>✅ 导入成功</h2>
    <table id="resultTable"></table>
  </div>

  <div class="footer">
    <p>Notes Admin Server v1.0 · <a href="/api/status">API 状态</a></p>
  </div>
</div>

<script>
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const importBtn = document.getElementById('importBtn');
const statusEl = document.getElementById('status');
const resultCard = document.getElementById('resultCard');
const resultTable = document.getElementById('resultTable');
const dpiSelect = document.getElementById('dpiSelect');

let selectedFile = null;

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', e => {
  if (e.target.files.length) handleFile(e.target.files[0]);
});

function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showStatus('⚠️ 请选择一个 PDF 文件', 'error');
    return;
  }
  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = (file.size / 1024).toFixed(0) + ' KB';
  fileInfo.classList.add('visible');
  importBtn.disabled = false;
  statusEl.className = '';
  resultCard.classList.remove('visible');
}

importBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  importBtn.disabled = true;
  importBtn.textContent = '处理中...';
  showStatus('⏳ 正在渲染 PDF 页面并导入...', 'loading');

  const form = new FormData();
  form.append('file', selectedFile);
  form.append('dpi', dpiSelect.value);

  try {
    const r = await fetch('/api/import-pdf', { method: 'POST', body: form });
    const data = await r.json();

    if (data.error) {
      showStatus('❌ ' + data.error, 'error');
    } else {
      statusEl.className = '';
      resultCard.classList.add('visible');
      resultTable.innerHTML = `
        <tr><td>标题</td><td>${esc(data.title)}</td></tr>
        <tr><td>作者</td><td>${esc(data.authors)}</td></tr>
        <tr><td>DOI</td><td>${esc(data.doi || 'N/A')}</td></tr>
        <tr><td>年份</td><td>${esc(data.year || 'N/A')}</td></tr>
        <tr><td>页数</td><td>${data.pages} 页</td></tr>
        <tr><td>笔记文件</td><td style="font-size:0.8rem">${esc(data.note_path)}</td></tr>
        <tr><td>Git</td><td>${data.git?.success ? '✅ 已提交并推送' : '⚠️ ' + esc(data.git?.error || '')}</td></tr>
      `;
      showStatus('✅ 论文已导入！部署后即可查看。去 <a href="https://wouldkeep.com" target="_blank">wouldkeep.com</a> 刷新', 'success');
    }
  } catch (err) {
    showStatus('❌ 连接失败: ' + err.message, 'error');
  } finally {
    importBtn.disabled = false;
    importBtn.textContent = '导入论文';
  }
});

function showStatus(msg, type) {
  statusEl.innerHTML = msg;
  statusEl.className = type;
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
</script>
</body>
</html>
""")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    print(f"""
╔══════════════════════════════════════════╗
║   📝 Notes Admin Server v1.0            ║
║                                         ║
║   地址:  http://{args.host}:{args.port}    ║
║   上传:  POST /api/import-pdf           ║
║   状态:  GET  /api/status               ║
║                                         ║
║   按 Ctrl+C 停止                        ║
╚══════════════════════════════════════════╝
    """)

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
