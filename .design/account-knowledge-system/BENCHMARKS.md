# wouldkeep 产品案例借鉴记录

更新：2026-07-14

## 账户与恢复

- [Figma：创建账户](https://help.figma.com/hc/en-us/articles/360039811114-Create-a-Figma-account)：邮箱与密码是独立注册路径，注册完成后进入文件空间，并通过邮件完成验证。
- [Figma：登录账户](https://help.figma.com/hc/en-us/articles/360041064554-Log-in-or-add-accounts)：登录、注册、找回密码各有明确入口，不在一个表单里反复切换用途。
- 借鉴到 wouldkeep：拆分 `/account/`、`/account/signup/`、`/account/forgot/`、`/account/recover/`；密码至少 8 个字符；恢复页不与登录页混排；注册后解释验证邮件和下一步。

## 首次进入与知识编辑

- [Obsidian：入门顺序](https://obsidian.md/help/)：先创建第一条笔记，再连接笔记，尽早让用户体验知识网络的价值。
- [Notion：个人使用](https://www.notion.com/personal)：先记录内容，嵌套、属性和分享能力在使用中逐步出现。
- 借鉴到 wouldkeep：空知识库直接引导“写下第一条知识”；编辑器先显示标题与正文，组织、连接和分享使用渐进展开，避免小白一开始面对完整数据库表单。

## 标签、分类与组织

- [Notion：数据库属性](https://www.notion.com/help/database-properties)：主题/状态等稳定结构使用属性；多选标签用于跨条目的分类；AI 自动填充属于辅助能力。
- [Capacities：标签](https://docs.capacities.io/reference/tags)：对象类型回答“这是什么”，标签回答“它关于什么”；建议从少量高价值标签开始。
- [Capacities：集合](https://docs.capacities.io/reference/collections)：人工策展使用集合，基于规则的分组使用查询，避免用户重复维护。
- [Readwise Reader：组织内容](https://docs.readwise.io/reader/docs/organizing-content)：标签输入支持搜索已有标签并创建新标签，列表与阅读场景均可快速添加。
- 借鉴到 wouldkeep：主题、成熟度、标签保持不同含义；标签提示少量关键词；分类器只给出“建议 + 命中理由”，必须由用户确认后才应用。

## 知识链接与来源

- [Obsidian：内部链接](https://obsidian.md/help/links)：输入时搜索已有笔记，重命名时自动维护链接，并支持标题/段落级连接。
- [Capacities：网页链接对象](https://docs.capacities.io/reference/basic-types/weblinks)：外部网址不仅是字符串，还可拥有标题、描述、标签和笔记。
- 借鉴到 wouldkeep：前置知识和相关知识从账户知识库搜索选择；来源与知识关系分开；当前阶段先保证主要来源不会丢失，下一阶段升级成可添加多条的结构化来源卡片。

## 发布、分享与发现

- [GitBook：内容发布](https://gitbook.com/docs/help-center/published-documentation/publishing/how-can-i-publish-a-space)：把内容编辑与发布站点分离，并在发布设置中选择受众。
- [GitBook：私密分享链接](https://gitbook.com/docs/publishing-documentation/publish-a-docs-site/share-links)：链接分享可撤销，读者只有阅读权限。
- [Notion：分享页面](https://www.notion.com/help/share-your-work)：私有、指定人员、公开网页是不同范围，发布由页面右上角的明确动作触发。
- 借鉴到 wouldkeep：知识默认 private；unlisted 明确不进入搜索；public 才进入主题与关系网络；编辑和发布分步，不把“保存草稿”伪装成“已经公开”。

## 下一轮案例检索

1. “我的知识”列表：Linear、Notion、Readwise Reader 的搜索、筛选、批量整理和空状态。
2. 无代码模块编辑：Notion、Craft、GitBook 的块操作、模板与撤销。
3. 多来源与可信度：Zotero、Google Scholar Library、Wikipedia 引用编辑。
4. 发布预览与稳定链接：GitBook、Notion Sites、Ghost 的预览、slug、撤回和版本。
5. 公共知识发现：Medium、Substack、Wikipedia、GitHub Explore 的主题入口与非成瘾式推荐。

## 第二轮：知识列表、来源与预览

- [Notion：视图、筛选与排序](https://www.notion.com/help/views-filters-and-sorts)：个人数据库优先使用清晰列表，并在顶部提供少量搜索与筛选；搜索覆盖标题和属性。
- [Linear：筛选](https://linear.app/docs/filters)：筛选改变后列表即时更新，当前条件始终可见；复杂 AND/OR 留给高级场景。
- [Zotero：集合与标签](https://www.zotero.org/support/collections_and_tags)：全库保存单一条目，集合像播放列表、不会复制内容；标签用于更细的主题与工作流检索。
- [Ghost：预览和发布](https://ghost.org/help/publishing-content/)：预览位于编辑器稳定位置，可分别检查桌面、移动和不同受众看到的结果；发布与写作不是同一动作。
- 已借鉴：wouldkeep 的“我的知识”使用简洁列表、标题/主题搜索、全部/草稿/已发布三项快速筛选；首次无内容时隐藏无用筛选；搜索无结果时保留条件并提供“查看全部知识”。复杂查询和自定义视图暂不加入首版。

## 第三轮：结构化来源与安全预览

- [Zotero：添加条目](https://www.zotero.org/support/adding_items_to_zotero)：网页条目至少保留标题、URL 和访问日期；线上没有的材料也允许手工创建，避免把“来源”等同于“必须有网址”。
- [Zotero：条目字段](https://www.zotero.org/support/kb/item_types_and_fields)：来源元数据把标题、作者、URL、访问日期和说明分开存储，便于以后检索、校对和生成引用。
- [Ghost：发布与预览](https://ghost.org/help/publishing-content/)：预览是发布前的独立动作，允许作者以读者视角检查结果；选择可见范围并不等于已经发布。
- [GitBook：站点预览](https://gitbook.com/docs/developers/gitbook-api/api-reference/docs-sites/site-preview)：发布前先生成最新内容的预览，最终确认后再进入上线流程。
- 已借鉴：wouldkeep 来源支持“网页或文章”和“个人经验”，每条单独保存标题、作者/提供者和说明；网页强制校验 `http(s)`，个人经验不伪造网址。来源列表由所有者 RLS 保护，并通过单个数据库事务整体替换，避免写入中断后只剩半套数据。
- 已借鉴：编辑器新增“在发布前预览”，使用纯文本安全渲染当前标题、正文、可见范围和来源；预览明确标注“尚未发布”，不写入公共目录，也不改变数据库可见范围。

## 第四轮：稳定发布、撤回与公开发现

- [GitBook：私密分享链接](https://gitbook.com/docs/publishing-documentation/publish-a-docs-site/share-links)：分享链接拥有独立随机令牌，可以撤销或重新生成；得到链接的人只有阅读权限。
- [Ghost：发布与预览](https://ghost.org/help/publishing-content/)：预览、发布和编辑是不同动作，作者应在阅读视角确认内容后再上线。
- [Ghost：发布设置](https://ghost.org/help/post-settings/)：稳定地址、访问范围、标签和发布时间都属于发布准备，不应混进正文写作的第一步。
- [Supabase：Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)：暴露到浏览器的表必须启用 RLS，并明确区分 `anon` 和 `authenticated` 角色；安全函数需要固定搜索路径与最小执行权限。
- 已借鉴：wouldkeep 发布独立只读快照。继续编辑只更新私人草稿，必须再次点击“更新公开版本”才改变读者内容；公开知识按固定文档 ID 阅读，标题变化不破坏链接。
- 已借鉴：持链接内容不授予匿名用户对发布表的直接查询权，而是通过精确令牌读取单条白名单快照；撤回会删除快照并让旧令牌立即失效。公开发现接口只返回标题、摘要、主题、成熟度、标签与发布时间。
