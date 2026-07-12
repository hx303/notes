# R01 Evidence: 长文正文与本文目录

日期：2026-07-11

## 交付范围

- 新增 `quartz/styles/reading.scss`，用语义 token 统一正文宽度、字号、行高、标题节奏、链接、列表、引文、callout、代码、表格、公式、图片、图题和打印规则。
- `custom.scss` 只增加模块引用，避免继续把新阅读规则堆入旧样式文件。
- 桌面目录从 1200px 起作为右侧固定上下文显示；320–1199px 使用原生 `<details>/<summary>` 内联折叠目录。
- 当前章节使用可见“当前：…”文本、`.is-active` 与 `aria-current="location"`，不再以低透明度表达状态。
- 目录滚动和正文表格、代码、公式均隔离 overscroll；移动目录条目跳转后自动收起。
- 移除目录对 `OverflowList` 的不必要依赖，避免同页双目录造成重复资源和 DOM ID 风险。

## 自动化验证

- R01 组件测试：3/3 通过。
- 全量测试：88/88 通过。
- 生产构建：成功解析 260 个 Markdown 文件并生成 1014 个文件。
- 本轮新增/修改文件（旧 `custom.scss` 除外）通过 Prettier 定向检查。

项目级 `tsc --noEmit` 仍被既有问题阻断：

- `quartz/components/FontSize.tsx` 未使用导入。
- `quartz/plugins/transformers/citations.ts` 未使用参数。
- `quartz/plugins/transformers/latex.ts` 的内联资源字段与 `JSResource` 类型不兼容。
- `quartz/plugins/transformers/ofm.ts` 存在 `string` / `string[]` 类型不匹配。
- 受限环境不允许写入项目根目录的 `tsconfig.tsbuildinfo`。

以上错误均未指向 R01 文件；生产构建和全部运行时测试均通过。

## 浏览器验证

### 桌面代表性长文（RCWA 指南）

- 有效视口：1280 × 720。
- 正文宽度：624px；字号/行高约 17.1px / 31.2px。
- 页面横向溢出：无。
- 侧栏目录显示，内联目录隐藏；`aria-current="location"` 恰好 1 项。
- 普通目录文字 opacity：1。

### 中宽布局

- 有效视口：800 × 900。
- 内联目录显示，侧栏目录隐藏，默认收起。
- summary 高度约 67.2px，高于 44px 触控最低要求。
- 页面横向溢出：无。

### 移动布局与键盘

- 有效视口：375 × 812。
- 正文宽度约 337.3px；正文字号 16px；页面横向溢出：无。
- Enter 可展开原生目录。
- 键盘激活“扩散长度”后，URL hash 更新、目录自动收起、目标标题落在约 152px 的阅读定位线、当前章节同步更新。

### 图片型文章

- 有效视口：375 × 812；文章图片 10 张。
- 修复前 2 张图片因边框比正文多约 1.3px；添加 `box-sizing: border-box` 后超宽图片为 0。
- 最大图片宽度约 337.32px，正文宽度约 337.33px；页面横向溢出：无。

## 已知非 R01 警告

- 构建仍报告既有 LaTeX 内容中的中文/emoji math-mode 警告。
- `content/topics`、`paths`、`map`、`build` 尚未纳入 Git，因此构建日期可能不准确。
- 旧 `quartz/styles/custom.scss` 整体尚未满足 Prettier；本轮只增加一行模块引用，未机械重排用户已有样式。
