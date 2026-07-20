# P05 编辑器恢复与版本安全保存参考研究

- 调研日期：2026-07-18
- 访问日期：2026-07-18（下列所有链接）
- 范围：离线队列、跨标签页协调、冲突比较与恢复、版本安全保存
- 方法：优先核对 Web 标准、官方技术文档和开源项目官方仓库；未复制第三方实现代码
- 结论摘要：wouldkeep 应保留现有“服务器权威 revision”模型，升级为 **IndexedDB 应用级 outbox + Web Locks 单写入者 + BroadcastChannel 状态通知 + Supabase/PostgreSQL 原子条件保存 RPC**。当前不应为 P05 引入 CRDT 或更换同步后端。

## 1. 对 wouldkeep 现状的判断

当前编辑器已经具备正确的乐观并发雏形：保存 `documents` 时同时按 `id`、`owner_id` 和 `revision` 过滤，并在成功后递增 revision。它能阻止陈旧标签页直接覆盖较新的正文。

仍需补齐的可靠性缺口：

1. 本地备份仍使用同步、容量较小且缺少事务语义的 `localStorage`。
2. 自动保存请求未形成持久队列，页面关闭、刷新或网络抖动时无法证明写入一定会重试。
3. 页内计时器不能协调多个标签页；不同标签页仍可能交错发送保存请求。
4. 正文、版本、标签、链接、来源当前由多次独立请求保存，可能出现正文成功但关联数据失败的部分成功状态。
5. revision 冲突只提示重新加载，没有保留并比较“本地、编辑起点、云端”三个版本，也没有安全的恢复动作。

因此，P05 的目标不应只是“断网后重试”，而应建立一条可证明不会静默丢稿、不会乱序覆盖、冲突可恢复的保存状态机。

## 2. 推荐主模式

### 2.1 客户端：IndexedDB 草稿与应用级 outbox

建议建立独立的 IndexedDB 数据库，例如 `wouldkeep-editor-v1`，至少包含：

- `drafts`：按 `userId + documentId` 保存当前完整编辑快照、base revision、base snapshot、更新时间。
- `outbox`：保存待发送操作，字段包括 `operationId`、`documentId`、`expectedRevision`、`baseSnapshot`、完整 payload、状态、尝试次数和时间戳。
- `conflicts`：保存发生冲突时的 base/local/cloud 快照、云端 revision、处理状态。

输入时节流写入 `drafts`；自动保存或手动保存先原子写入 outbox，再尝试网络发送。云端明确确认成功前，不删除 outbox 和本地恢复副本。

同一文档尚未开始发送的多个保存意图可以压缩为最新完整快照，但必须保留最初的 `expectedRevision` 与 base snapshot。正在发送的条目不可被原地修改；若发送期间又有编辑，应在成功后形成下一条操作。

IndexedDB 写入可能因配额、隐私浏览模式或存储驱逐而失败，界面必须显式提示“本地恢复不可用”，不能继续显示“已安全保存”。可考虑调用持久存储请求，但浏览器本地数据始终只是恢复层，不能当作唯一永久存档。

### 2.2 跨标签页：Web Locks 负责互斥，BroadcastChannel 负责通知

建议在 flush outbox 时申请用户级锁，例如 `wouldkeep-sync:<userId>`；保存同一文档时再使用文档级锁，例如 `wouldkeep-document:<documentId>`。锁内重新读取 IndexedDB，避免以标签页内的陈旧内存状态作为依据。

`BroadcastChannel` 只广播 `queued`、`saved`、`conflict`、`remote-revision` 等状态，让其他标签页及时更新 UI：

- 其他标签页无未保存更改：可加载新 revision。
- 其他标签页存在未保存更改：保留编辑内容并转为“需要比较”，不得自动覆盖。

BroadcastChannel 消息不是持久日志，也不是锁；IndexedDB 和服务器 revision 才是真相来源。浏览器不支持或 API 失败时，仍必须依靠服务器 CAS 保证安全。

### 2.3 发送与重试状态机

flush 触发点建议包括：

- 页面启动并恢复会话后；
- 真实网络请求失败后的退避重试；
- `online` 事件（仅作为提示）；
- 页面重新可见；
- 用户点击“立即重试”。

不要仅依据 `navigator.onLine` 判断能否保存；最终以真实请求结果为准。网络错误和 5xx 可重试，认证错误应等待重新认证，权限或校验错误应停止自动重试并提示用户，revision 冲突必须进入 conflict 状态。

每条操作使用不可变的 `operationId`。网络超时无法判断服务端是否已经提交时，重试同一 operationId，而不是创建新的保存操作。

### 2.4 服务端：单一、幂等、原子的条件保存 RPC

建议新增类似 `save_document_snapshot` 的 PostgreSQL 函数，由客户端通过 Supabase RPC 调用。一次数据库事务内完成：

1. 验证调用用户与文档所有权。
2. 锁定目标行并校验 `expected_revision`。
3. 校验 `operationId` 是否已经处理；若已成功则返回原结果。
4. 更新 documents 并把 revision 加一。
5. 插入包含正文及所有结构化元数据的 `document_versions` 完整快照。
6. 原子替换标签、链接、来源等关联数据。
7. 记录 operationId 与返回 revision。

若 expected revision 不匹配，返回结构化冲突结果，至少包含 current revision 与当前完整云端快照；不得执行任何部分写入。

现有 `.update(...).eq("revision", expectedRevision)` 可继续作为 CAS 思想的实现依据，但它只保护单表正文。多表一致性需要数据库函数事务，不能依靠前端连续调用补偿。

### 2.5 冲突比较与恢复

发生冲突时先把当前表单写入 IndexedDB `conflicts`，再拉取云端内容。内部使用：

- base：本标签页开始编辑时的快照；
- local：用户当前内容；
- cloud：服务器最新内容。

三方信息用于判断各字段由谁修改；面向小白的默认界面只需显示“我的版本 / 云端版本”两栏、变更高亮和清晰时间/revision。推荐动作：

- **保留我的版本**：用户明确确认后，以最新云端 revision 为 expected revision，提交本地完整快照并创建新版本。
- **采用云端版本**：编辑器加载云端，但本地冲突副本仍保留在恢复记录中，直到用户确认清理。
- **另存为副本**：把本地快照创建为新文档，原文档保持云端版本。
- 可选 **手动合并**：在新的可编辑结果区整合两侧内容，再作为新 revision 保存。

不自动执行最后写入胜出，也不在展示冲突时清空本地草稿。

### 2.6 历史版本恢复

“恢复旧版本”应被视为一次新的条件保存：使用当前 revision 作为 expected revision，把历史完整快照写成新的 revision。不得把 revision 数字倒退，也不得只恢复正文而遗漏标签、链接、来源和可见性。

## 3. 两种备选方案

### 备选 A：Workbox Background Sync + 专用保存 HTTP API

Workbox 可以把失败请求存入 IndexedDB，并由 service worker 在浏览器判断网络恢复时重放；不支持原生 Background Sync 的浏览器会在 service worker 启动时尝试重放。

优点：

- 页面关闭后仍有机会同步；
- 队列、保留时长和重放生命周期较成熟；
- MIT 许可证，满足保留许可证和版权声明后可直接依赖。

限制：

- 默认只在 fetch 抛出异常时排队，收到 4xx/5xx 不会自动重试；
- 原始 Supabase 请求可能带陈旧 revision 或认证头；
- service worker 管理的重试时机不完全可控；
- 仍必须有 operationId、服务器 CAS 和冲突 UI。

裁决：只有在 wouldkeep 建立专用、幂等的保存 HTTP API，并能在重放时安全取得当前会话后才值得采用。P05 可借鉴其持久队列与退避模式，但不应直接长期排队原始 Supabase PATCH。

### 备选 B：Yjs + y-indexeddb + 网络 provider

Yjs 的 CRDT 共享类型可自动合并并发更新；`y-indexeddb` 把文档更新持久化到 IndexedDB，使离线内容能立即恢复，并在网络 provider 可用时只同步增量。

优点：

- 离线编辑、跨标签页和实时协作能力成熟；
- 文本并发通常无需人工解决普通冲突；
- Yjs 及相关项目采用 MIT 许可证，可在保留许可证声明后直接使用。

限制：

- wouldkeep 当前是 textarea/完整快照 + Supabase 关系数据模型；引入 CRDT 会改变文档主数据表示和服务端同步协议；
- 权限、审计、版本快照、删除、标签/链接/来源的原子一致性仍需另行设计；
- 需要部署和维护网络 provider/持久化层；
- 对目前以单人编辑可靠性为主的 P05 成本过高。

裁决：保留到未来“实时多人协作”里程碑评估；本阶段仅借鉴“本地先写、网络后同步、更新可重放”的原则，不引入依赖和 CRDT 数据模型。

## 4. 不建议模式

1. **继续只用 localStorage + debounce**：Web Storage 同步阻塞、只存字符串、容量有限，且没有跨多记录事务。
2. **并发发出多个 autosave Promise**：较早请求可能较晚返回，导致 UI revision 和保存状态乱序。
3. **只用页内 mutex**：无法协调其他标签页、worker 或页面重载后的队列。
4. **只用 BroadcastChannel 协调保存**：消息不持久、发送方不接收自己的消息，也不能替代服务器条件写。
5. **只依据 online/offline 事件**：有局域网不代表服务可达；真实请求结果才是依据。
6. **updated_at 或客户端时间戳最后写入胜出**：时钟不可信，并会静默覆盖用户内容。
7. **冲突后自动强制覆盖或重新加载**：会丢掉其中一方的工作，必须先保存两侧快照并让用户选择。
8. **正文、版本、标签、链接、来源分别保存**：会产生部分成功；应统一进数据库事务。
9. **直接重放长期保存的 Supabase 原始请求**：认证和 revision 都可能过期，应重放应用级保存意图并使用当前会话。
10. **无 base 的自动文本合并**：两份全文不足以可靠判断谁改了什么；至少保留 base/local/cloud。

## 5. 可直接借鉴与复用边界

| 资料/实现 | 许可证或性质 | 可直接借鉴 | 边界 |
| --- | --- | --- | --- |
| IndexedDB、Web Locks、BroadcastChannel、HTTP 条件请求 | Web 标准/API | 直接实现其语义，无需引入第三方运行时 | 文档文字和示例仍按各站点条款，不整段复制 |
| Supabase JS filters / Database Functions | 官方产品 API | 直接使用 `.eq(revision)` 与 RPC 能力 | 具体事务、RLS、幂等表由 wouldkeep 自行实现和审计 |
| Workbox | MIT | 可直接安装、修改和分发 | 必须保留版权/许可；其队列不能代替业务 CAS 与冲突处理 |
| Yjs / y-indexeddb | MIT | 法律上可直接依赖 | P05 架构上只作概念参考；使用时保留许可声明 |
| ProseMirror collab | MIT | 中央权威版本、未确认步骤和 rebase 模式可借鉴 | 当前编辑器不是 ProseMirror；独立 collab 仓库已归档，不复制成自研同步协议 |
| `@codemirror/merge` | MIT | 可用于两栏/统一 diff、accept/reject | 对当前 textarea 较重；引入前评估包体、移动端和无障碍 |
| jsdiff | BSD-3-Clause | 可直接作为轻量行/词 diff 依赖 | 保留版权、条件和免责声明；不得用作者名背书产品 |
| Joplin 冲突副本 UX | 默认 AGPL-3.0-or-later；Logo/图标另行保留 | “冲突先保副本、再比较/恢复”的产品模式 | 只作概念参考，不复制 AGPL 代码、Logo 或图标 |
| PouchDB 冲突 revision tree | Apache-2.0 项目 | `_rev`/409、保留输掉的 revision 可作概念参考 | 其 CouchDB 复制模型与 Supabase/Postgres 不匹配，不为 P05 更换后端 |

若选择引入任何第三方包，应在依赖清单与发布制品中保留相应许可证，并由项目的正式法律/合规流程再次确认；本研究不构成法律意见。

## 6. 官方来源

### 浏览器存储与跨标签页

- MDN，IndexedDB API：<https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API>
- MDN，Using IndexedDB：<https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB>
- MDN，Web Storage API：<https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API>
- MDN，Web Locks API：<https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API>
- MDN，BroadcastChannel：<https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel>
- Chrome/web.dev，Storage for the web：<https://web.dev/articles/storage-for-the-web>
- Chrome/web.dev，IndexedDB best practices：<https://web.dev/articles/indexeddb-best-practices-app-state>

### 条件保存与数据库事务

- RFC 9110，HTTP Semantics，If-Match 与 412：<https://www.rfc-editor.org/rfc/rfc9110.pdf>
- RFC 5789，PATCH 与条件请求冲突：<https://www.rfc-editor.org/info/rfc5789/>
- Supabase，JavaScript update：<https://supabase.com/docs/reference/javascript/update>
- Supabase，Database Functions：<https://supabase.com/docs/guides/database/functions>
- PostgreSQL，Explicit Locking：<https://www.postgresql.org/docs/current/explicit-locking.html>

### 成熟实现与冲突 UX

- Workbox Background Sync 官方文档：<https://developer.chrome.com/docs/workbox/modules/workbox-background-sync>
- Workbox 官方仓库与 MIT 许可证：<https://github.com/googlechrome/workbox>
- ProseMirror 协作算法官方指南：<https://prosemirror.net/docs/guide/#collab>
- ProseMirror collab MIT 许可证：<https://github.com/ProseMirror/prosemirror-collab/blob/master/LICENSE>
- Yjs Offline Support：<https://docs.yjs.dev/getting-started/allowing-offline-editing>
- y-indexeddb 官方文档：<https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb>
- Yjs 官方仓库与 MIT 说明：<https://github.com/yjs/yjs>
- CodeMirror merge 官方参考：<https://codemirror.net/docs/ref/#merge>
- `@codemirror/merge` 包与 MIT 说明：<https://www.npmjs.com/package/@codemirror/merge>
- jsdiff 官方仓库：<https://github.com/kpdecker/jsdiff>
- jsdiff BSD-3-Clause 许可证：<https://github.com/kpdecker/jsdiff/blob/master/LICENSE>
- Joplin 冲突处理官方帮助：<https://joplinapp.org/help/apps/conflict/>
- Joplin 许可证与资产边界：<https://github.com/laurent22/joplin/blob/dev/LICENSE>
- PouchDB 冲突官方指南：<https://pouchdb.com/guides/conflicts.html>

## 7. 最终裁决

P05 应采用推荐主模式，并按以下顺序落地：

1. 把本地恢复从 localStorage 迁到 IndexedDB，定义 drafts/outbox/conflicts 数据结构与失败提示。
2. 把保存改成单队列状态机，加入 operationId、请求串行化和启动/重连重放。
3. 用 Web Locks 选出跨标签页单一 flush 执行者，用 BroadcastChannel 更新其他标签页状态。
4. 新增原子、幂等、带 expected revision 的数据库 RPC，把正文、版本和结构化元数据统一提交。
5. 实现保留 local/cloud/base 的冲突页及“保留我的、采用云端、另存副本”。
6. 让历史恢复通过同一保存通道创建新 revision。

这条路线最大程度复用现有 revision、Supabase 和快照模型，风险与改动范围可控，同时为未来 Workbox 后台同步或 Yjs 实时协作保留演进空间。
