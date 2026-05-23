"""Fix remaining image issues: add 07/08 to 亲密关系, fix 大学物理 pseudo-img."""
import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

# ========== 1. Add images 07 and 08 to 亲密关系读书笔记 ==========
IMG_BASE = '亲密关系读书笔记_图片'

additions = {
    # Section 9: 演化心理学 — add after first paragraph
    '## 九、人类天性的影响：演化心理学视角\n\n> 通过考察人际间的关键区别，我们来探讨一种可能性——人际关系如何反映出人类共有的动物本性。演化心理学始于**三个基本假设**。':
    lambda m: m.group(0) + f'\n\n![[{IMG_BASE}/07_Evolutionary_Psychology.jpg]]\n',

    # Section 11: 消极面 — add after intro
    '## 十一、亲密关系的消极面\n\n> 亲密关系也有潜在的代价。':
    lambda m: m.group(0) + f'\n\n![[{IMG_BASE}/08_Interaction_Negative.jpg]]\n',
}

targets = [
    r'D:\Obsidian\notes\覆水知识库\notes\🎓 讲座笔记\亲密关系读书笔记.md',
    r'G:\OpenClaw-Workspace\notes-website\content\🎓 讲座笔记\亲密关系读书笔记.md',
]

for target in targets:
    if not os.path.exists(target):
        print(f"SKIP: {target}")
        continue
    with open(target, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content
    for pattern, replacer in additions.items():
        content = re.sub(re.escape(pattern), replacer, content, count=1)
    if content != original:
        with open(target, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Added 07/08 images to: {target}")
    else:
        print(f"No change (already fixed?): {target}")


# ========== 2. Fix 大学物理 pseudo-image ==========
# Replace ![](示意图：两块面积A、间距d的平行金属板) with italic text
phys_targets = [
    r'D:\Obsidian\notes\覆水知识库\notes\📖 课堂笔记\大学物理\导体、电容与电介质_辅导课笔记.md',
    r'G:\OpenClaw-Workspace\notes-website\content\📖 课堂笔记\大学物理\导体、电容与电介质_辅导课笔记.md',
]

old_text = '![](示意图：两块面积A、间距d的平行金属板)'
new_text = '*（示意图：两块面积A、间距d的平行金属板）*'

for target in phys_targets:
    if not os.path.exists(target):
        print(f"SKIP: {target}")
        continue
    with open(target, 'r', encoding='utf-8') as f:
        content = f.read()
    if old_text in content:
        content = content.replace(old_text, new_text)
        with open(target, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed physics pseudo-image in: {target}")
    else:
        print(f"No need to fix physics note: {target}")

print("\nAll remaining image fixes applied!")
