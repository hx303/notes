(function () {
  "use strict";

  var capabilities = null;
  var activeView = "overview";
  var usersCache = [];

  function esc(value) {
    var text = String(value == null ? "" : value);
    if (typeof window.escapeHtml === "function") return window.escapeHtml(text);
    return text.replace(/[&<>'"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char];
    });
  }

  function escAttr(value) {
    if (typeof window.escapeHtmlAttr === "function") return window.escapeHtmlAttr(String(value == null ? "" : value));
    return esc(value);
  }

  function roleLabel(role, isOwner) {
    if (isOwner) return "站长";
    if (role === "admin") return "管理员";
    if (role === "editor") return "编辑者";
    return "普通用户";
  }

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  async function getCapabilities(force) {
    if (capabilities && !force) return capabilities;
    if (!window.sb || !window.sbUser) return null;

    var result = await window.sb.rpc("current_account_capabilities");
    if (result.error) throw result.error;
    capabilities = result.data || null;
    return capabilities;
  }

  function applyCapabilityUI(caps) {
    var isOwner = !!(caps && caps.is_site_owner);
    document.body.classList.toggle("admin-is-owner", isOwner);
    var label = roleLabel(caps && caps.role, isOwner);
    setText("adminCurrentRole", label + (isOwner ? " · 可管理站点权限" : " · 公共站点"));
    setText("overviewRoleLabel", label);

    var roleButton = document.getElementById("roleMgmtBtn");
    if (roleButton) roleButton.style.display = isOwner ? "inline-flex" : "none";
    var adminItem = document.getElementById("authAdminItem");
    if (adminItem) adminItem.style.display = isOwner ? "block" : "none";
  }

  function showAccessDenied(caps) {
    var login = document.getElementById("loginScreen");
    var main = document.getElementById("mainUI");
    var workspace = document.getElementById("mainUI2");
    if (main) main.style.display = "none";
    if (workspace) workspace.style.display = "none";
    if (!login) return;

    login.style.display = "flex";
    var layout = login.querySelector(".admin-signin-layout");
    if (!layout) return;
    var email = window.sbUser && window.sbUser.email ? window.sbUser.email : "当前账户";
    layout.innerHTML = '<section class="admin-access-denied">' +
      '<p class="admin-eyebrow">当前身份：' + esc(roleLabel(caps && caps.role, caps && caps.is_site_owner)) + '</p>' +
      '<h2>这个账户不能进入站点编辑部</h2>' +
      '<p><strong>' + esc(email) + '</strong> 仍可正常创建和分享自己的知识库。只有经过授权的编辑者、管理员与站长才能维护 wouldkeep 的公共站点。</p>' +
      '<div><a class="admin-primary-action" href="/workspace/">进入个人知识工作区</a><button type="button" onclick="handleAdminSignOut()">换一个账户</button></div>' +
      '</section>';
  }

  window.showMainUI = async function () {
    try {
      var caps = await getCapabilities(true);
      if (!caps || !caps.can_edit_site) {
        showAccessDenied(caps);
        return;
      }

      applyCapabilityUI(caps);
      document.getElementById("loginScreen").style.display = "none";
      document.getElementById("mainUI").style.display = "flex";
      document.getElementById("mainUI2").style.display = "flex";
      if (typeof window.updateAuthUI === "function") window.updateAuthUI();

      var requested = localStorage.getItem("wouldkeep_admin_view") || "overview";
      if (requested === "users" && !caps.can_manage_roles) requested = "overview";
      window.switchAdminView(requested);

      await window.loadFiles();
      updateContentSummary();
      window.loadAdminReviewQueue(true);
      window.loadAdminSystemStatus(true);
      if (caps.can_manage_roles) window.loadAdminUsers(true);
    } catch (error) {
      var message = document.getElementById("adminLoginError");
      if (message) message.textContent = "无法确认后台权限：" + error.message;
    }
  };

  window.handleAdminSignOut = async function () {
    try {
      if (window.sb && window.sb.auth) await window.sb.auth.signOut();
    } finally {
      location.reload();
    }
  };

  window.switchAdminView = function (view) {
    if (view === "users" && (!capabilities || !capabilities.can_manage_roles)) {
      view = "overview";
    }
    activeView = view;
    localStorage.setItem("wouldkeep_admin_view", view);

    document.querySelectorAll("[data-admin-view]").forEach(function (node) {
      var matches = node.getAttribute("data-admin-view") === view;
      node.hidden = !matches;
    });
    document.querySelectorAll("[data-admin-nav]").forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-admin-nav") === view);
      if (button.getAttribute("data-admin-nav") === view) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });

    var hamburger = document.getElementById("hamburgerBtn");
    if (hamburger) hamburger.style.visibility = view === "content" ? "visible" : "hidden";
    var title = {
      overview: "站点总览",
      content: "知识内容",
      review: "评论与纠错",
      users: "用户与权限",
      system: "系统状态"
    }[view] || "站点编辑部";
    document.title = title + " · wouldkeep";

    if (view === "review") window.loadAdminReviewQueue();
    if (view === "users") window.loadAdminUsers();
    if (view === "system") window.loadAdminSystemStatus();
  };

  function updateContentSummary() {
    var count = 0;
    if (Array.isArray(window.files)) {
      window.files.forEach(function (folder) { count += Array.isArray(folder.files) ? folder.files.length : 0; });
    }
    setText("overviewDocumentCount", count ? String(count) : "尚未读取");

    var draftCount = 0;
    for (var i = 0; i < localStorage.length; i += 1) {
      if ((localStorage.key(i) || "").indexOf("draft_") === 0) draftCount += 1;
    }
    setText("overviewDraftLabel", draftCount ? draftCount + " 份浏览器草稿" : "没有未提交草稿");
  }

  window.loadAdminReviewQueue = async function (quiet) {
    if (!window.sb) return;
    var list = document.getElementById("adminReviewQueue");
    var limitNode = document.getElementById("reviewLimit");
    var limit = limitNode ? Number(limitNode.value) : 20;
    if (list && !quiet) list.innerHTML = '<div class="admin-empty">正在读取评论…</div>';

    try {
      var result = await window.sb
        .from("comments")
        .select("id,file_path,section_title,content,user_id,created_at,profiles(display_name)", { count: "exact" })
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (result.error) throw result.error;
      var rows = result.data || [];
      var total = typeof result.count === "number" ? result.count : rows.length;

      setText("reviewQueueStatus", total ? "共 " + total + " 条公开反馈，按最新时间排列" : "目前没有待查看的反馈");
      setText("overviewReviewSummary", total ? "已有 " + total + " 条公开评论，最新反馈排在前面" : "目前没有新的公开评论");
      var navCount = document.getElementById("reviewNavCount");
      if (navCount) {
        navCount.textContent = String(total);
        navCount.hidden = total === 0;
      }
      if (!list) return;
      if (!rows.length) {
        list.innerHTML = '<div class="admin-empty">暂时没有评论。新的反馈会集中出现在这里。</div>';
        return;
      }

      list.innerHTML = rows.map(function (comment) {
        var date = new Date(comment.created_at);
        var author = comment.profiles && comment.profiles.display_name ? comment.profiles.display_name : "wouldkeep 用户";
        return '<article class="admin-queue-item">' +
          '<div class="admin-queue-meta"><strong>' + esc(author) + '</strong><br><time datetime="' + escAttr(comment.created_at) + '">' + esc(date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })) + '</time></div>' +
          '<div class="admin-queue-body"><strong>' + esc(comment.file_path) + ' · ' + esc(comment.section_title || "整篇笔记") + '</strong><p>' + esc(comment.content) + '</p></div>' +
          '<button type="button" data-review-path="' + escAttr(comment.file_path) + '">打开条目</button>' +
          '</article>';
      }).join("");
      list.querySelectorAll("[data-review-path]").forEach(function (button) {
        button.addEventListener("click", function () { window.openAdminContent(button.getAttribute("data-review-path")); });
      });
    } catch (error) {
      setText("overviewReviewSummary", "评论读取失败，请进入模块重试");
      if (list) list.innerHTML = '<div class="admin-empty">评论读取失败：' + esc(error.message) + '</div>';
    }
  };

  window.openAdminContent = async function (path) {
    if (!Array.isArray(window.files) || !window.files.length) await window.loadFiles();
    for (var folderIndex = 0; folderIndex < window.files.length; folderIndex += 1) {
      var folder = window.files[folderIndex];
      for (var fileIndex = 0; fileIndex < folder.files.length; fileIndex += 1) {
        if (folder.files[fileIndex].path === path) {
          window.switchAdminView("content");
          await window.openFile(folderIndex, fileIndex);
          return;
        }
      }
    }
    alert("没有在当前内容仓库中找到这篇笔记：" + path);
  };

  window.loadAdminUsers = async function (quiet) {
    var list = document.getElementById("adminUserList");
    if (!capabilities || !capabilities.can_manage_roles) {
      if (list) list.innerHTML = '<div class="admin-empty">只有站长可以查看并更改全站账户权限。</div>';
      return;
    }
    if (list && !quiet) list.innerHTML = '<div class="admin-empty">正在读取账户…</div>';

    try {
      var result = await window.sb.rpc("list_roles", { admin_uid: window.sbUser.id });
      if (result.error) throw result.error;
      usersCache = result.data || [];
      var privileged = usersCache.filter(function (user) { return user.role === "admin" || user.role === "editor"; }).length;
      setText("adminUserCount", usersCache.length + " 个账户");
      setText("overviewUserSummary", usersCache.length + " 个账户，其中 " + privileged + " 个拥有站点编辑权限");
      if (!list) return;

      list.innerHTML = usersCache.map(function (user) {
        var isOwner = user.user_id === window.sbUser.id && capabilities.is_site_owner;
        var label = roleLabel(user.role, isOwner);
        var badgeClass = isOwner ? "owner" : (user.role || "user");
        var action = isOwner
          ? '<span class="admin-queue-meta">受保护</span>'
          : '<button type="button" data-user-email="' + escAttr(user.email) + '" data-user-role="' + escAttr(user.role || "user") + '">更改角色</button>';
        return '<div class="admin-user-row">' +
          '<div class="admin-user-identity"><strong>' + esc(user.display_name || user.email) + '</strong><small>' + esc(user.email) + '</small></div>' +
          '<span class="admin-role-badge ' + escAttr(badgeClass) + '">' + esc(label) + '</span>' + action + '</div>';
      }).join("");
      list.querySelectorAll("[data-user-email]").forEach(function (button) {
        button.addEventListener("click", function () {
          document.getElementById("adminRoleEmail").value = button.getAttribute("data-user-email") || "";
          document.getElementById("adminRoleSelect").value = button.getAttribute("data-user-role") || "user";
          updateRoleConsequence();
          document.getElementById("adminRoleEmail").focus();
        });
      });
    } catch (error) {
      if (list) list.innerHTML = '<div class="admin-empty">账户读取失败：' + esc(error.message) + '</div>';
    }
  };

  function updateRoleConsequence() {
    var select = document.getElementById("adminRoleSelect");
    var box = document.getElementById("adminRoleConsequence");
    if (!select || !box) return;
    var copy = {
      user: "对方将只能访问自己的账户与知识工作区，不能再进入站点编辑部。",
      editor: "对方将能够进入站点编辑部，新建、修改并提交公共知识内容。",
      admin: "对方将能够编辑公共内容并处理全站评论；仍不能管理其他用户的角色。"
    };
    box.textContent = copy[select.value];
  }

  window.grantAdminUserRole = async function () {
    var email = document.getElementById("adminRoleEmail").value.trim();
    var role = document.getElementById("adminRoleSelect").value;
    var message = document.getElementById("adminRoleMessage");
    if (!email) return;

    var consequence = document.getElementById("adminRoleConsequence").textContent;
    if (!confirm("确认把 " + email + " 设置为“" + roleLabel(role, false) + "”？\n\n" + consequence)) return;
    message.textContent = "正在更改权限…";

    try {
      var result;
      if (role === "user") {
        result = await window.sb.rpc("revoke_role", { admin_uid: window.sbUser.id, target_email: email });
      } else {
        result = await window.sb.rpc("grant_role", { admin_uid: window.sbUser.id, target_email: email, target_role: role });
      }
      if (result.error) throw result.error;
      message.textContent = "权限已更新。";
      await window.loadAdminUsers();
    } catch (error) {
      message.textContent = "更改失败：" + error.message;
    }
  };

  function statusRow(label, detail, ok, trailing) {
    return '<div class="admin-status-row"><span class="admin-status-dot ' + (ok ? "ok" : "error") + '"></span>' +
      '<div><strong>' + esc(label) + '</strong><small>' + esc(detail) + '</small></div>' +
      '<time>' + esc(trailing || "") + '</time></div>';
  }

  function setUploadToolsReady(ready) {
    ["pdfImportOpenBtn", "imageBtn", "chemBtn"].forEach(function (id) {
      var button = document.getElementById(id);
      if (!button) return;
      button.disabled = !ready;
      button.title = ready ? "" : "图片存储正在升级，请先部署新版 wouldkeep-api Worker";
    });
  }

  window.loadAdminSystemStatus = async function (quiet) {
    var list = document.getElementById("adminStatusList");
    if (list && !quiet) list.innerHTML = '<div class="admin-empty">正在检查关键连接…</div>';
    var rows = [];
    var now = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

    rows.push(statusRow("账户会话", window.sbUser ? "Supabase 登录有效 · " + window.sbUser.email : "尚未登录", !!window.sbUser, now));
    var documentCount = 0;
    if (Array.isArray(window.files)) window.files.forEach(function (folder) { documentCount += folder.files.length; });
    rows.push(statusRow("内容仓库", documentCount ? "已读取 " + documentCount + " 篇 Markdown 内容" : "尚未读取内容列表", documentCount > 0, now));

    try {
      var response = await fetch(window.WORKER_URL + "/api/health", { cache: "no-store" });
      var health = await response.json();
      if (!response.ok) throw new Error(health.error || "HTTP " + response.status);
      rows.push(statusRow("编辑 API", "GitHub 代理与权限检查可用", true, now));
      var uploadReady = health.upload === "ready";
      setUploadToolsReady(uploadReady);
      rows.push(statusRow("图片存储", uploadReady ? "R2 已通过 Worker 安全连接" : "等待部署新的 R2 Worker 绑定", uploadReady, now));
      setText("overviewSystemSummary", uploadReady ? "编辑 API 与图片存储连接正常" : "编辑 API 正常，图片存储等待部署新配置");
    } catch (error) {
      setUploadToolsReady(false);
      rows.push(statusRow("编辑 API", "连接失败：" + error.message, false, now));
      rows.push(statusRow("图片存储", "无法确认 Worker 中的 R2 绑定", false, now));
      setText("overviewSystemSummary", "后台 API 暂时无法连接，请进入系统状态查看");
    }

    if (list) list.innerHTML = rows.join("");
  };

  async function secureUpload(fileName, file) {
    if (!window.sb || !window.sb.auth) throw new Error("账户系统尚未就绪");
    var sessionResult = await window.sb.auth.getSession();
    var session = sessionResult.data && sessionResult.data.session;
    if (!session) throw new Error("登录已过期，请重新登录");

    var response = await fetch(window.WORKER_URL + "/api/upload?filename=" + encodeURIComponent(fileName), {
      method: "PUT",
      headers: {
        "Authorization": "Bearer " + session.access_token,
        "Content-Type": file.type || "application/octet-stream"
      },
      body: file
    });
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(payload.error || "图片上传失败（HTTP " + response.status + "）");
    return payload.url;
  }

  window._r2Upload = secureUpload;

  document.addEventListener("DOMContentLoaded", function () {
    if (!localStorage.getItem("theme")) document.body.classList.add("light");
    var roleSelect = document.getElementById("adminRoleSelect");
    if (roleSelect) roleSelect.addEventListener("change", updateRoleConsequence);
    updateRoleConsequence();
  });
})();
