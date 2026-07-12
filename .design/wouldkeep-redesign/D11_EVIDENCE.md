# D11 验收证据：知识采集与本地草稿

- 新增 `/capture/` 页面，提供标题、来源、主题和正文四个采集字段。
- 草稿以 `wouldkeep:capture-drafts` 保存到当前浏览器，最多保留 12 条。
- 有明确保存成功、清空和空草稿状态，并使用 `aria-live` 状态反馈。
- 静态构建产物：`public/capture/index.html`。
- 单测覆盖表单字段、localStorage 读写和草稿列表渲染。
