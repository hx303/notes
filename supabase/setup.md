# Supabase 评论系统 - 部署指南

## 第 1 步：创建 Supabase 项目

1. 访问 [supabase.com](https://supabase.com)，注册/登录
2. 点击 **New project**
3. 填写：
   - Name: `wouldkeep-comments`
   - Database Password: 设一个强密码（记下来！）
   - Region: 选离你最近的（如 `Northeast Asia (Tokyo)`）
4. 等 1-2 分钟创建完成

## 第 2 步：获取密钥

进入项目 Dashboard → Settings → API：

记下两个值：
- **Project URL**: `https://xxxxxxxxxxxx.supabase.co`
- **anon public key**: `eyJhbGciOiJIUzI1NiIs...`

> ⚠️ `anon key` 是公开的（客户端可见），安全。不要用 `service_role key`。

## 第 3 步：配置 Auth

在 Dashboard → Authentication → Providers：

1. **Email**: 确保已启用
2. 关闭 "Confirm email"（方便测试，生产环境可打开）
3. 可选：设置 "Site URL" 为 `https://wouldkeep.com`

## 第 4 步：运行数据库 Schema

1. 进入 Dashboard → SQL Editor
2. 复制 `schema.sql` 的全部内容
3. 粘贴，点击 **Run**
4. 应该看到全部执行成功

## 第 5 步：配置 admin/index.html

打开 `static/admin/index.html`，找到以下两行并替换：

```javascript
// 把 YOUR_SUPABASE_URL 和 YOUR_SUPABASE_ANON_KEY 替换为实际值
```

替换为你在第 2 步获取的值。

## 第 6 步：创建第一个管理员

1. 在 admin 页面注册一个账号（邮箱 + 密码）
2. 在 Supabase Dashboard → Table Editor → `auth.users` 中找到你的 `id`
3. 在 SQL Editor 中执行：

```sql
INSERT INTO public.user_roles (user_id, role) VALUES ('你复制过来的UUID', 'admin');
```

之后你就可以在 admin 页面给其他用户分配 admin 权限了。

## 第 7 步：部署

按照正常流程部署：
```powershell
cd G:\OpenClaw-Workspace\notes-website
npx quartz build
# 然后通过 temp-deploy 或 GitHub Actions 部署
```

## 文件清单

| 文件 | 用途 |
|------|------|
| `supabase/schema.sql` | 数据库建表脚本 |
| `supabase/setup.md` | 本文件 |
| `static/admin/auth.js` | 认证 + 评论 JS 模块 |
| `static/admin/index.html` | 已修改的 admin 编辑器 |

## 环境变量参考

部署到 Vercel 时，可以在环境变量中配置：

```
SUPABASE_URL = https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIs...
```

但对于纯静态站点，直接在 JS 中使用 `anon key` 即可（它是公开的）。
