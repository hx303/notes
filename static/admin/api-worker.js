// ============================================================
// wouldkeep.com — Cloudflare Worker API Proxy
// Phase 2: JWT验证 + 权限检查 + GitHub API 代理 + 编辑日志
//
// 架构: admin/index.html → Worker → GitHub API / Supabase
// ============================================================

// 依赖: 仅使用 Web API (fetch), 无需外部包

// ============================================================
// Config (从 Cloudflare Secrets / env 读取)
// ============================================================

function getConfig(env) {
  return {
    SUPABASE_URL:       env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    GITHUB_TOKEN:       env.GITHUB_TOKEN,
    GITHUB_REPO:        env.GITHUB_REPO || 'hx303/notes',
    GITHUB_BRANCH:      env.GITHUB_BRANCH || 'v4',
  };
}

// ============================================================
// CORS 处理
// ============================================================

const ALLOWED_ORIGINS = [
  'https://wouldkeep.com',
  'https://www.wouldkeep.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

function corsHeaders(request, extra = {}) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    ...extra,
  };
}

function corsResponse(request, body, status = 200, extraHeaders = {}) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(request, extraHeaders),
  };
  return new Response(bodyStr, { status, headers });
}

// ============================================================
// JWT 验证
// ============================================================

async function verifyJWT(request, env) {
  const config = getConfig(env);
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header', status: 401 };
  }

  const token = authHeader.slice(7);
  try {
    // 通过 Supabase auth/v1/user 端点验证 JWT（兼容所有密钥类型）
    const resp = await fetch(`${config.SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': config.SUPABASE_SERVICE_ROLE_KEY,
        'X-Supabase-Api-Version': '2024-01-01',
      },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Token validation failed:', resp.status, errText);
      return { error: 'Invalid or expired token', status: 401 };
    }

    const user = await resp.json();
    // 将 user 对象映射为 JWT claims 兼容格式（下游代码使用 sub/email/user_metadata）
    return { payload: {
      sub: user.id,
      email: user.email || user.phone || '',
      user_metadata: user.user_metadata || {},
      role: user.role || '',
      app_metadata: user.app_metadata || {},
    }};
  } catch (err) {
    console.error('JWT verification failed:', err.message);
    return { error: `Token validation failed: ${err.message}`, status: 401 };
  }
}

// ============================================================
// 权限检查 — 查询 Supabase user_roles
// ============================================================

async function checkPermission(config, userId) {
  try {
    const url = `${config.SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(userId)}&select=role`;

    // 使用 service_role key 查询（绕过 RLS，确保能查到所有用户的角色）
    const response = await fetch(url, {
      headers: {
        'apikey': config.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation',
      },
    });

    if (!response.ok) {
      console.error('Permission check failed:', response.status, await response.text());
      return { hasPermission: false, role: 'user', error: 'Failed to check permissions' };
    }

    const roles = await response.json();
    const userRole = roles.length > 0 ? roles[0].role : 'user';
    const hasPermission = userRole === 'admin' || userRole === 'editor';

    return { hasPermission, role: userRole };
  } catch (err) {
    console.error('Permission check error:', err.message);
    return { hasPermission: false, role: 'user', error: err.message };
  }
}

// ============================================================
// GitHub API 代理
// ============================================================

async function proxyGitHubAPI(config, path, method, body, userInfo) {
  const apiUrl = `https://api.github.com/repos/${config.GITHUB_REPO}/${path}`;

  const headers = {
    'Authorization': `Bearer ${config.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'wouldkeep-admin-worker/1.0',
  };

  const fetchOpts = { method, headers };

  // 写操作：注入 author 和 committer 信息
  if ((method === 'PUT' || method === 'POST' || method === 'PATCH') && body) {
    const enrichedBody = { ...body };

    // 如果 body 中没有 branch，自动注入
    if (!enrichedBody.branch) {
      enrichedBody.branch = config.GITHUB_BRANCH;
    }

    // 注入 committer 和 author（用户身份追踪）
    if (userInfo && userInfo.email) {
      const identity = {
        name: userInfo.display_name || userInfo.email.split('@')[0],
        email: userInfo.email,
      };
      enrichedBody.committer = identity;
      enrichedBody.author = identity;
    }

    fetchOpts.body = JSON.stringify(enrichedBody);
    headers['Content-Type'] = 'application/json';
  } else if (method === 'DELETE' && userInfo && userInfo.email) {
    // DELETE 操作也可能有 body（比如删除文件时需要 message + sha）
    if (body) {
      const enrichedBody = { ...body };
      const identity = {
        name: userInfo.display_name || userInfo.email.split('@')[0],
        email: userInfo.email,
      };
      enrichedBody.committer = identity;
      enrichedBody.author = identity;
      fetchOpts.body = JSON.stringify(enrichedBody);
      headers['Content-Type'] = 'application/json';
    }
  } else if (body) {
    fetchOpts.body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(apiUrl, fetchOpts);

  if (!response.ok) {
    const errText = await response.text();
    let errJson;
    try { errJson = JSON.parse(errText); } catch { errJson = { message: errText }; }
    console.error(`GitHub API ${method} ${path} failed:`, response.status, errJson.message);
    return {
      error: true,
      status: response.status,
      body: { error: errJson.message || `GitHub API error: ${response.status}` },
    };
  }

  // 写操作成功 → 自动记录编辑日志
  if (method === 'PUT' || method === 'POST' || method === 'DELETE') {
    try {
      const result = response.status === 204 ? null : await response.json();
      await logEdit(config, userInfo, path, method, result);
      return { error: false, status: response.status, body: result };
    } catch (logErr) {
      console.error('Failed to log edit:', logErr.message);
      // 即使日志失败也不影响 GitHub 操作结果
      // 需要重新读取响应体
      return { error: false, status: response.status, body: null };
    }
  }

  const result = response.status === 204 ? null : await response.json();
  return { error: false, status: response.status, body: result };
}

// ============================================================
// 编辑日志
// ============================================================

async function logEdit(config, userInfo, path, method, result) {
  if (!userInfo || !userInfo.user_id) return;

  const logEntry = {
    user_id: userInfo.user_id,
    email: userInfo.email || '',
    display_name: userInfo.display_name || '',
    action: method,
    file_path: path.replace(/^contents\//, ''),
    commit_sha: result?.content?.sha || result?.commit?.sha || '',
    commit_message: result?.commit?.message || (result?.content?.name || ''),
    created_at: new Date().toISOString(),
  };

  const url = `${config.SUPABASE_URL}/rest/v1/edit_logs`;

  // 使用 service_role key 插入（bypass RLS）
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': config.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(logEntry),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to log edit: ${response.status} ${errText}`);
  }
}

// ============================================================
// 路由: /api/edit-logs
// ============================================================

async function handleEditLogs(request, config, userInfo) {
  const method = request.method;

  if (method === 'GET') {
    // 返回最近 50 条编辑日志
    try {
      const url = `${config.SUPABASE_URL}/rest/v1/edit_logs?select=*&order=created_at.desc&limit=50`;
      const response = await fetch(url, {
        headers: {
          'apikey': config.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        return corsResponse(request, { error: `Failed to fetch edit logs: ${errText}` }, 500);
      }

      const logs = await response.json();
      return corsResponse(request, logs);
    } catch (err) {
      return corsResponse(request, { error: `Failed to fetch edit logs: ${err.message}` }, 500);
    }
  }

  if (method === 'POST') {
    // 手动记录一条编辑日志
    try {
      const body = await request.json();
      const url = `${config.SUPABASE_URL}/rest/v1/edit_logs`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': config.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          user_id: userInfo.user_id,
          email: userInfo.email,
          display_name: userInfo.display_name,
          action: body.action || 'manual',
          file_path: body.file_path || '',
          commit_sha: body.commit_sha || '',
          commit_message: body.message || '',
          created_at: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return corsResponse(request, { error: `Failed to create edit log: ${errText}` }, 500);
      }

      const created = await response.json();
      return corsResponse(request, created, 201);
    } catch (err) {
      return corsResponse(request, { error: `Failed to create edit log: ${err.message}` }, 500);
    }
  }

  return corsResponse(request, { error: 'Method not allowed' }, 405);
}

// ============================================================
// 路由: /api/whoami
// ============================================================

async function handleWhoami(request, env, jwtPayload) {
  const config = getConfig(env);
  const userId = jwtPayload.sub;
  const email = jwtPayload.email || '';
  const displayName =
    jwtPayload.user_metadata?.display_name ||
    jwtPayload.user_metadata?.full_name ||
    (email ? email.split('@')[0] : '');

  // 检查权限
  const { hasPermission, role, error } = await checkPermission(config, userId);

  const info = {
    user_id: userId,
    email: email,
    display_name: displayName,
    role: role,
    has_permission: hasPermission,
  };

  if (error) {
    info.error = error;
  }

  return corsResponse(request, info);
}

// ============================================================
// 路由: /api/github/*
// ============================================================

async function handleGitHubProxy(request, env, jwtPayload, pathSuffix) {
  const config = getConfig(env);
  const method = request.method;

  // 构建 userInfo
  const userInfo = {
    user_id: jwtPayload.sub,
    email: jwtPayload.email || '',
    display_name:
      jwtPayload.user_metadata?.display_name ||
      jwtPayload.user_metadata?.full_name ||
      (jwtPayload.email ? jwtPayload.email.split('@')[0] : ''),
  };

  // 读取请求 body（如果有）
  let body = null;
  if (method === 'PUT' || method === 'POST' || method === 'PATCH') {
    try {
      body = await request.json();
    } catch {
      // 没有 JSON body，可能是空请求
    }
  } else if (method === 'DELETE') {
    try {
      body = await request.json();
    } catch {
      // DELETE 可能没有 body
    }
  }

  const result = await proxyGitHubAPI(config, pathSuffix, method, body, userInfo);

  if (result.error) {
    return corsResponse(request, result.body, result.status);
  }

  // 204 No Content
  if (result.status === 204) {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  return corsResponse(request, result.body, result.status);
}

// ============================================================
// 主入口
// ============================================================

export default {
  async fetch(request, env, ctx) {
    // 1. CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 2. 健康检查（无需认证）
    if (path === '/api/health') {
      return corsResponse(request, {
        status: 'ok',
        timestamp: new Date().toISOString(),
        repo: env.GITHUB_REPO || 'hx303/notes',
        branch: env.GITHUB_BRANCH || 'v4',
      });
    }

    // 3. 所有其他 /api/ 路由都需要 JWT 验证
    const jwtResult = await verifyJWT(request, env);
    if (jwtResult.error) {
      return corsResponse(request, { error: jwtResult.error }, jwtResult.status);
    }

    const jwtPayload = jwtResult.payload;
    const config = getConfig(env);

    // 4. 权限检查（除了 whoami 之外的所有接口都需要权限）
    //    whoami 本身只返回用户信息，不需要额外权限
    const needsPermission = !['/api/whoami'].some(p => path.startsWith(p));

    if (needsPermission) {
      const { hasPermission } = await checkPermission(config, jwtPayload.sub);
      if (!hasPermission) {
        return corsResponse(request, {
          error: '需要编辑权限，请联系管理员审批',
          code: 'INSUFFICIENT_PERMISSION',
        }, 403);
      }
    }

    // 5. 路由分发
    try {
      // /api/whoami — 用户信息
      if (path === '/api/whoami') {
        return await handleWhoami(request, env, jwtPayload);
      }

      // /api/edit-logs — 编辑日志
      if (path === '/api/edit-logs') {
        return await handleEditLogs(request, config, {
          user_id: jwtPayload.sub,
          email: jwtPayload.email || '',
          display_name:
            jwtPayload.user_metadata?.display_name ||
            jwtPayload.user_metadata?.full_name ||
            (jwtPayload.email ? jwtPayload.email.split('@')[0] : ''),
        });
      }

      // /api/github/* — GitHub API 代理（保留 query string）
      if (path.startsWith('/api/github/')) {
        var pathSuffix = path.slice('/api/github/'.length);
        if (url.search) pathSuffix += url.search;
        return await handleGitHubProxy(request, env, jwtPayload, pathSuffix);
      }

      // 未知路由
      return corsResponse(request, { error: 'Not found', path }, 404);

    } catch (err) {
      console.error('Unhandled error:', err.message, err.stack);
      return corsResponse(request, {
        error: 'Internal server error',
        message: err.message,
      }, 500);
    }
  },
};
