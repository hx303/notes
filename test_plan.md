# wouldkeep.com 多人协作改造 — 测试验证方案

> **版本**: v1.0  
> **日期**: 2026-05-31  
> **目标**: 验证 Cloudflare Worker API 代理的全链路功能  
> **关联项目**: hx303/notes (v4), Supabase agocyybolrisqujvjqdj

---

## 目录

1. [测试环境准备](#1-测试环境准备)
2. [Worker API 端点清单](#2-worker-api-端点清单)
3. [测试用例](#3-测试用例)
   - [3.1 登录流程测试](#31-登录流程测试)
   - [3.2 权限控制测试](#32-权限控制测试)
   - [3.3 编辑功能测试](#33-编辑功能测试)
   - [3.4 编辑日志测试](#34-编辑日志测试)
   - [3.5 边界条件测试](#35-边界条件测试)
   - [3.6 用户接受度测试](#36-用户接受度测试)
4. [自动化测试脚本](#4-自动化测试脚本)
5. [测试检查清单](#5-测试检查清单)

---

## 1. 测试环境准备

### 1.1 账号准备

| 角色 | 邮箱 | 密码 | 用途 |
|------|------|------|------|
| admin | `test-admin@wouldkeep.com` | `Test123456!` | 管理员操作测试 |
| editor | `test-editor@wouldkeep.com` | `Test123456!` | 编辑者操作测试 |
| user | `test-user@wouldkeep.com` | `Test123456!` | 未审批用户测试 |
| (无账号) | — | — | 未登录测试 |

### 1.2 环境变量

测试脚本需要以下环境变量（可放在 `.env.test` 文件中）：

```bash
# Supabase
SUPABASE_URL=https://agocyybolrisqujvjqdj.supabase.co
SUPABASE_ANON_KEY=sb_publishable_9gb7jev7Ytwa6xQC75_ShQ_z3TJ6IZc
SUPABASE_SERVICE_ROLE_KEY=<从 Supabase Dashboard → Settings → API 获取>

# Worker
WORKER_URL=https://wouldkeep-api.<your-subdomain>.workers.dev
# 或者本地开发
# WORKER_URL=http://localhost:8787

# Test accounts (require pre-registration)
TEST_ADMIN_EMAIL=test-admin@wouldkeep.com
TEST_ADMIN_PASSWORD=Test123456!
TEST_EDITOR_EMAIL=test-editor@wouldkeep.com
TEST_EDITOR_PASSWORD=Test123456!
TEST_USER_EMAIL=test-user@wouldkeep.com
TEST_USER_PASSWORD=Test123456!
```

### 1.3 数据库准备

在 Supabase SQL Editor 中执行以下初始化脚本：

```sql
-- 确保测试账号存在且权限正确
-- 1) 注册三个测试账号（通过 Admin 页面或 API）
-- 2) 设置角色
--    admin 用户:  INSERT INTO user_roles (user_id, role) VALUES ('<admin_uuid>', 'admin');
--    editor 用户: INSERT INTO user_roles (user_id, role) VALUES ('<editor_uuid>', 'editor');
--    user 用户:   无需操作（默认为 'user'）

-- 3) 确保 edit_logs 表为空（干净起点）
TRUNCATE public.edit_logs;
```

---

## 2. Worker API 端点清单

改造后的 Worker 提供以下端点：

| 方法 | 路径 | 认证 | 权限要求 | 说明 |
|------|------|------|----------|------|
| `GET` | `/api/health` | 无 | 无 | 健康检查 |
| `GET` | `/api/whoami` | JWT | 已登录 | 返回当前用户信息+角色 |
| `GET` | `/api/files/:path` | JWT | editor+ | 获取文件内容（代理 GitHub） |
| `PUT` | `/api/files/:path` | JWT | editor+ | 创建/更新文件（代理 GitHub） |
| `DELETE` | `/api/files/:path` | JWT | editor+ | 删除文件（代理 GitHub） |
| `POST` | `/api/files/upload` | JWT | editor+ | 上传图片（代理 GitHub） |
| `GET` | `/api/edit-logs` | JWT | 已登录 | 获取编辑日志列表 |
| `POST` | `/api/edit-logs` | service_role | service_role | 写入编辑日志（内部调用） |

### 通用响应格式

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "请先登录"
  }
}
```

### 错误代码

| HTTP 状态码 | 错误代码 | 含义 |
|-------------|----------|------|
| 401 | `UNAUTHORIZED` | 未登录/无有效JWT |
| 401 | `TOKEN_EXPIRED` | JWT 已过期 |
| 401 | `INVALID_TOKEN` | JWT 伪造/无效 |
| 403 | `FORBIDDEN` | 权限不足（role=user 未审批） |
| 409 | `CONFLICT` | SHA 不匹配（并发冲突） |
| 413 | `PAYLOAD_TOO_LARGE` | 文件过大 |
| 422 | `VALIDATION_ERROR` | 参数校验失败 |
| 500 | `INTERNAL_ERROR` | 内部错误 |

---

## 3. 测试用例

### 3.1 登录流程测试

#### TEST-AUTH-001: 新用户注册

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-AUTH-001 |
| **描述** | 新用户通过 Supabase Auth 注册账号，自动创建 profile 和默认角色 |
| **前置条件** | Supabase 项目正常运行，Email Auth 已启用 |
| **步骤** | 1. 调用 `supabase.auth.signUp()` 注册新邮箱<br>2. 验证返回的 session 和 user 对象非空<br>3. 检查 `profiles` 表自动创建了对应记录<br>4. 检查 `user_roles` 表默认角色为 `user` |
| **预期结果** | ✅ session 创建成功<br>✅ profiles 表有 `display_name` 记录<br>✅ user_roles 表有 `role='user'` 记录 |
| **实际结果** | |

#### TEST-AUTH-002: 已有用户登录

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-AUTH-002 |
| **描述** | 已注册用户登录，获取有效 JWT access_token |
| **前置条件** | test-admin@wouldkeep.com 已注册 |
| **步骤** | 1. 调用 `supabase.auth.signInWithPassword()`<br>2. 获取 `session.access_token`<br>3. 验证 token 非空且格式正确（JWT，三段式） |
| **预期结果** | ✅ 返回有效 access_token<br>✅ token 可正常解码（header.payload.signature） |
| **实际结果** | |

#### TEST-AUTH-003: /api/whoami 返回正确用户信息 (admin)

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-AUTH-003 |
| **描述** | admin 用户调用 /api/whoami，返回完整身份信息 |
| **前置条件** | admin 用户已登录，持有有效 JWT |
| **步骤** | 1. GET /api/whoami（Header: Authorization: Bearer <admin_jwt>）<br>2. 验证返回 JSON |
| **预期结果** | ```json<br>{"success": true, "data": {<br>  "id": "<uuid>",<br>  "email": "test-admin@wouldkeep.com",<br>  "display_name": "<预期名称>",<br>  "role": "admin",<br>  "has_permission": true<br>}}``` |
| **实际结果** | |

#### TEST-AUTH-004: /api/whoami 返回正确用户信息 (editor)

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-AUTH-004 |
| **描述** | editor 用户调用 /api/whoami，角色为 editor |
| **前置条件** | editor 用户已登录，role 已设为 editor |
| **步骤** | 1. GET /api/whoami（Authorization: Bearer <editor_jwt>）<br>2. 验证 role 和 has_permission |
| **预期结果** | `"role": "editor"`, `"has_permission": true` |
| **实际结果** | |

#### TEST-AUTH-005: /api/whoami 返回正确用户信息 (user/未审批)

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-AUTH-005 |
| **描述** | 未审批的 user 角色调用 /api/whoami，has_permission 为 false |
| **前置条件** | user 已登录，user_roles.role = 'user' |
| **步骤** | 1. GET /api/whoami（Authorization: Bearer <user_jwt>）<br>2. 验证 role 和 has_permission |
| **预期结果** | `"role": "user"`, `"has_permission": false`<br>前端应显示"等待管理员审批" |
| **实际结果** | |

---

### 3.2 权限控制测试

#### TEST-PERM-001: editor 角色可编辑笔记

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-PERM-001 |
| **描述** | editor 角色用户可以通过 Worker 写入文件 |
| **前置条件** | editor 已登录，持有有效 JWT |
| **步骤** | 1. PUT /api/files/content/test-editor-perm.md<br>2. Body: `{ "content": "# Editor Test\n\nsuccess", "message": "test: editor permission" }`<br>3. 检查响应状态码 |
| **预期结果** | ✅ HTTP 200/201<br>✅ 文件成功提交到 GitHub<br>✅ commit author 为 editor 的用户名 |
| **实际结果** | |

#### TEST-PERM-002: admin 角色可编辑笔记

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-PERM-002 |
| **描述** | admin 角色同样可以通过 Worker 写入文件 |
| **前置条件** | admin 已登录 |
| **步骤** | 1. PUT /api/files/content/test-admin-perm.md<br>2. 验证成功 |
| **预期结果** | ✅ HTTP 200/201 |
| **实际结果** | |

#### TEST-PERM-003: admin 可管理其他用户角色

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-PERM-003 |
| **描述** | admin 可以查看和修改其他用户角色（通过 Admin 面板） |
| **前置条件** | admin 已登录，user 存在于数据库 |
| **步骤** | 1. admin 在 Admin 面板打开角色管理<br>2. 输入 user 的邮箱<br>3. 点击"设为管理员"<br>4. 验证 user_roles 表更新 |
| **预期结果** | ✅ UI 显示操作成功<br>✅ user_roles.user_id 的 role 变为 'admin' |
| **实际结果** | |

#### TEST-PERM-004: user 角色 (未审批) 不能编辑 → 403

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-PERM-004 |
| **描述** | role=user（未审批）的用户尝试写入 → 被拒绝 |
| **前置条件** | user 已登录，role 为 'user'（未设为 editor/admin） |
| **步骤** | 1. PUT /api/files/content/test-403.md<br>2. Body: `{ "content": "should fail" }`<br>3. 检查响应 |
| **预期结果** | ✅ HTTP 403<br>✅ `{"success": false, "error": {"code": "FORBIDDEN", "message": "等待管理员审批"}}` |
| **实际结果** | |

#### TEST-PERM-005: 未登录 → Worker 返回 401

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-PERM-005 |
| **描述** | 不带 Authorization header 直接请求受保护端点 |
| **前置条件** | 无 |
| **步骤** | 1. GET /api/whoami（无 Authorization header）<br>2. PUT /api/files/content/test.md（无 Authorization header） |
| **预期结果** | ✅ HTTP 401<br>✅ `"code": "UNAUTHORIZED"` |
| **实际结果** | |

#### TEST-PERM-006: 伪造/过期 JWT → Worker 返回 401

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-PERM-006 |
| **描述** | 使用伪造的 JWT 或已过期的 JWT 请求 |
| **前置条件** | 无 |
| **步骤** | 1. 构造一个伪造的 JWT: `Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.fake_signature`<br>2. GET /api/whoami<br>3. 构造一个已过期 JWT（exp 设为过去时间） |
| **预期结果** | ✅ 伪造 JWT: HTTP 401 `"code": "INVALID_TOKEN"`<br>✅ 过期 JWT: HTTP 401 `"code": "TOKEN_EXPIRED"` |
| **实际结果** | |

#### TEST-PERM-007: 不同用户间数据隔离

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-PERM-007 |
| **描述** | editor1 的操作不会以 editor2 的身份记录 |
| **前置条件** | editor1 和 editor2 均已登录 |
| **步骤** | 1. editor1 PUT 创建一个文件<br>2. editor2 PUT 编辑同一个文件<br>3. 检查 GitHub 提交记录的 author 和 edit_logs 的 user_id |
| **预期结果** | ✅ commit1 author = editor1<br>✅ commit2 author = editor2<br>✅ edit_logs 记录对应的 user_id |
| **实际结果** | |

---

### 3.3 编辑功能测试

#### TEST-EDIT-001: 获取文件内容

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-EDIT-001 |
| **描述** | Worker 代理 GitHub API，正确获取已存在文件的内容 |
| **前置条件** | GitHub 仓库中存在 `content/index.md` |
| **步骤** | 1. GET /api/files/content/index.md<br>2. 验证响应包含 `content`（base64 编码）<br>3. 验证 `sha` 字段存在 |
| **预期结果** | ✅ HTTP 200<br>✅ 返回文件内容（base64）和 SHA<br>✅ content-type: application/json |
| **实际结果** | |

#### TEST-EDIT-002: 获取不存在的文件

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-EDIT-002 |
| **描述** | 请求不存在的文件，Worker 返回 404 |
| **前置条件** | 确认该路径不存在 |
| **步骤** | 1. GET /api/files/content/nonexistent-file-xyz.md |
| **预期结果** | ✅ HTTP 404<br>✅ `"code": "NOT_FOUND"` |
| **实际结果** | |

#### TEST-EDIT-003: 编辑并保存文件

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-EDIT-003 |
| **描述** | 编辑已存在的文件，提交到 GitHub，author 正确 |
| **前置条件** | editor 已登录，文件路径存在且已获取 SHA |
| **步骤** | 1. GET /api/files/content/test-edit.md → 获取 SHA<br>2. PUT /api/files/content/test-edit.md<br>   Body: `{<br>     "content": "# Updated Content\n\nTest edit at <timestamp>",<br>     "message": "test: edit file",<br>     "sha": "<从上一步获取的 SHA>"<br>   }`<br>3. 检查 GitHub 提交记录 |
| **预期结果** | ✅ HTTP 200<br>✅ GitHub commit author.name = editor 的 display_name<br>✅ GitHub commit author.email = editor 的 email<br>✅ edit_logs 有新记录 |
| **实际结果** | |

#### TEST-EDIT-004: 创建新文件

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-EDIT-004 |
| **描述** | 创建新的 Markdown 文件 |
| **前置条件** | editor 已登录，文件不存在 |
| **步骤** | 1. PUT /api/files/content/new-file-<timestamp>.md<br>2. Body: `{ "content": "# 新文件\n\n创建测试" }`<br>3. 验证文件在 GitHub 中出现 |
| **预期结果** | ✅ HTTP 201<br>✅ GitHub 上有新文件<br>✅ edit_logs 中 action='create' |
| **实际结果** | |

#### TEST-EDIT-005: 删除文件

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-EDIT-005 |
| **描述** | 删除已存在的文件 |
| **前置条件** | editor 已登录，存在待删除的测试文件 |
| **步骤** | 1. GET /api/files/content/to-delete.md → 获取 SHA<br>2. DELETE /api/files/content/to-delete.md<br>   Body: `{ "sha": "<sha>", "message": "test: delete file" }` |
| **预期结果** | ✅ HTTP 200<br>✅ 文件从 GitHub 删除<br>✅ edit_logs 中 action='delete' |
| **实际结果** | |

#### TEST-EDIT-006: 上传图片

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-EDIT-006 |
| **描述** | 上传图片文件到 GitHub 仓库 |
| **前置条件** | editor 已登录 |
| **步骤** | 1. POST /api/files/upload<br>2. Content-Type: multipart/form-data<br>3. Field: file=<test-image.png><br>4. 验证返回的文件 URL |
| **预期结果** | ✅ HTTP 201<br>✅ 返回可访问的图片 URL<br>✅ 图片可在 GitHub 仓库中看到 |
| **实际结果** | |

#### TEST-EDIT-007: 验证 GitHub commit 身份

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-EDIT-007 |
| **描述** | 检查 GitHub 提交记录的 committer 和 author 是否显示真实用户身份 |
| **前置条件** | editor (display_name="张三") 已完成一次编辑 |
| **步骤** | 1. 查看 GitHub 仓库的 commit 历史<br>2. git log --format="%an <%ae> | %cn <%ce>" |
| **预期结果** | ✅ author.name = "张三"（或 display_name）<br>✅ author.email = test-editor@wouldkeep.com<br>✅ committer 使用共享 GitHub token 的标识 |
| **实际结果** | |

---

### 3.4 编辑日志测试

#### TEST-LOG-001: 编辑后 edit_logs 表有新记录

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-LOG-001 |
| **描述** | 每次通过 Worker 的编辑操作都记录到 edit_logs 表 |
| **前置条件** | edit_logs 表已创建，editor 已登录并完成一次编辑 |
| **步骤** | 1. 执行一次编辑操作（PUT /api/files/...）<br>2. 查询 Supabase edit_logs 表 |
| **预期结果** | ✅ 有新记录<br>✅ user_id 匹配 editor<br>✅ file_path 正确<br>✅ action 为 'update'<br>✅ commit_sha 非空 |
| **实际结果** | |

#### TEST-LOG-002: GET /api/edit-logs 返回正确的日志列表

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-LOG-002 |
| **描述** | Worker 的 /api/edit-logs 返回用户可见的编辑日志 |
| **前置条件** | edit_logs 表中有多条记录 |
| **步骤** | 1. GET /api/edit-logs<br>2. 验证返回结构 |
| **预期结果** | ✅ HTTP 200<br>✅ 返回数组，按 created_at DESC 排序<br>✅ 每条包含 id, user_name, file_path, action, created_at<br>✅ 默认 limit 50 条 |
| **实际结果** | |

#### TEST-LOG-003: Admin 面板显示编辑日志

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-LOG-003 |
| **描述** | Admin 面板能正确加载和显示编辑历史 |
| **前置条件** | Admin 面板已集成编辑日志 UI |
| **步骤** | 1. admin 登录 Admin 面板<br>2. 打开"编辑历史"面板<br>3. 验证日志列表显示 |
| **预期结果** | ✅ 面板正常加载<br>✅ 显示用户名、文件路径、操作类型、时间<br>✅ 分页/加载更多功能可用 |
| **实际结果** | |

---

### 3.5 边界条件测试

#### TEST-EDGE-001: 并发编辑冲突 (SHA 不匹配)

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-EDGE-001 |
| **描述** | 两个用户同时编辑同一文件，后保存的遇到 SHA 不匹配 |
| **前置条件** | editor1 和 editor2 均已登录 |
| **步骤** | 1. editor1 GET /api/files/content/concurrent.md → 获取 SHA_A<br>2. editor2 GET /api/files/content/concurrent.md → 获取 SHA_A（同一 SHA）<br>3. editor1 先 PUT 保存（带 SHA_A） → 成功，SHA 变为 SHA_B<br>4. editor2 PUT 保存（带 SHA_A） → 应失败 |
| **预期结果** | ✅ 第3步: HTTP 200<br>✅ 第4步: HTTP 409 CONFLICT<br>✅ error.code = "CONFLICT"<br>✅ error.message 提示重新加载文件 |
| **实际结果** | |

#### TEST-EDGE-002: 大文件处理

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-EDGE-002 |
| **描述** | 上传超过限制大小的文件被拒绝 |
| **前置条件** | 已知 Worker 文件大小限制（如 1MB） |
| **步骤** | 1. 构造一个超过限制的 base64 内容<br>2. PUT /api/files/content/large-file.md<br>3. 尝试上传超大图片 |
| **预期结果** | ✅ HTTP 413 PAYLOAD_TOO_LARGE<br>✅ 合理的错误信息<br>✅ 前端有大小校验提示 |
| **实际结果** | |

#### TEST-EDGE-003: 网络断连恢复

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-EDGE-003 |
| **描述** | 保存过程中网络中断，验证系统状态 |
| **前置条件** | 可模拟网络故障（Chrome DevTools → Network → Offline） |
| **步骤** | 1. 编辑内容<br>2. 点击保存<br>3. 在请求发出时立即断网<br>4. 恢复网络<br>5. 重新保存 |
| **预期结果** | ✅ 断网时有明确错误提示<br>✅ 编辑器内容不丢失<br>✅ 恢复网络后可正常重新保存<br>✅ 不会出现脏数据（部分写入） |
| **实际结果** | |

#### TEST-EDGE-004: 空内容保存

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-EDGE-004 |
| **描述** | 保存空白内容的文件 |
| **前置条件** | editor 已登录 |
| **步骤** | 1. PUT /api/files/content/empty.md<br>2. Body: `{ "content": "" }`<br>3. 验证行为 |
| **预期结果** | 选项A: ✅ 返回 422 VALIDATION_ERROR（content 不能为空）<br>选项B: ✅ 允许保存空文件 |
| **实际结果** | |

#### TEST-EDGE-005: 特殊字符文件名

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-EDGE-005 |
| **描述** | 文件名包含中文、空格、特殊字符 |
| **前置条件** | editor 已登录 |
| **步骤** | 1. PUT 测试以下文件名：<br>   - `content/关于我们.md`（中文）<br>   - `content/note with spaces.md`（空格）<br>   - `content/special!@#.md`（特殊符号）<br>   - `content/very/deep/nested/file.md`（深层路径） |
| **预期结果** | ✅ 中文文件名：成功创建（URL 编码正确）<br>✅ 空格：成功创建<br>✅ 特殊符号：适当处理（可允许或拒绝）<br>✅ 深层路径：成功创建 |
| **实际结果** | |

#### TEST-EDGE-006: 无效请求格式

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-EDGE-006 |
| **描述** | 发送格式错误的请求 |
| **前置条件** | editor 已登录 |
| **步骤** | 1. PUT /api/files/content/test.md，无 body<br>2. PUT 发送非 JSON 的 body<br>3. PUT 缺少必要字段（如无 message）<br>4. 使用错误 HTTP 方法 |
| **预期结果** | ✅ 返回 422 VALIDATION_ERROR<br>✅ 清晰的错误信息指示缺失字段 |
| **实际结果** | |

#### TEST-EDGE-007: GitHub API 限流处理

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-EDGE-007 |
| **描述** | Worker 正确处理 GitHub API 限流 |
| **前置条件** | 正常请求 |
| **步骤** | 1. 快速连续发送多个请求<br>2. 检查响应中的 X-RateLimit-Remaining 头<br>3. 达到限流后观察 Worker 行为 |
| **预期结果** | ✅ Worker 转发 GitHub 限流头<br>✅ 限流时返回 429 Too Many Requests<br>✅ 前端有合理的重试机制/提示 |
| **实际结果** | |

#### TEST-EDGE-008: Token 即将过期提示

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-EDGE-008 |
| **描述** | JWT 即将过期时的处理 |
| **前置条件** | 使用即将过期的 JWT（exp 在 5 分钟内） |
| **步骤** | 1. 构造 exp=now+3minutes 的 JWT<br>2. GET /api/whoami<br>3. 观察 Worker 响应 |
| **预期结果** | ✅ 请求仍然成功<br>✅ 可选：响应中包含 token-expiry-warning<br>✅ 前端可触发自动刷新 |
| **实际结果** | |

---

### 3.6 用户接受度测试

#### TEST-UAT-001: 新用户注册体验

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-UAT-001 |
| **描述** | 评估新用户从访问到开始使用的完整流程 |
| **前置条件** | 从未注册过的浏览器环境 |
| **步骤** | 1. 访问 https://wouldkeep.com/admin/<br>2. 点击"登录"<br>3. 点击"注册"<br>4. 输入邮箱、密码、显示名称<br>5. 提交注册<br>6. 观察体验 |
| **评价维度** | ⭐ 表单填写体验: _/5<br>⭐ 错误提示清晰度: _/5<br>⭐ 注册后状态提示: _/5<br>⭐ 整体流畅度: _/5 |
| **问题记录** | |
| **实际结果** | |

#### TEST-UAT-002: 权限审批流程

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-UAT-002 |
| **描述** | 新用户注册后等待审批 → 被授予 editor → 可编辑的完整流程 |
| **前置条件** | 新 user 已注册，admin 在线 |
| **步骤** | 1. user 登录 → 看到"等待管理员审批"<br>2. user 尝试编辑 → 被拒绝<br>3. admin 登录 → 打开角色管理<br>4. admin 将 user 设为 editor<br>5. user 刷新页面 → 看到编辑器可用<br>6. user 编辑并保存 |
| **评价维度** | ⭐ 等待状态提示: _/5<br>⭐ 管理员操作便捷性: _/5<br>⭐ 权限生效及时性: _/5<br>⭐ 错误引导清晰度: _/5 |
| **问题记录** | |
| **实际结果** | |

#### TEST-UAT-003: 编辑历史可追溯性

| 字段 | 内容 |
|------|------|
| **测试ID** | TEST-UAT-003 |
| **描述** | 验证编辑历史的完整性和可追溯性 |
| **前置条件** | 至少 3 个不同用户完成过编辑 |
| **步骤** | 1. admin 查看编辑日志面板<br>2. 按时间筛选<br>3. 按用户筛选<br>4. 按操作类型筛选<br>5. 验证每条日志关联到 GitHub commit |
| **评价维度** | ⭐ 日志完整性: _/5<br>⭐ 筛选功能可用性: _/5<br>⭐ commit 关联准确性: _/5<br>⭐ 审计追踪能力: _/5 |
| **问题记录** | |
| **实际结果** | |

---

## 4. 自动化测试脚本

配套的 Node.js 测试脚本：`test_api.js`

### 使用方法

```bash
# 1. 安装依赖
cd G:\OpenClaw-Workspace\notes-website
npm install @supabase/supabase-js

# 2. 配置环境变量
# 编辑 test_api.js 中的配置部分，或设置环境变量

# 3. 运行测试
node test_api.js

# 4. 查看 JSON 结果
# 输出文件: test_results.json
```

详细实现见 `test_api.js`。

---

## 5. 测试检查清单

### 部署前检查 (Pre-Deploy)

- [ ] Supabase 项目正常运行
- [ ] schema.sql 和 phase1_upgrade.sql 均已执行
- [ ] 至少 3 个测试账号已创建
- [ ] 测试账号角色已正确分配
- [ ] Cloudflare Worker 已部署到测试环境
- [ ] Worker 环境变量正确（SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_TOKEN）
- [ ] Worker 的 CORS 配置正确（允许 wouldkeep.com）

### 自动化测试通过标准

- [ ] 所有 TEST-AUTH-* 用例通过 (7/7)
- [ ] 所有 TEST-PERM-* 用例通过 (7/7)
- [ ] 所有 TEST-EDIT-* 用例通过 (7/7)
- [ ] 所有 TEST-LOG-* 用例通过 (3/3)
- [ ] 所有 TEST-EDGE-* 用例通过 (8/8)
- [ ] TEST-UAT-* 评分均 ≥ 4/5

### 回归测试 (回归测试)

| 检查项 | 状态 |
|--------|------|
| 评论系统功能正常 | ☐ |
| 现有笔记内容完整 | ☐ |
| Quartz 生成的静态页面正常 | ☐ |
| Vercel 部署成功 | ☐ |
| Admin 页面可访问 | ☐ |
| 旧链接无 404 | ☐ |

### 性能基准

| 指标 | 目标 | 实测 |
|------|------|------|
| /api/whoami 响应时间 | < 200ms | |
| /api/files GET 响应时间 | < 500ms | |
| /api/files PUT 响应时间 | < 1000ms | |
| Admin 页面首次加载 | < 2s | |
| Worker 冷启动时间 | < 500ms | |

---

> **更新记录**
> - 2026-05-31 v1.0: 初始版本，覆盖 6 大模块 35 个测试用例
