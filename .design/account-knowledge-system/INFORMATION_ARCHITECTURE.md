# Information Architecture: wouldkeep 个人空间

更新：2026-07-15

## Site Map

- 个人空间概览 `/workspace/`
  - 我的知识库 `/workspace/knowledge/`
  - 写作工作台 `/workspace/write/`
    - 自由工作台 `/workspace/write/?mode=free`
    - 详细编辑器 `/workspace/write/?mode=detailed`
    - 文件导入 `/workspace/write/?action=import`
    - 编辑已有知识 `/workspace/write/?document=:uuid`
  - 个人设置 `/workspace/settings/`
- 站点管理 `/admin/`（仅站长）
- 公开知识 `/knowledge/`（公开阅读侧）

## Navigation Model

- **Primary navigation**：站点原有主导航继续服务公开知识的发现与阅读。
- **Secondary navigation**：所有 `/workspace/*` 页面共用个人空间侧边栏，固定提供“概览、我的知识库、写作工作台”。
- **Utility navigation**：全站页眉右上角显示账户头像；点击头像进入个人空间，悬停、键盘聚焦或触屏箭头展开快捷入口。“站点管理”只有 `is_site_owner` 为真时显示。
- **Mobile navigation**：侧边栏转为可横向滚动的空间标签，保留完整文字与至少 44px 目标，不使用仅图标导航。

## Content Hierarchy

### 个人空间概览

1. 当前空间与隐私原则——先让用户知道自己在哪里、内容是否安全。
2. “打开知识库”和“开始写作”——只保留两条最高频路径。
3. 公开知识与站长入口——作为辅助导航，不与个人写作竞争。

### 我的知识库

1. 搜索、状态筛选与知识列表——核心任务是找回已有内容。
2. 新建、自由工作台、导入——全部跳转到写作工作台，不在列表页展开编辑器。
3. 空状态引导——帮助首次用户创建第一条私密知识。

### 写作工作台

1. 起点选择——自由粘贴、详细编辑、文件导入。
2. 单一编辑任务——选定方式后隐藏起点，避免列表与编辑器同时争抢注意力。
3. 保存、组织、预览与发布——沿用默认私密和明确分享边界。

### 站点管理

1. 内容治理、成员与评论等站长任务保留在 `/admin/`。
2. 不嵌入个人知识库，也不允许站长入口暗示可以读取他人的私人草稿。

### 个人设置

1. 头像文件选择与即时本地预览。
2. 显示名称与登录邮箱说明。
3. 明确保存反馈；头像上传失败不会覆盖已有资料。

## User Flows

### 找回并继续编辑

1. 用户进入 `/workspace/knowledge/`。
2. 搜索或筛选知识。
3. 点击条目后进入 `/workspace/write/?document=:uuid`。
4. 编辑器只加载当前账户拥有的文档，并继续自动保存。

### 创建或导入

1. 用户进入 `/workspace/write/`。
2. 选择自由工作台、详细编辑器或文件导入。
3. 内容进入同一套私密草稿模型。
4. 保存后可在“我的知识库”中查找，准备好后再选择分享范围。

### 站长管理

1. 前端调用 `current_account_capabilities`。
2. 仅站长看到“站点管理”入口。
3. 点击后进入独立 `/admin/` 页面；个人空间不展示完整治理模块。

## Naming Conventions

| Concept              | Label in UI | Notes                      |
| -------------------- | ----------- | -------------------------- |
| Personal hub         | 我的空间    | 只负责导航和概览           |
| Document collection  | 我的知识库  | 负责查找与管理已有知识     |
| Creation surface     | 写作工作台  | 负责新建、粘贴、导入与编辑 |
| Public moderation    | 站点管理    | 站长专用，与私人知识分离   |
| Published collection | 公开知识    | 面向所有读者的公开阅读侧   |

## Component Reuse Map

| Component                         | Used on                      | Behavior differences                               |
| --------------------------------- | ---------------------------- | -------------------------------------------------- |
| `AccountPage`                     | `/account/*`, `/workspace/*` | 根据 slug 渲染认证或个人空间页面                   |
| `workspace-nav`                   | 所有 `/workspace/*`          | 当前页面使用 `aria-current=page`；站长项按能力显示 |
| `workspace-library`               | `/workspace/knowledge/`      | 只负责列表、搜索和筛选                             |
| `workspace-write-launcher`        | `/workspace/write/`          | 选择写作入口后隐藏                                 |
| `editor-panel` / `flat-workbench` | `/workspace/write/`          | 通过安全查询参数打开对应模式                       |
| `AccountMenu`                     | 全站页眉                     | 登录后显示头像与快捷入口；未登录显示“登录”         |
| `workspace-settings`              | `/workspace/settings/`       | 上传头像并更新 `profiles`                          |

## Content Growth Plan

知识数量增长后，列表页继续承载搜索、筛选、排序与分页；编辑页不增加知识列表。站点治理能力继续扩展 `/admin/`，不会挤入个人空间。未来多个知识库可在侧边栏“我的知识库”下增加二级库切换，但首版保持单库、两级以内导航。

## URL Strategy

- 个人空间页面使用稳定、可复制的 `/workspace/<section>/` 路径。
- `document` 只接受 UUID，并由 Supabase 所有者条件与 RLS 再次校验。
- `mode` 仅接受 `free`、`detailed`；`action` 仅接受 `import`。
- 查询参数只决定初始界面，不改变权限、可见范围或发布状态。

## Reference Patterns

- Notion：空间侧边栏使用顶层标签与 Library，把工作内容组织在一致导航中。
- Outline：侧边栏承担 Home、Search、Collections；文档是主要停留和编辑位置。
- GitBook：Space 负责内容创作与存储，Docs site / site settings 负责发布呈现与管理。

wouldkeep 借鉴职责分离和稳定导航，不复制其企业后台视觉；页面仍遵循“个人档案馆 × 公共知识网络”的安静、克制与默认私密原则。
