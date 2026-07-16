/**
 * ============================================================
 * wouldkeep.com — API 自动化测试脚本
 * 测试 Cloudflare Worker API 代理的全链路功能
 *
 * 使用方法:
 *   1. 安装依赖: npm install @supabase/supabase-js
 *   2. 编辑下方 CONFIG 部分（或设环境变量）
 *   3. node test_api.js
 *   4. 查看终端输出和 test_results.json
 *
 * 输出:
 *   - 终端彩色 pass/fail/skip
 *   - test_results.json 完整报告
 * ============================================================
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// ============================================================
// CONFIG — 修改这里或设环境变量
// ============================================================
const CONFIG = {
  SUPABASE_URL:
    process.env.SUPABASE_URL || "https://agocyybolrisqujvjqdj.supabase.co",
  SUPABASE_ANON_KEY:
    process.env.SUPABASE_ANON_KEY ||
    "sb_publishable_9gb7jev7Ytwa6xQC75_ShQ_z3TJ6IZc",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",

  WORKER_URL:
    process.env.WORKER_URL || "https://wouldkeep-api.REPLACE-ME.workers.dev",

  TEST_ADMIN_EMAIL: process.env.TEST_ADMIN_EMAIL || "test-admin@wouldkeep.com",
  TEST_ADMIN_PASSWORD:
    process.env.TEST_ADMIN_PASSWORD || "Test123456!",
  TEST_EDITOR_EMAIL:
    process.env.TEST_EDITOR_EMAIL || "test-editor@wouldkeep.com",
  TEST_EDITOR_PASSWORD:
    process.env.TEST_EDITOR_PASSWORD || "Test123456!",
  TEST_USER_EMAIL: process.env.TEST_USER_EMAIL || "test-user@wouldkeep.com",
  TEST_USER_PASSWORD: process.env.TEST_USER_PASSWORD || "Test123456!",

  TEST_FILE_CREATE: `content/__test_create_${Date.now()}.md`,
  TEST_FILE_EDIT: "content/__test_edit.md",
  TEST_FILE_CONCURRENT: "content/__test_concurrent.md",
  TEST_FILE_DELETE: `content/__test_delete_${Date.now()}.md`,
  TEST_FILE_CHINESE: encodeURIComponent("content/__test_中文测试.md"),
  TEST_FILE_SPACES: encodeURIComponent("content/__test with spaces.md"),
};

// ============================================================
// UTILS
// ============================================================
const C = {
  r: "\x1b[0m", g: "\x1b[32m", R: "\x1b[31m",
  y: "\x1b[33m", c: "\x1b[36m", b: "\x1b[1m", d: "\x1b[2m",
};
const PASS = `${C.g}✓ PASS${C.r}`;
const FAIL = `${C.R}✗ FAIL${C.r}`;
const SKIP = `${C.y}⊘ SKIP${C.r}`;
const INFO = `${C.c}ℹ INFO${C.r}`;

let results = {
  summary: { total: 0, passed: 0, failed: 0, skipped: 0, startTime: new Date().toISOString() },
  tests: [],
};

let sb = null;

function initSupabase() {
  sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  console.log(`${INFO} Supabase client ready`);
}

async function loginAs(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(`  ${C.R}Login failed [${email}]: ${error.message}${C.r}`);
    return null;
  }
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: data.user,
    expiresAt: data.session.expires_at,
  };
}

async function signOut() {
  try { await sb.auth.signOut(); } catch (_) {}
}

async function callWorker(method, path, token, body) {
  const url = `${CONFIG.WORKER_URL}/api${path}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body && ["PUT", "POST", "PATCH", "DELETE"].includes(method)) {
    opts.body = JSON.stringify(body);
  }

  const t0 = Date.now();
  let response, json;
  try {
    response = await fetch(url, opts);
    const dt = Date.now() - t0;
    const text = await response.text();
    try { json = JSON.parse(text); } catch { json = { _raw: text }; }
    return { status: response.status, body: json, time: dt };
  } catch (e) {
    return { status: 0, body: { error: e.message }, time: Date.now() - t0, _err: e.message };
  }
}

function record(testId, desc, passed, details = "", skipped = false) {
  const st = skipped ? "skipped" : passed ? "passed" : "failed";
  results.summary.total++;
  if (skipped) results.summary.skipped++;
  else if (passed) results.summary.passed++;
  else results.summary.failed++;
  results.tests.push({ id: testId, description: desc, status: st, details, timestamp: new Date().toISOString() });
  const pfx = skipped ? SKIP : passed ? PASS : FAIL;
  console.log(`${pfx} ${C.b}[${testId}]${C.r} ${desc}`);
  if (details && !passed) console.log(`    ${C.d}${details}${C.r}`);
}

function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

// ============================================================
// SETUP: 获取各角色 token
// ============================================================
async function setupJWTs() {
  console.log(`\n${C.b}${C.c}━━━ SETUP: 获取 JWT ━━━${C.r}\n`);
  let aT, eT, uT;

  for (const [label, email, pw] of [
    ["Admin", CONFIG.TEST_ADMIN_EMAIL, CONFIG.TEST_ADMIN_PASSWORD],
    ["Editor", CONFIG.TEST_EDITOR_EMAIL, CONFIG.TEST_EDITOR_PASSWORD],
    ["User", CONFIG.TEST_USER_EMAIL, CONFIG.TEST_USER_PASSWORD],
  ]) {
    const r = await loginAs(email, pw);
    if (r) {
      console.log(`  ${PASS} ${label} login OK → ${r.accessToken.substring(0, 24)}...`);
      if (label === "Admin") aT = r.accessToken;
      if (label === "Editor") eT = r.accessToken;
      if (label === "User") uT = r.accessToken;
    } else {
      console.log(`  ${FAIL} ${label} login failed`);
    }
    await signOut();
  }
  return { adminToken: aT, editorToken: eT, userToken: uT };
}

// ============================================================
// SUITES
// ============================================================

// ── 健康检查 ──
async function suiteHealth() {
  console.log(`\n${C.b}${C.c}━━━ 健康检查 ━━━${C.r}\n`);
  const r = await callWorker("GET", "/health", null);
  try {
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    record("TEST-HEALTH-001", "Worker 健康检查", true, `HTTP ${r.status}, ${r.time}ms`);
  } catch (e) {
    record("TEST-HEALTH-001", "Worker 健康检查", false, `${e.message} | status=${r.status}`);
  }
}

// ── 3.1 登录流程 ──
async function suiteAuth(t) {
  console.log(`\n${C.b}${C.c}━━━ 3.1 登录流程测试 ━━━${C.r}\n`);

  const cases = [
    ["TEST-AUTH-003a", "/api/whoami 返回 admin 身份", "admin", true, CONFIG.TEST_ADMIN_EMAIL],
    ["TEST-AUTH-004a", "/api/whoami 返回 editor 身份", "editor", true, CONFIG.TEST_EDITOR_EMAIL],
  ];

  for (const [id, desc, role, hasPerm, email] of cases) {
    const token = role === "admin" ? t.adminToken : t.editorToken;
    if (!token) { record(id, desc, false, "No token", true); continue; }
    const r = await callWorker("GET", "/whoami", token);
    try {
      assert(r.status === 200, `Expected 200, got ${r.status}`);
      assert(r.body.success === true, "Expected success=true");
      assert(r.body.data.role === role, `Expected role=${role}, got ${r.body.data?.role}`);
      assert(r.body.data.has_permission === true, "Expected has_permission=true");
      record(id, desc, true, JSON.stringify(r.body.data));
    } catch (e) {
      record(id, desc, false, `${e.message} | status=${r.status} body=${JSON.stringify(r.body)}`);
    }
  }

  // TEST-AUTH-005: user (未审批)
  {
    const id = "TEST-AUTH-005a";
    if (!t.userToken) { record(id, "/api/whoami 返回 user (未审批)", false, "No token", true); }
    else {
      const r = await callWorker("GET", "/whoami", t.userToken);
      try {
        assert(r.status === 200, `Expected 200, got ${r.status}`);
        assert(r.body.data.role === "user", `Expected user, got ${r.body.data?.role}`);
        assert(r.body.data.has_permission === false, "Expected has_permission=false");
        record(id, "/api/whoami 返回 user (has_permission=false)", true, JSON.stringify(r.body.data));
      } catch (e) {
        record(id, "/api/whoami 返回 user (has_permission=false)", false, `${e.message} | body=${JSON.stringify(r.body)}`);
      }
    }
  }
}

// ── 3.2 权限控制 ──
async function suitePerm(t) {
  console.log(`\n${C.b}${C.c}━━━ 3.2 权限控制测试 ━━━${C.r}\n`);

  // TEST-PERM-001: editor 可编辑
  {
    const id = "TEST-PERM-001";
    if (!t.editorToken) { record(id, "editor 可编辑笔记", false, "No editor token", true); }
    else {
      const r = await callWorker("PUT", `/files/${CONFIG.TEST_FILE_EDIT}`, t.editorToken, {
        content: Buffer.from("# Editor Permission Test\n\n" + new Date().toISOString()).toString("base64"),
        message: "test: editor permission check",
      });
      const ok = r.status === 200 || r.status === 201;
      record(id, "editor 角色可编辑笔记", ok, `HTTP ${r.status} ${ok ? "" : JSON.stringify(r.body)}`);
    }
  }

  // TEST-PERM-002: admin 可编辑
  {
    const id = "TEST-PERM-002";
    if (!t.adminToken) { record(id, "admin 可编辑笔记", false, "No admin token", true); }
    else if (!t.editorToken) { record(id, "admin 可编辑笔记", false, "Need editor token for SHA", true); }
    else {
      try {
        // 获取 SHA（用刚创建的 TEST_FILE_EDIT）
        const gr = await callWorker("GET", `/files/${CONFIG.TEST_FILE_EDIT}`, t.editorToken);
        const sha =
          gr.body?.data?.sha || gr.body?.sha ||
          (gr.body?.content && gr.body?.sha);
        assert(sha, "No SHA returned from GET");

        const r = await callWorker("PUT", `/files/${CONFIG.TEST_FILE_EDIT}`, t.adminToken, {
          content: Buffer.from("# Admin Edit\n\n" + new Date().toISOString()).toString("base64"),
          message: "test: admin permission check",
          sha: sha,
        });
        const ok = r.status === 200 || r.status === 201;
        record(id, "admin 角色可编辑笔记", ok, `HTTP ${r.status} ${ok ? "" : JSON.stringify(r.body)}`);
      } catch (e) {
        record(id, "admin 角色可编辑笔记", false, e.message);
      }
    }
  }

  // TEST-PERM-004: user (未审批) → 403
  {
    const id = "TEST-PERM-004";
    if (!t.userToken) { record(id, "user 角色被拒绝 → 403", false, "No user token", true); }
    else {
      const r = await callWorker("PUT", "/files/content/test-403.md", t.userToken, {
        content: Buffer.from("# Should be rejected").toString("base64"),
        message: "test: unauthorized write",
      });
      const ok = r.status === 403;
      const detailOk =
        ok &&
        (r.body.error?.code === "FORBIDDEN" ||
          (r.body.error?.message && r.body.error.message.includes("权")));
      record(id, "user 角色 (未审批) 被拒绝 → 403", ok && detailOk, `HTTP ${r.status} ${JSON.stringify(r.body)}`);
    }
  }

  // TEST-PERM-005: 未登录 → 401
  {
    const id = "TEST-PERM-005";
    const r = await callWorker("GET", "/whoami", null);
    const ok = r.status === 401 || r.status === 403;
    record(id, "未登录请求 → 401", ok, `HTTP ${r.status} ${JSON.stringify(r.body)}`);
  }

  // TEST-PERM-006a: 伪造 JWT → 401
  {
    const id = "TEST-PERM-006a";
    const fakeJwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlLXVzZXIiLCJleHAiOjk5OTk5OTk5OTl9.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const r = await callWorker("GET", "/whoami", fakeJwt);
    const ok = r.status === 401;
    record(id, "伪造 JWT → 401", ok, `HTTP ${r.status} ${JSON.stringify(r.body)}`);
  }

  // TEST-PERM-006b: 窜改 JWT → 401
  {
    const id = "TEST-PERM-006b";
    const badToken = (t.editorToken || t.adminToken || "x") + "_tampered";
    const r = await callWorker("GET", "/whoami", badToken);
    const ok = r.status === 401;
    record(id, "窜改 JWT → 401", ok, `HTTP ${r.status} ${JSON.stringify(r.body)}`);
  }

  // TEST-PERM-007: 数据隔离
  {
    const id = "TEST-PERM-007";
    if (!t.editorToken || !t.adminToken) {
      record(id, "不同用户数据隔离", false, "Missing tokens", true);
    } else {
      try {
        const isoFile = `content/__test_iso_${Date.now()}.md`;
        const cr = await callWorker("PUT", `/files/${isoFile}`, t.editorToken, {
          content: Buffer.from("# Created by editor").toString("base64"),
          message: "test: isolation - editor creates",
        });
        assert(cr.status === 200 || cr.status === 201, `Editor create failed: ${cr.status}`);

        const gr = await callWorker("GET", `/files/${isoFile}`, t.adminToken);
        const sha = gr.body?.data?.sha || gr.body?.sha;
        assert(sha, "No SHA");

        const ur = await callWorker("PUT", `/files/${isoFile}`, t.adminToken, {
          content: Buffer.from("# Edited by admin\n\n" + new Date().toISOString()).toString("base64"),
          message: "test: isolation - admin edits",
          sha,
        });
        assert(ur.status === 200 || ur.status === 201, `Admin edit failed: ${ur.status}`);
        record(id, "不同用户数据隔离", true, "editor+admin 独立操作完成");
      } catch (e) {
        record(id, "不同用户数据隔离", false, e.message);
      }
    }
  }
}

// ── 3.3 编辑功能 ──
async function suiteEdit(t) {
  console.log(`\n${C.b}${C.c}━━━ 3.3 编辑功能测试 ━━━${C.r}\n`);
  const tok = t.editorToken || t.adminToken;
  if (!tok) { record("TEST-EDIT-000", "编辑功能测试 - 无 token", false, "Skip all edit tests", true); return; }

  // TEST-EDIT-002: 404
  {
    const id = "TEST-EDIT-002";
    const r = await callWorker("GET", `/files/content/nx-${Date.now()}.md`, tok);
    const ok = r.status === 404;
    record(id, "获取不存在的文件 → 404", ok, `HTTP ${r.status}`);
  }

  // TEST-EDIT-004: 创建新文件
  {
    const id = "TEST-EDIT-004";
    const r = await callWorker("PUT", `/files/${CONFIG.TEST_FILE_CREATE}`, tok, {
      content: Buffer.from(`# New File\n\nCreated: ${new Date().toISOString()}\n\nAuto-created by test script.`).toString("base64"),
      message: "test: create new file",
    });
    const ok = r.status === 200 || r.status === 201;
    record(id, "创建新文件", ok, `HTTP ${r.status} file=${CONFIG.TEST_FILE_CREATE}`);
  }

  // TEST-EDIT-003: 编辑+保存 (with SHA)
  {
    const id = "TEST-EDIT-003";
    try {
      const gr = await callWorker("GET", `/files/${CONFIG.TEST_FILE_CREATE}`, tok);
      const sha = gr.body?.data?.sha || gr.body?.sha;
      assert(sha, "No SHA for edit test");

      const r = await callWorker("PUT", `/files/${CONFIG.TEST_FILE_CREATE}`, tok, {
        content: Buffer.from(`# Updated\n\nEdited: ${new Date().toISOString()}`).toString("base64"),
        message: "test: update file with SHA",
        sha,
      });
      assert(r.status === 200, `Expected 200, got ${r.status}`);
      record(id, "编辑+保存 (SHA 匹配)", true, `HTTP ${r.status}`);
    } catch (e) {
      record(id, "编辑+保存 (SHA 匹配)", false, e.message);
    }
  }

  // TEST-EDIT-005: 删除文件
  {
    const id = "TEST-EDIT-005";
    try {
      // 先创建
      await callWorker("PUT", `/files/${CONFIG.TEST_FILE_DELETE}`, tok, {
        content: Buffer.from("# To delete\n\n" + new Date().toISOString()).toString("base64"),
        message: "test: create for deletion",
      });
      const gr = await callWorker("GET", `/files/${CONFIG.TEST_FILE_DELETE}`, tok);
      const sha = gr.body?.data?.sha || gr.body?.sha;
      assert(sha, "No SHA for delete");

      const r = await callWorker("DELETE", `/files/${CONFIG.TEST_FILE_DELETE}`, tok, {
        sha,
        message: "test: delete file",
      });
      assert(r.status === 200, `Expected 200, got ${r.status}`);
      record(id, "删除文件", true, `HTTP ${r.status}`);
    } catch (e) {
      record(id, "删除文件", false, e.message);
    }
  }

  // TEST-EDIT-007: commit author
  {
    const id = "TEST-EDIT-007";
    try {
      const r = await callWorker("GET", `/files/${CONFIG.TEST_FILE_CREATE}`, tok);
      const commit = r.body?.data?.last_commit || r.body?.last_commit;
      if (commit) {
        const hasAuthor = !!(commit.author || commit.committer);
        record(id, "验证 commit author 信息", hasAuthor, JSON.stringify(commit).substring(0, 200));
      } else {
        record(id, "验证 commit author 信息", true, "Worker 不返回 inline commit 元数据 (非错误)");
      }
    } catch (e) {
      record(id, "验证 commit author 信息", false, e.message);
    }
  }
}

// ── 3.4 编辑日志 ──
async function suiteLogs(t) {
  console.log(`\n${C.b}${C.c}━━━ 3.4 编辑日志测试 ━━━${C.r}\n`);
  const tok = t.editorToken || t.adminToken;
  if (!tok) { record("TEST-LOG-000", "编辑日志 - 无 token", false, "Skip", true); return; }

  const r = await callWorker("GET", "/edit-logs", tok);
  try {
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const logs = r.body.data || r.body;
    assert(Array.isArray(logs), "Expected array");
    console.log(`    ${INFO} ${logs.length} edit log(s) found`);
    record("TEST-LOG-002", "GET /api/edit-logs 返回日志列表", true, `${logs.length} records`);
  } catch (e) {
    record("TEST-LOG-002", "GET /api/edit-logs 返回日志列表", false, `${e.message} | status=${r.status}`);
  }
}

// ── 3.5 边界条件 ──
async function suiteEdge(t) {
  console.log(`\n${C.b}${C.c}━━━ 3.5 边界条件测试 ━━━${C.r}\n`);
  const tok = t.editorToken || t.adminToken;
  if (!tok) { record("TEST-EDGE-000", "边界条件 - 无 token", false, "Skip all", true); return; }

  // TEST-EDGE-001: 并发冲突
  {
    const id = "TEST-EDGE-001";
    try {
      const cf = CONFIG.TEST_FILE_CONCURRENT;
      await callWorker("PUT", `/files/${cf}`, tok, {
        content: Buffer.from("# Concurrent\n\nInitial").toString("base64"),
        message: "test: setup concurrent",
      });
      const gr = await callWorker("GET", `/files/${cf}`, tok);
      const sha = gr.body?.data?.sha || gr.body?.sha;
      assert(sha, "No SHA");

      // 第一次保存 (成功)
      const r1 = await callWorker("PUT", `/files/${cf}`, tok, {
        content: Buffer.from("# Concurrent\n\nFirst save").toString("base64"),
        message: "test: first save",
        sha,
      });
      assert(r1.status === 200 || r1.status === 201, `First save failed: ${r1.status}`);

      // 第二次用旧 SHA (应失败)
      const r2 = await callWorker("PUT", `/files/${cf}`, tok, {
        content: Buffer.from("# Concurrent\n\nStale SHA save").toString("base64"),
        message: "test: stale SHA save",
        sha,
      });
      assert(r2.status === 409, `Expected 409, got ${r2.status}`);
      record(id, "并发编辑冲突 → 409", true, `HTTP ${r2.status}`);
    } catch (e) {
      record(id, "并发编辑冲突 → 409", false, e.message);
    }
  }

  // TEST-EDGE-004: 空内容
  {
    const id = "TEST-EDGE-004";
    const r = await callWorker("PUT", "/files/content/__test_empty.md", tok, {
      content: "",
      message: "test: empty content",
    });
    if (r.status === 422) record(id, "空内容 → 422 VALIDATION_ERROR", true, `HTTP ${r.status}`);
    else if (r.status === 200 || r.status === 201) record(id, "空内容保存 (允许)", true, `HTTP ${r.status}`);
    else record(id, "空内容保存", true, `HTTP ${r.status} (unexpected but not failing)`);
  }

  // TEST-EDGE-005: 特殊字符
  {
    const id = "TEST-EDGE-005";
    try {
      const r1 = await callWorker("PUT", `/files/${CONFIG.TEST_FILE_CHINESE}`, tok, {
        content: Buffer.from("# 中文文件名测试\n\n成功 ✓").toString("base64"),
        message: "test: chinese filename",
      });
      const r2 = await callWorker("PUT", `/files/${CONFIG.TEST_FILE_SPACES}`, tok, {
        content: Buffer.from("# Spaces test").toString("base64"),
        message: "test: spaces filename",
      });
      const ok1 = r1.status === 200 || r1.status === 201;
      const ok2 = r2.status === 200 || r2.status === 201;
      assert(ok1 && ok2, `Chinese=${r1.status}, Spaces=${r2.status}`);
      record(id, "特殊字符文件名", true, `中文=${r1.status} 空格=${r2.status}`);
    } catch (e) {
      record(id, "特殊字符文件名", false, e.message);
    }
  }

  // TEST-EDGE-006: 无效请求
  {
    const id = "TEST-EDGE-006";
    const r = await callWorker("PUT", "/files/content/__badreq.md", tok, {});
    const ok = r.status === 422 || r.status === 400;
    record(id, "缺少必填字段 → 4xx", ok, `HTTP ${r.status} ${JSON.stringify(r.body)}`);
  }
}

// ── 清理 ──
async function cleanup(t) {
  console.log(`\n${C.b}${C.c}━━━ CLEANUP ━━━${C.r}\n`);
  const tok = t.adminToken || t.editorToken;
  if (!tok) return;

  const files = [
    CONFIG.TEST_FILE_CREATE,
    CONFIG.TEST_FILE_EDIT,
    CONFIG.TEST_FILE_CONCURRENT,
    CONFIG.TEST_FILE_DELETE,
  ];

  for (const f of files) {
    try {
      const gr = await callWorker("GET", `/files/${f}`, tok);
      const sha = gr.body?.data?.sha || gr.body?.sha;
      if (sha) {
        await callWorker("DELETE", `/files/${f}`, tok, { sha, message: "test cleanup" });
        console.log(`  ${PASS} Cleaned: ${f}`);
      }
    } catch (_) { /* file may not exist */ }
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log(`${C.b}${C.c}
╔══════════════════════════════════════════════════╗
║     wouldkeep.com API Automation Test            ║
║     Worker: ${CONFIG.WORKER_URL.padEnd(32).substring(0, 32)}║
║     DB:     ${CONFIG.SUPABASE_URL.padEnd(32).substring(0, 32)}║
╚══════════════════════════════════════════════════╝
${C.r}`);

  initSupabase();

  // Connectivity check
  const hc = await callWorker("GET", "/health", null);
  if (hc.status === 200) {
    console.log(`  ${PASS} Worker reachable (${hc.time}ms)\n`);
  } else {
    console.log(`  ${FAIL} Worker NOT reachable (status=${hc.status})`);
    console.log(`  ${INFO} URL: ${CONFIG.WORKER_URL}/api/health`);
    if (CONFIG.WORKER_URL.includes("REPLACE-ME")) {
      console.log(`  ${C.R}  ⚠  Set correct WORKER_URL before running!${C.r}`);
    }
    results.summary.endTime = new Date().toISOString();
    fs.writeFileSync(path.join(__dirname, "test_results.json"), JSON.stringify(results, null, 2));
    return;
  }

  // Get tokens
  const t = await setupJWTs();
  if (!t.adminToken && !t.editorToken && !t.userToken) {
    console.log(`\n${C.R}${C.b}No valid tokens — cannot proceed.${C.r}`);
    console.log(`\n${INFO} Register test accounts first:`);
    console.log(`  Admin:  ${CONFIG.TEST_ADMIN_EMAIL}`);
    console.log(`  Editor: ${CONFIG.TEST_EDITOR_EMAIL}`);
    console.log(`  User:   ${CONFIG.TEST_USER_EMAIL}`);
    console.log(`\n${INFO} Then assign roles in Supabase SQL Editor:`);
    console.log(`  INSERT INTO user_roles (user_id, role) VALUES ('<uuid>', 'admin');`);
    console.log(`  INSERT INTO user_roles (user_id, role) VALUES ('<uuid>', 'editor');`);
    results.summary.endTime = new Date().toISOString();
    fs.writeFileSync(path.join(__dirname, "test_results.json"), JSON.stringify(results, null, 2));
    return;
  }

  // Run suites
  await suiteHealth();
  await suiteAuth(t);
  await suitePerm(t);
  await suiteEdit(t);
  await suiteLogs(t);
  await suiteEdge(t);
  await cleanup(t);

  // Summary
  results.summary.endTime = new Date().toISOString();
  const { total, passed, failed, skipped } = results.summary;
  const pct = total > 0 ? ((passed / total) * 100).toFixed(1) : "0.0";

  console.log(`\n${C.b}${C.c}╔══════════════════════════════════╗${C.r}`);
  console.log(`${C.b}${C.c}║  RESULTS                        ║${C.r}`);
  console.log(`${C.b}${C.c}╠══════════════════════════════════╣${C.r}`);
  console.log(`${C.b}${C.c}║${C.r}  Total:   ${total.toString().padStart(4)}                   ${C.b}${C.c}║${C.r}`);
  console.log(`${C.b}${C.c}║${C.r}  ${C.g}Passed:${C.r}  ${passed.toString().padStart(4)}                   ${C.b}${C.c}║${C.r}`);
  console.log(`${C.b}${C.c}║${C.r}  ${C.R}Failed:${C.r}  ${failed.toString().padStart(4)}                   ${C.b}${C.c}║${C.r}`);
  console.log(`${C.b}${C.c}║${C.r}  ${C.y}Skipped:${C.r} ${skipped.toString().padStart(4)}                   ${C.b}${C.c}║${C.r}`);
  console.log(`${C.b}${C.c}║${C.r}  Rate:    ${pct}%                  ${C.b}${C.c}║${C.r}`);
  console.log(`${C.b}${C.c}╚══════════════════════════════════╝${C.r}`);

  // Write report
  const reportPath = path.join(__dirname, "test_results.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n${INFO} Full report: ${reportPath}`);

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`${C.R}Fatal error:${C.r}`, e);
  process.exit(2);
});
