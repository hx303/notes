# Build Tasks: wouldkeep 后续多代理推进

Generated from: `.design/wouldkeep-redesign/DESIGN_BRIEF.md`、`.design/account-knowledge-system/DESIGN_BRIEF.md`、`.design/ai-knowledge-assistant/DESIGN_BRIEF.md`  
Orchestration: `.design/wouldkeep-next/MULTI_AGENT_WORKTREE_PLAN.md`  
Date: 2026-07-16

## Foundation / Wave 0

- [x] **N00 — 完成 AI 安全地基最终验收**：登录站长账户测试 `ai-write`，确认只发送固定测试文字、返回 `mock: true`、不产生模型费用，并把证据写回 AI TASKS。 _Completed 2026-07-16: site owner explicitly confirmed the signed-in safety-gateway result; no model call or cost._
- [x] **N01 — 合并并固定新基线**：确认 PR #11 全绿后合并到 `main`，抓取 `origin/main` 并记录基线 SHA。 _Completed 2026-07-16: PR #11 merged; new `main` is `72ea5f96cfaa2601fd96a8923ce2635caa972a9d`._
- [x] **N02 — 建立现实状态清单**：逐项对账代码、Supabase、Edge Functions、Vercel/Cloudflare、三份旧 TASKS 与线上行为，标记完成/部分/未部署/过期。 _Completed and kept current in `.design/wouldkeep-next/CURRENT_STATE.md`._
- [x] **N03 — 建立持续协作规则**：在根目录写入构建、测试、安全、文件所有权、迁移和交接约束，确保后续代理不重复开发或越界部署。 _Creates: `AGENTS.md`; reuses: this orchestration plan._
- [ ] **N04 — 建立第一波 Worktrees**：从新基线创建 integration、reference-research、platform、workspace、public Worktree，确认每个目录干净且分支不重名；同时运行时保持“总指挥 + 研究 + 最多两个实施”。 _Creates: Git worktrees/branches; modifies no product code._
- [ ] **N05 — 启动 5.6 Sol 总指挥制度**：根任务固定使用 `gpt-5.6-sol/xhigh`，由其维护状态、派工、研究裁决、文件所有权、集成和生产权限清单。 _Modifies: orchestration state only; reuses: this plan._
- [x] **N06 — 建立决策日志**：记录重要方案的备选项、决定、理由、影响和重新评估条件；新证据通过新增记录修订，不静默覆盖旧决定。 _Creates: `.design/wouldkeep-next/DECISIONS.md`; owned by: commander._
- [x] **N07 — 冻结跨代理接口契约**：记录数据库、RPC/函数、错误码、路由、事件和组件接口；契约变更必须先评估依赖并同步类型与测试。 _Creates: `.design/wouldkeep-next/CONTRACTS.md`; owned by: commander; reuses: current Supabase and component contracts._
- [x] **N08 — 建立串行合并队列**：同一时间只验证和合并一个功能分支，每次合并后先跑类型检查、相关测试和构建，再处理下一项。 _Creates: `.design/wouldkeep-next/MERGE_QUEUE.md`; owned by: commander._
- [x] **N09 — 建立子 Agent 检查点制度**：每个垂直切片或 60–90 分钟提交 SHA、文件、证据、风险、阻塞、契约变化和下一步，避免大模块失联式开发。 _Creates: `.design/wouldkeep-next/handoffs/TEMPLATE.md`; reused by: every agent._
- [x] **N10 — 建立生产安全快照**：在迁移、函数替换、批量内容写入或正式发布前记录 Git/数据库/函数/部署基线、备份、验证查询和前滚修复；缺项则停止。 _Creates: `.design/wouldkeep-next/PRODUCTION_SAFETY.md`; owned by: commander/platform; requires user confirmation before production changes._

## Reference Research / 常设优秀范例侦察

- [ ] **E00 — 建立范例评估模板**：统一记录来源、访问日期、功能闭环、UI 模式、移动端、无障碍、隐私、许可、适合/不适合 wouldkeep 的部分。 _Agent: reference-research (`gpt-5.6-terra/high`); creates: `.design/reference-research/TEMPLATE.md`._
- [ ] **E01 — 账户与新手流程范例简报**：对比至少 5 个成熟注册、验证、找回、个人资料和首次建库流程，给出一个主模式和两个辅助模式。 _Agent: reference-research; creates: `auth-onboarding.md`; informs: P03._
- [ ] **E02 — 编辑器、DOCX/Markdown 导入与恢复范例简报**：研究导入预览、图片处理、自动保存、离线、冲突和版本恢复，核对可复用代码许可证。 _Agent: reference-research; creates: `editor-import-recovery.md`; informs: P04–P05._
- [ ] **E03 — 标签、分类、链接与来源范例简报**：研究无代码知识组织、双向链接、来源编辑和可解释分类，避免要求用户输入内部标识。 _Agent: reference-research; creates: `knowledge-organization.md`; informs: P06/A23._
- [ ] **E04 — 公开知识发现与建库方法范例简报**：研究数字花园、主题/路径、知识地图、最近生长、作者主页与模板教学。 _Agent: reference-research; creates: `public-discovery.md`; informs: P07–P09._
- [ ] **E05 — AI 写作、RAG 与引用范例简报**：研究选区改写预览、整理收件箱、范围选择、引用核验、拒答、预算和隐私同意。 _Agent: reference-research; creates: `ai-assistance.md`; informs: A20–A24._
- [ ] **E06 — Admin、发布与运行健康范例简报**：研究内容治理、成员角色、发布队列、构建失败恢复、审计和成本健康页。 _Agent: reference-research; creates: `admin-publishing-operations.md`; informs: P01–P02/R32._
- [ ] **E07 — 总指挥范例裁决**：5.6 Sol 总指挥审查每份简报，只批准可追溯、适配且许可清楚的建议，并把选择写入对应实施任务。 _Agent: commander; modifies: task briefs, not product code. Depends on: E01–E06._

## Wave 1 / Core Product

- [ ] **P01 — 私密文档与发布边界对账**：用一个真实文档贯穿 owner/other/anonymous、private/unlisted/public、版本冲突、软删除与发布失败测试，只补现有 schema/RLS 缺口。 _Agent: platform; modifies/creates: Supabase migrations, functions and tests; reuses: existing workspace foundation._
- [ ] **P02 — 稳定发布任务垂直切片**：让一条授权知识通过幂等任务生成预览、保留最后成功版本、失败可重试并可撤回；浏览器不持有服务密钥。 _Agent: platform; modifies: publication flow; creates: repeatable verification. Depends on: P01._
- [ ] **P03 — 账户与知识库新手闭环验收**：以电脑小白身份完成注册/登录/找回、进入个人空间、创建第一条私密知识和再次找回；修复真实阻塞而不重做正常页面。 _Agent: workspace; modifies: account/workspace routes and states; reuses: current AccountPage and Supabase Auth._
- [ ] **P04 — DOCX/Markdown 导入预览切片**：支持 DOCX（含内嵌图片）与 Markdown 文件/整篇粘贴，先展示结构和图片预览，再明确保存为私密草稿；错误保留输入。 _Agent: workspace; modifies: import/editor UI; creates: parser adapter and fixtures. Depends on: P03._
- [ ] **P05 — 可靠编辑与恢复切片**：完成自动保存、离线暂存、双标签页冲突比较、版本恢复、删除/撤销，并统一加载/空/错/成功反馈。 _Agent: workspace; modifies: editor/autosave/version states; reuses: document versions. Depends on: P03._
- [ ] **P06 — 无代码知识组织切片**：让用户用组合框/选择器维护标签、分类建议、知识关系和多来源，不要求输入 Markdown、UUID 或内部 URL。 _Agent: workspace; modifies: existing organization controls; reuses: tags, links and sources._
- [ ] **P07 — 公开发现现实验收**：验证首页、知识地图、最近生长、主题和学习路径的实际代码与线上体验，只修复未达到“30 秒理解、两步抵达”的缺口。 _Agent: public; modifies: DiscoverHome/MapPage/RecentGrowth/topic/path components as needed._
- [ ] **P08 — 建库方法可执行切片**：完成 `/build/` 的方法、边界、内容模型、模板和部署说明，使不懂代码的人可以按步骤行动。 _Agent: public; creates/modifies: build content and copyable examples; reuses: article system._
- [ ] **P09 — 信任与恢复页面切片**：补齐 About、Privacy、License、404 与页脚入口，明确 wouldkeep/夔嵬关系、数据边界和失败后的下一步。 _Agent: public; creates/modifies: trust pages and Footer._

## Wave 1 Integration

- [ ] **I10 — 集成平台分支**：审查范围、迁移/RLS 证据和回滚方案后合并，运行 TypeScript、相关测试与构建。 _Agent: integrator; modifies: integration branch only._
- [ ] **I11 — 集成个人空间分支**：审查热点文件、导入安全、数据丢失和移动端证据后合并，运行账户/编辑器回归。 _Agent: integrator; modifies: shared route registration only._
- [ ] **I12 — 集成公开体验分支**：审查构建数据、URL 稳定性、内容真实性和无障碍证据后合并。 _Agent: integrator; modifies: shared component registration only._
- [ ] **I13 — 第一波完整演示**：在集成分支完成“创建/导入私密知识 → 组织 → 预览发布”和“首页 → 主题/路径 → 知识”的生产构建验收。 _Reuses: all Wave 1 slices._

## Wave 2 / AI, Content, Quality

- [ ] **A20 — AI 用量与预算保护**：为成功/失败调用写审计，实施并发、日限额、月预算和站长 feature flag；真实密钥只在 Function Secret。 _Progress: dormant fail-closed guard and offline atomic reference complete; production Supabase authority, service-role RPC, rate card, RLS/failure evidence, config storage, and deployment remain. Agent: AI; modifies: AI migrations/functions/settings; reuses: mock gateway._
- [ ] **A21 — 选区改写与版本回退**：选中文字后生成独立预览，支持接受、插入、拒绝、重新生成和回退；版本冲突不得应用旧结果。 _Agent: AI; creates: focused AI UI components; reuses: editor version API. Depends on: A20 and P05._
- [ ] **A22 — 增量索引与混合检索**：实现分块、内容哈希、队列、pgvector、PostgreSQL 全文搜索与 RRF；RLS 限制到当前用户和知识库。 _Agent: AI; creates: index worker/RPC/tests. Depends on: A20._
- [ ] **A23 — 整理建议收件箱**：提供标签、分类、关系、重复候选的理由/证据/置信度与变更清单，逐条或安全批量接受。 _Agent: AI; creates: `/workspace/organize/`; reuses: tags/links/versions. Depends on: A22 and P06._
- [ ] **A24 — 带引用的知识问答**：用户先选择证据范围，回答附可跳转引用；证据不足拒答，提示注入测试不能改变系统边界。 _Agent: AI; creates: `/workspace/ask/`, chat function and citation tests. Depends on: A22._
- [ ] **C20 — 全内容 dry-run 清单**：为全部公开 Markdown 输出日期、成熟度、主题、标签、摘要、来源、许可、canonical 和 aliases 建议，不直接写正文。 _Agent: content; creates: migration utility/report; reuses: knowledge metadata helpers._
- [ ] **C21 — 优先内容人工策展**：先处理首页、主题和学习路径使用的数学、物理、化学、材料、模拟、研究、历史与成长内容，低置信项保留人工决定。 _Agent: content; modifies: approved content only. Depends on: C20._
- [ ] **C22 — 永久 URL 与索引传播**：在合并重复目录/标签前建立 aliases/canonical 映射，并验证搜索、地图、反链、RSS、sitemap、评论与引用。 _Agent: content; modifies: approved content and canonical consumers. Depends on: C21._
- [ ] **Q20 — UI 优先的跨页面视觉回归**：在生产构建为公开发现、账户、个人空间、写作台、知识库、设置、AI、Admin、文章、地图、路径和旧 URL 建立经人工审阅的桌面/手机视觉基线；禁止无人审查自动重录。 _Agent: UI-QA (`gpt-5.4/high`); creates: browser and screenshot regression suite; reuses: `.better-web-ui.md`._
- [ ] **Q21 — UI 状态、响应式与视觉一致性验收**：覆盖 320/375/800/1024/1200/1536px、浅色/深色、200% 缩放，以及 default/hover/focus/active/disabled/loading/error/success/empty/offline/conflict；记录截断、重叠、横向滚动、图片/字体、间距和层级问题。 _Agent: UI-QA; creates: screenshot evidence and P0–P3 UI ledger. Depends on: Q20._
- [ ] **Q22 — WCAG 2.2 AA 与失败恢复**：自动扫描之外，人工完成键盘遍历、焦点进入/返回、屏幕阅读器冒烟、44px、对比度、reduced motion；错误必须保留上下文并提供恢复动作。 _Agent: UI-QA; modifies: only clearly owned small fixes; reports cross-module issues. Depends on: Q20._
- [ ] **Q23 — AI 中文评估集**：建立至少 50 条可重复评估，覆盖引用、拒答、标签、链接、重复、跨账户和提示注入。 _Agent: QA with AI agent; creates: eval fixtures/command. Depends on: A23–A24._
- [ ] **Q24 — 性能预算与静态优先验证**：记录 JS/CSS/图片/字体/地图与 Core Web Vitals；普通文章不得加载编辑器、完整地图或 AI 包，同时检查布局偏移和图片加载造成的视觉抖动。 _Agent: UI-QA; creates: performance report and thresholds._

## Review and Release / Wave 3

- [ ] **R30 — 独立安全与隐私终审**：由未实现相应功能的强模型审查 RLS、JWT、CORS、密钥、预算、发布边界、导入清理、XSS 与账户隔离。 _Agent: independent reviewer; modifies nothing until findings are accepted._
- [ ] **R31 — 设计与 Web 指南终审**：对照三份设计简报运行 design review 与 web guidelines，修复所有 P0/P1 和约定 P2。 _Agent: integrator/reviewer; reuses: current tokens and UI tests._
- [ ] **R32 — 生产迁移与回滚演练**：在副本/预览环境按顺序执行迁移、函数、构建、URL/RSS/sitemap 和 Cloudflare/Vercel 检查，记录前滚修复。 _Agent: platform + integrator; does not mutate production without user approval._
- [ ] **R33 — 站长灰度**：只向站长开放新 AI 与发布链路，验证费用、引用、版本回退、撤回和关闭开关。 _Requires: user approval; reuses: feature flags._
- [ ] **R34 — 最终小白验收**：从账户创建、导入 DOCX/Markdown、形成知识库、组织、分享、AI 辅助到读者发现完整走一遍，确认没有代码术语阻塞。 _Agent: QA/reviewer; depends on all prior tasks._
- [ ] **R35 — 合并与清理**：全量测试、构建和预览通过后将集成 PR 转 Ready；用户批准合并后再安全移除已合并 Worktree，保留回滚资料。 _Agent: integrator; requires user approval for merge and destructive cleanup._
