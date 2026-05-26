// Post-build script: copy image attachments into public/
// Quartz doesn't auto-copy non-.md files; this handles attachments/ and *_图片/ folders
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";

const content = "content";
const publicDir = "public";

const mappings = [
  ["🔬 科研笔记/attachments", "🔬-科研笔记/attachments"],
  ["🎓 讲座笔记/亲密关系读书笔记_图片", "🎓-讲座笔记/亲密关系读书笔记_图片"],
  ["📖 课堂笔记/有机化学/attachments", "📖-课堂笔记/有机化学/attachments"],
];

let total = 0;
for (const [srcRel, dstRel] of mappings) {
  const src = join(content, srcRel);
  const dst = join(publicDir, dstRel);
  if (!existsSync(src)) {
    console.log(`  SKIP (not found): ${srcRel}`);
    continue;
  }
  mkdirSync(dst, { recursive: true });
  let count = 0;
  for (const f of readdirSync(src)) {
    const sf = join(src, f);
    const df = join(dst, f);
    if (statSync(sf).isFile()) {
      copyFileSync(sf, df);
      count++;
    }
  }
  console.log(`  Copied ${count} files: ${dstRel}`);
  total += count;
}
console.log(`Total: ${total} images copied`);
