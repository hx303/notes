// ============================================================
// wouldkeep.com — Supabase Auth + Comments Module
// Depends on: supabase-js v2 (loaded via CDN in index.html)
// ============================================================

// --- ⚠️ 替换为你自己的 Supabase 项目值 ⚠️ ---
var SUPABASE_URL = "https://agocyybolrisqujvjqdj.supabase.co";
var SUPABASE_ANON_KEY = "sb_publishable_9gb7jev7Ytwa6xQC75_ShQ_z3TJ6IZc";
// --------------------------------------------

var sb = null;          // Supabase client
var sbUser = null;      // Current logged-in user
var sbProfile = null;   // Current user profile (display_name, etc.)
var sbIsAdmin = false;
var authReady = false;

// ============================================================
// Init
// ============================================================
function initSupabase() {
  if (typeof supabase === "undefined") {
    console.warn("Supabase SDK not loaded, retrying...");
    setTimeout(initSupabase, 800);
    return;
  }
  try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase client initialized");
    restoreSession();
  } catch (e) {
    console.error("Supabase init error:", e);
  }
}

async function restoreSession() {
  try {
    var res = await sb.auth.getSession();
    if (res.data && res.data.session) {
      sbUser = res.data.session.user;
      await loadProfile();
      authReady = true;
    }
  } catch (e) {
    console.warn("Session restore failed:", e.message);
  }
  updateAuthUI();
}

async function loadProfile() {
  if (!sbUser) return;
  try {
    var { data: p } = await sb.from("profiles").select("*").eq("id", sbUser.id).single();
    if (p) sbProfile = p;
    var { data: r } = await sb.from("user_roles").select("role").eq("user_id", sbUser.id).single();
    sbIsAdmin = !!(r && r.role === "admin");
  } catch (e) {
    // Profile may not exist yet (new user), ignore
  }
}

// ============================================================
// Auth UI helpers
// ============================================================
function updateAuthUI() {
  var loginBtn = document.getElementById("authLoginBtn");
  var userMenu = document.getElementById("authUserMenu");
  var commentPanel = document.getElementById("commentPanel");
  var adminItem = document.getElementById("authAdminItem");
  var usernameEl = document.getElementById("authUsername");
  var emailEl = document.getElementById("authUserEmail");

  if (sbUser) {
    if (loginBtn) loginBtn.style.display = "none";
    if (userMenu) userMenu.style.display = "flex";
    if (commentPanel) commentPanel.style.display = "block";
    if (adminItem) adminItem.style.display = sbIsAdmin ? "block" : "none";
    if (usernameEl) {
      usernameEl.textContent = sbProfile ? sbProfile.display_name : sbUser.email.split("@")[0];
      usernameEl.title = sbProfile ? sbProfile.display_name + " (" + sbUser.email + ")" : sbUser.email;
    }
    if (emailEl) emailEl.textContent = "👤 " + (sbProfile ? sbProfile.display_name : sbUser.email);
  } else {
    if (loginBtn) loginBtn.style.display = "inline-flex";
    if (userMenu) userMenu.style.display = "none";
    if (commentPanel) commentPanel.style.display = "block";
    if (adminItem) adminItem.style.display = "none";
  }
}

// ============================================================
// Auth flows
// ============================================================
function showAuthModal(mode) {
  if (mode === "manageRoles") {
    if (!sbIsAdmin) { alert("需要管理员权限"); return; }
    showRoleModal();
    return;
  }

  var modal = document.getElementById("authModal");
  if (!modal) return;

  document.getElementById("authError").textContent = "";
  document.getElementById("authEmail").value = "";
  document.getElementById("authPassword").value = "";
  document.getElementById("authName").value = "";

  if (mode === "login") {
    document.getElementById("authModalTitle").textContent = "🔑 登录";
    document.getElementById("authNameGroup").style.display = "none";
    document.getElementById("authSubmitBtn").textContent = "登录";
    document.getElementById("authToggleLink").innerHTML = '没有账号？<a href="#" onclick="showAuthModal(\'register\')">注册</a>';
  } else {
    document.getElementById("authModalTitle").textContent = "✨ 注册新账号";
    document.getElementById("authNameGroup").style.display = "block";
    document.getElementById("authSubmitBtn").textContent = "注册";
    document.getElementById("authToggleLink").innerHTML = '已有账号？<a href="#" onclick="showAuthModal(\'login\')">登录</a>';
  }

  modal.dataset.mode = mode;
  modal.style.display = "flex";
}

function hideAuthModal() {
  document.getElementById("authModal").style.display = "none";
}

// Close modal on overlay click
document.addEventListener("DOMContentLoaded", function () {
  var authModal = document.getElementById("authModal");
  if (authModal) {
    authModal.addEventListener("click", function (e) {
      if (e.target === authModal) hideAuthModal();
    });
  }
});

async function handleAuthSubmit() {
  if (!sb) {
    document.getElementById("authError").textContent = "系统初始化中，请稍等...";
    setTimeout(function() { handleAuthSubmit(); }, 1500);
    return;
  }
  var modal = document.getElementById("authModal");
  var mode = modal ? modal.dataset.mode : "login";
  var email = document.getElementById("authEmail").value.trim();
  var password = document.getElementById("authPassword").value.trim();
  var name = document.getElementById("authName").value.trim();
  var errorEl = document.getElementById("authError");

  if (!email || !password) { errorEl.textContent = "请输入邮箱和密码"; return; }
  if (mode === "register" && !name) { errorEl.textContent = "请输入显示名称"; return; }
  errorEl.textContent = "处理中...";

  try {
    if (mode === "login") {
      var { data, error } = await sb.auth.signInWithPassword({ email: email, password: password });
      if (error) throw error;
      sbUser = data.user;
    } else {
      var { data: signUpData, error: signUpErr } = await sb.auth.signUp({
        email: email,
        password: password,
        options: { data: { display_name: name } }
      });
      if (signUpErr) throw signUpErr;
      if (signUpData.user && signUpData.session) {
        sbUser = signUpData.user;
      } else {
        errorEl.textContent = "注册成功！请查收邮箱验证链接后登录。";
        return;
      }
    }
    await loadProfile();
    authReady = true;
    updateAuthUI();
    hideAuthModal();
    if (currentFile) loadComments();
  } catch (e) {
    errorEl.textContent = "错误: " + e.message;
  }
}

async function handleSignOut() {
  await sb.auth.signOut();
  sbUser = null;
  sbProfile = null;
  sbIsAdmin = false;
  authReady = false;
  updateAuthUI();
  if (currentFile) loadComments();
}

// ============================================================
// Role management
// ============================================================
function showRoleModal() {
  document.getElementById("roleEmail").value = "";
  document.getElementById("roleError").textContent = "";
  document.getElementById("roleModal").style.display = "flex";
  loadAdminList();
}
function hideRoleModal() {
  document.getElementById("roleModal").style.display = "none";
}
document.addEventListener("DOMContentLoaded", function () {
  var rm = document.getElementById("roleModal");
  if (rm) rm.addEventListener("click", function (e) { if (e.target === rm) hideRoleModal(); });
});

async function grantAdmin() {
  var email = document.getElementById("roleEmail").value.trim();
  if (!email) { document.getElementById("roleError").textContent = "请输入邮箱"; return; }
  document.getElementById("roleError").textContent = "处理中...";
  try {
    // Find user by email via the exposed users list
    // Since we can't directly query auth.users, we use profiles table
    var { data: profiles, error } = await sb.from("profiles").select("id, display_name").ilike("id", "%");
    // Better approach: use RPC or just try direct insert after getting user from a lookup
    // For now, we'll use auth admin API if available, or a simpler approach

    // Alternative: Use Supabase RPC to find user
    var { data: userData } = await sb.rpc("find_user_by_email", { email_input: email }).single();

    if (!userData) {
      document.getElementById("roleError").textContent = "找不到该邮箱的用户";
      return;
    }

    var { error: insertErr } = await sb.from("user_roles").upsert({
      user_id: userData.user_id,
      role: "admin",
      granted_by: sbUser.id
    });
    if (insertErr) { document.getElementById("roleError").textContent = insertErr.message; return; }

    document.getElementById("roleError").textContent = "✅ 已设为管理员";
    document.getElementById("roleEmail").value = "";
    loadAdminList();
  } catch (e) {
    document.getElementById("roleError").textContent = "错误: " + e.message;
  }
}

async function revokeAdmin() {
  var email = document.getElementById("roleEmail").value.trim();
  if (!email) { document.getElementById("roleError").textContent = "请输入邮箱"; return; }
  document.getElementById("roleError").textContent = "处理中...";
  try {
    var { data: userData } = await sb.rpc("find_user_by_email", { email_input: email }).single();
    if (!userData) { document.getElementById("roleError").textContent = "找不到该邮箱的用户"; return; }

    var { error } = await sb.from("user_roles").delete().eq("user_id", userData.user_id);
    if (error) { document.getElementById("roleError").textContent = error.message; return; }

    document.getElementById("roleError").textContent = "✅ 已撤销管理员权限";
    document.getElementById("roleEmail").value = "";
    loadAdminList();
  } catch (e) {
    document.getElementById("roleError").textContent = "错误: " + e.message;
  }
}

async function loadAdminList() {
  var list = document.getElementById("roleList");
  if (!list) return;
  try {
    // Use the is_admin function to check for admins, or query user_roles
    var { data: roles } = await sb.from("user_roles").select("user_id, profiles(display_name), granted_at").eq("role", "admin");
    if (!roles || roles.length === 0) {
      list.innerHTML = '<span style="color:#888">暂无管理员</span>';
      return;
    }
    list.innerHTML = "<div style='font-weight:600;color:#e94560;margin-bottom:6px'>管理员列表:</div>" +
      roles.map(function (r) {
        var name = r.profiles ? r.profiles.display_name : r.user_id.substring(0, 8);
        return '<div style="padding:3px 0;color:#c0c0d0">• ' + escapeHtml(name) + '</div>';
      }).join("");
  } catch (e) {
    list.innerHTML = '<span style="color:#f44336">加载失败</span>';
  }
}

// ============================================================
// Comments system
// ============================================================

function extractSections(md) {
  var sections = [];
  var re = /^#{2,3}\s+(.+)$/gm;
  var match;
  while ((match = re.exec(md)) !== null) {
    sections.push({ level: match[1].length, title: match[2].trim() });
  }
  sections.unshift({ level: 0, title: "📄 整篇笔记" });
  return sections;
}

async function loadComments() {
  if (!sb || !currentFile) return;
  var panel = document.getElementById("commentList");
  if (!panel) return;
  panel.innerHTML = '<div style="text-align:center;color:#888;padding:16px">加载中...</div>';

  try {
    var { data, error } = await sb
      .from("comments")
      .select("*, profiles(display_name)")
      .eq("file_path", currentFile.path)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });

    if (error) throw error;
    renderComments(data || []);

    // Populate section selector
    if (editor) {
      var sections = extractSections(editor.getMarkdown());
      var sel = document.getElementById("commentSection");
      if (sel) {
        sel.innerHTML = sections.map(function (s) {
          return '<option value="' + escapeHtmlAttr(s.title) + '">' + escapeHtml(s.title) + '</option>';
        }).join("");
      }
    }
  } catch (e) {
    panel.innerHTML = '<div style="text-align:center;color:#f44336;padding:16px">加载失败: ' + escapeHtml(e.message) + '</div>';
  }
}

function renderComments(comments) {
  var panel = document.getElementById("commentList");
  if (!panel) return;

  if (comments.length === 0) {
    panel.innerHTML = '<div style="text-align:center;color:#888;padding:24px;font-size:13px">💬 暂无评论，成为第一个评论者！</div>';
    return;
  }

  var grouped = {};
  comments.forEach(function (c) {
    var key = c.section_title || "📄 整篇笔记";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  });

  var html = "";
  Object.keys(grouped).forEach(function (section) {
    html += '<div class="comment-section-group">';
    html += '<div class="comment-section-title">' + escapeHtml(section) + ' <span>(' + grouped[section].length + ')</span></div>';
    grouped[section].forEach(function (c) {
      var profileName = (c.profiles && c.profiles.display_name) ? c.profiles.display_name : "用户";
      var time = new Date(c.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      var isOwner = sbUser && c.user_id === sbUser.id;
      var canDelete = sbIsAdmin || isOwner;

      html += '<div class="comment-item" id="comment-' + c.id + '">';
      html += '<div class="comment-header">';
      html += '<span class="comment-author">' + escapeHtml(profileName) + '</span>';
      html += '<span class="comment-time">' + time + '</span>';
      if (canDelete) {
        html += '<button class="comment-delete-btn" onclick="deleteComment(\'' + c.id + '\')" title="删除">×</button>';
      }
      html += '</div>';
      html += '<div class="comment-body">' + escapeHtml(c.content) + '</div>';
      html += '</div>';
    });
    html += '</div>';
  });

  panel.innerHTML = html;
  panel.scrollTop = panel.scrollHeight;
}

async function submitComment() {
  if (!sbUser) { showAuthModal("login"); return; }
  if (!currentFile) return;

  var input = document.getElementById("commentInput");
  var sectionSel = document.getElementById("commentSection");
  var section = sectionSel ? sectionSel.value : "📄 整篇笔记";
  var content = input ? input.value.trim() : "";
  if (!content) return;

  input.disabled = true;
  try {
    var { error } = await sb.from("comments").insert({
      file_path: currentFile.path,
      section_title: section,
      content: content,
      user_id: sbUser.id
    });
    if (error) throw error;
    input.value = "";
    input.disabled = false;
    loadComments();
  } catch (e) {
    input.disabled = false;
    alert("评论失败: " + e.message);
  }
}

async function deleteComment(commentId) {
  if (!sbUser) return;
  if (!confirm("删除这条评论？")) return;
  try {
    var { error } = await sb.from("comments").update({ is_deleted: true }).eq("id", commentId);
    if (error) throw error;
    loadComments();
  } catch (e) {
    alert("删除失败: " + e.message);
  }
}

// ============================================================
// Hooks: integrate with existing editor events
// ============================================================
var _origOpenFile = openFile;
openFile = async function (fi, i2) {
  await _origOpenFile(fi, i2);
  if (sb && currentFile) setTimeout(loadComments, 600);
};

var _origSaveFile = saveFile;
saveFile = async function () {
  await _origSaveFile.apply(this, arguments);
  if (sb && currentFile) setTimeout(loadComments, 1500);
};

// Init on load - wait for Supabase SDK
setTimeout(initSupabase, 500);
