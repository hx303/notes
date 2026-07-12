# D10 验收证据：标签兼容层

## 已完成

- 新增 `quartz/util/tagNormalization.ts`，统一中英文及旧拼写标签。
- `TagList` 保留原始 `/tags/*` 链接，同时标注规范标签。
- `TagContent` 使用归一化匹配，英文/中文同义标签合并到同一结果集。
- 新增 `tagNormalization.test.ts`，覆盖 AI、machine-learning、physics 等别名。

## 验收

- 标签归一化单测：1/1 通过。
- 静态构建：成功生成 `public/` 产物。
- 旧标签 URL：保留，不改写现有链接。
