/* 全站行为：从 nav.js 生成页头/侧边栏/TOC/上下章，并负责代码块增强、复制、
 * Tab 切换、出处 chip、搜索、主题、进度、键盘导航。
 *
 * 页面只需要：
 *   <body data-page="02-first-agent" data-root="..">
 *     <main><article class="article"> ...正文... </article></main>
 *   </body>
 * 其余全部由这里注入，避免 17 个页面重复维护导航。
 */
(function () {
  "use strict";

  var SITE = window.AS_SITE;
  var body = document.body;
  var ROOT = body.getAttribute("data-root") || ".";
  var PAGE_ID = body.getAttribute("data-page") || "";
  var LS = {
    theme: "as-learn-theme",
    read: "as-learn-read",
    seen: "as-learn-seen",
    tabs: "as-learn-tabs",
    last: "as-learn-last",
    ex: "as-learn-ex",
    prefs: "as-learn-prefs",
    done: "as-learn-done",
    review: "as-learn-review",
    exMeta: "as-learn-exmeta",
  };

  // 右栏目录的当前节高亮；重建目录时先断开旧 observer
  var tocIO = null;
  var tocUpdate = null;
  var tocBound = false;
  var tocClickBound = false;
  var navDismissBound = false;
  // 读屏播报：复制成功、搜索结果数这类瞬时反馈都写进这个 live region
  var srStatus = null;
  var srTimer = null;
  // 打开本页目录前先把搜索层收掉（两者都想占满屏，不能同时开）
  var closeSearchUI = function () {};
  // 阅读设置面板互斥：开搜索/导航/目录时先收起
  var closeReadUI = function () {};

  function setToc(open) {
    body.classList.toggle("toc-open", !!open);
    var b = document.getElementById("toc-toggle");
    if (b) b.setAttribute("aria-expanded", open ? "true" : "false");
  }

  // 窄屏的章节抽屉：aria-expanded 必须跟视觉状态同步
  function setNav(open) {
    body.classList.toggle("nav-open", !!open);
    var b = document.getElementById("menu-toggle");
    if (b) b.setAttribute("aria-expanded", open ? "true" : "false");
  }

  /* ---------- 小工具 ---------- */

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function lsGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* file:// 或隐私模式下不可用，进度功能降级 */
    }
  }

  // localStorage 里可能是手改过的旧数据，统一兜底成普通对象，避免 .forEach/取值抛错
  function plainObj(v) {
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  }

  /* ---------- 阅读偏好（字号 / 宽度 / 代码换行 / 目录精简） ---------- */

  var PREFS_DEFAULT = { size: "m", width: "normal", wrap: false, toc: false };
  var prefs = Object.assign({}, PREFS_DEFAULT, lsGet(LS.prefs, {}));
  if (["s", "m", "l"].indexOf(prefs.size) < 0) prefs.size = "m";
  if (["normal", "wide"].indexOf(prefs.width) < 0) prefs.width = "normal";
  prefs.wrap = !!prefs.wrap;
  prefs.toc = !!prefs.toc;

  function savePrefs() {
    lsSet(LS.prefs, prefs);
  }

  // 状态全部落在 <html> 上，CSS 用属性选择器切换，避免每个组件写一遍 JS
  function applyPrefs() {
    var r = document.documentElement;
    if (prefs.size === "m") r.removeAttribute("data-read-size");
    else r.setAttribute("data-read-size", prefs.size);
    if (prefs.width === "wide") r.setAttribute("data-read-width", "wide");
    else r.removeAttribute("data-read-width");
    if (prefs.wrap) r.setAttribute("data-code-wrap", "on");
    else r.removeAttribute("data-code-wrap");
    if (prefs.toc) r.setAttribute("data-toc", "compact");
    else r.removeAttribute("data-toc");
    syncReadUI();
  }

  function syncReadUI() {
    var panel = document.getElementById("read-panel");
    if (panel) {
      panel.querySelectorAll("[data-size]").forEach(function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-size") === prefs.size ? "true" : "false");
      });
      panel.querySelectorAll("[data-width]").forEach(function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-width") === prefs.width ? "true" : "false");
      });
      var cb = document.getElementById("code-wrap");
      if (cb) cb.checked = !!prefs.wrap;
    }
    var tc = document.getElementById("toc-compact");
    if (tc) tc.setAttribute("aria-pressed", prefs.toc ? "true" : "false");
  }

  // 脚本在 </body> 前执行：先把偏好落到 <html>，避免首帧先按默认字号排一遍
  applyPrefs();

  function announce(msg) {
    if (!srStatus) return;
    clearTimeout(srTimer);
    srStatus.textContent = "";
    // 先清空再写入，连续复制同一条时读屏也会再播一次
    srTimer = setTimeout(function () {
      srStatus.textContent = msg;
    }, 40);
  }

  /* ---------- 跳到正文 ---------- */

  function initSkipLink() {
    var main = document.querySelector("main");
    if (!main) return;
    main.id = "main";
    main.setAttribute("tabindex", "-1");
    var a = el("a", "skip-link", "跳到正文");
    a.href = "#main";
    body.insertBefore(a, body.firstChild);
  }

  // file:// 不是安全上下文，navigator.clipboard 常常不可用 —— 必须回退
  function copyText(text) {
    var done = function (ok) {
      return ok;
    };
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () {
          return done(true);
        },
        function () {
          return legacy();
        }
      );
    }
    return Promise.resolve(legacy());

    function legacy() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return done(ok);
      } catch (e) {
        return done(false);
      }
    }
  }

  function abs(href) {
    if (!href || href === "#") return "#";
    if (/^[a-z]+:\/\//i.test(href)) return href;
    return ROOT + "/" + href.replace(/^\.\//, "");
  }

  /* ---------- 扁平章节表 ---------- */

  var flat = [];
  SITE.groups.forEach(function (g) {
    g.items.forEach(function (it) {
      flat.push(Object.assign({ group: g.title }, it));
    });
  });

  function byId(id) {
    for (var i = 0; i < flat.length; i++) if (flat[i].href.indexOf(id + ".html") > -1) return flat[i];
    return null;
  }

  function currentIndex() {
    for (var i = 0; i < flat.length; i++) {
      if (flat[i].href === (body.getAttribute("data-href") || "")) return i;
    }
    for (var j = 0; j < flat.length; j++) {
      if (flat[j].href.indexOf(PAGE_ID + ".html") > -1) return j;
    }
    return -1;
  }

  var readMap = plainObj(lsGet(LS.read, {}));
  var seenMap = plainObj(lsGet(LS.seen, {}));
  // doneMap：标记读完的时间；reviewMap：手动「已复习」的时间；exMeta：练习步数快照
  var doneMap = plainObj(lsGet(LS.done, {}));
  var reviewMap = plainObj(lsGet(LS.review, {}));
  var exMeta = plainObj(lsGet(LS.exMeta, {}));

  /* ---------- 页头 ---------- */

  var item = currentIndex();

  function buildHeader() {
    var h = el("header", "site-header");
    h.innerHTML =
      '<button class="icon-btn" id="menu-toggle" title="目录" aria-label="章节导航" aria-controls="sidebar" aria-expanded="false">☰</button>' +
      '<a class="brand" href="' +
      abs("index.html") +
      '"><span class="logo">◆</span><span class="bname">Spring AI 学习站</span>' +
      '<span class="bshort">Spring AI</span></a>' +
      '<span class="ver">v' +
      SITE.version +
      "</span>" +
      '<div class="spacer"></div>' +
      '<button class="icon-btn" id="toc-toggle" title="本页目录" aria-label="本页目录" aria-controls="toc" aria-expanded="false">▤</button>' +
      '<button class="icon-btn" id="search-toggle" title="搜索（/）" aria-label="打开搜索" aria-controls="q" aria-expanded="false">⌕</button>' +
      '<div class="searchbox" role="search" aria-label="站内搜索"><span class="icon">⌕</span>' +
      '<input id="q" type="search" placeholder="搜索章节 / 概念 / 报错原文…" autocomplete="off" spellcheck="false" aria-label="搜索章节、概念或报错原文" aria-controls="search-results" aria-expanded="false">' +
      "<kbd>/</kbd>" +
      '<button class="search-cancel" type="button" id="search-cancel">取消</button>' +
      '<div class="search-results" id="search-results" aria-label="搜索结果"></div>' +
      '<span class="sr-only" id="search-status" role="status" aria-live="polite"></span></div>' +
      '<button class="icon-btn" id="read-toggle" title="阅读设置（字号 / 宽度 / 代码换行）" aria-label="阅读设置" aria-controls="read-panel" aria-expanded="false">Aa</button>' +
      '<button class="icon-btn" id="theme-toggle" title="切换亮/暗主题" aria-label="切换亮/暗主题" aria-pressed="false">◐</button>' +
      '<div class="read-panel" id="read-panel" role="group" aria-label="阅读设置" tabindex="-1" hidden>' +
      '<div class="rp-row"><span class="rp-label">正文字号</span><div class="seg" role="group" aria-label="正文字号">' +
      '<button type="button" data-size="s" aria-pressed="false">小</button>' +
      '<button type="button" data-size="m" aria-pressed="true">中</button>' +
      '<button type="button" data-size="l" aria-pressed="false">大</button>' +
      "</div></div>" +
      '<div class="rp-row"><span class="rp-label">内容宽度</span><div class="seg" role="group" aria-label="内容宽度">' +
      '<button type="button" data-width="normal" aria-pressed="true">标准</button>' +
      '<button type="button" data-width="wide" aria-pressed="false">加宽</button>' +
      "</div></div>" +
      '<label class="rp-check"><input type="checkbox" id="code-wrap"> <span>代码自动换行</span></label>' +
      '<div class="rp-foot"><button type="button" class="rp-reset" id="read-reset">恢复默认</button></div>' +
      "</div>" +
      '<div class="sr-only" id="sr-status" role="status" aria-live="polite"></div>';
    body.insertBefore(h, body.firstChild);
    srStatus = document.getElementById("sr-status");

    var themeBtn = document.getElementById("theme-toggle");
    function syncTheme() {
      themeBtn.setAttribute(
        "aria-pressed",
        document.documentElement.getAttribute("data-theme") === "dark" ? "true" : "false"
      );
    }
    syncTheme();

    document.getElementById("menu-toggle").addEventListener("click", function () {
      var open = !body.classList.contains("nav-open");
      setToc(false);
      closeSearchUI();
      closeReadUI();
      setNav(open);
    });
    document.getElementById("toc-toggle").addEventListener("click", function () {
      setNav(false);
      closeSearchUI();
      closeReadUI();
      setToc(!body.classList.contains("toc-open"));
    });
    themeBtn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      lsSet(LS.theme, next);
      syncTheme();
    });

    // 阅读设置：顶栏一个 Aa 按钮 + 一个不抢布局的浮层
    var readBtn = document.getElementById("read-toggle");
    var readPanel = document.getElementById("read-panel");
    function setReadPanel(open) {
      // 关闭时焦点还在面板里就先还给按钮，别让键盘用户掉回 body
      if (!open && readPanel.contains(document.activeElement)) readBtn.focus();
      readPanel.hidden = !open;
      readBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (!open) return;
      setNav(false);
      setToc(false);
      closeSearchUI();
      readPanel.focus();
    }
    closeReadUI = function () {
      if (!readPanel.hidden) setReadPanel(false);
    };
    readBtn.addEventListener("click", function () {
      setReadPanel(readPanel.hidden);
    });
    readPanel.querySelectorAll("[data-size]").forEach(function (b) {
      b.addEventListener("click", function () {
        prefs.size = b.getAttribute("data-size");
        savePrefs();
        applyPrefs();
        announce("正文字号：" + b.textContent);
      });
    });
    readPanel.querySelectorAll("[data-width]").forEach(function (b) {
      b.addEventListener("click", function () {
        prefs.width = b.getAttribute("data-width");
        savePrefs();
        applyPrefs();
        announce("内容宽度：" + b.textContent);
      });
    });
    document.getElementById("code-wrap").addEventListener("change", function () {
      prefs.wrap = this.checked;
      savePrefs();
      applyPrefs();
      announce(this.checked ? "代码已自动换行" : "代码恢复横向滚动");
    });
    document.getElementById("read-reset").addEventListener("click", function () {
      prefs = Object.assign({}, PREFS_DEFAULT);
      savePrefs();
      applyPrefs();
      announce("已恢复默认阅读设置");
      readPanel.focus();
    });
    document.addEventListener("click", function (e) {
      if (readPanel.hidden) return;
      if (e.target.closest("#read-panel") || e.target.closest("#read-toggle")) return;
      setReadPanel(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !readPanel.hidden) {
        setReadPanel(false);
        readBtn.focus();
      }
    });
    syncReadUI();

    // 抽屉式导航：点外面、按 Esc 都能关，键盘焦点还给菜单按钮
    if (!navDismissBound) {
      navDismissBound = true;
      document.addEventListener("click", function (e) {
        if (!body.classList.contains("nav-open")) return;
        if (e.target.closest(".sidebar") || e.target.closest("#menu-toggle")) return;
        setNav(false);
      });
      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape" || !body.classList.contains("nav-open")) return;
        setNav(false);
        var m = document.getElementById("menu-toggle");
        if (m) m.focus();
      });
    }

    initSearch();
  }

  /* ---------- 搜索 ---------- */

  function buildIndex() {
    var idx = [];
    flat.forEach(function (it) {
      if (it.status === "later") return;
      idx.push({
        title: it.num + " " + it.title,
        sub: it.group,
        href: it.href,
        kind: "page",
        disabled: it.status !== "ready",
        hay: (it.title + " " + it.desc + " " + (it.kw || []).join(" ")).toLowerCase(),
      });
      if (it.status === "ready") {
        (it.sections || []).forEach(function (s) {
          idx.push({
            title: s[1],
            sub: it.num + " · " + it.title,
            href: it.href + "#" + s[0],
            kind: "sec",
            disabled: false,
            hay: (s[1] + " " + it.title).toLowerCase(),
          });
        });
      }
    });
    return idx;
  }

  function initSearch() {
    var index = buildIndex();
    var input = document.getElementById("q");
    var box = document.getElementById("search-results");
    var active = -1;
    var cancelBtn = document.getElementById("search-cancel");
    var toggleBtn = document.getElementById("search-toggle");
    var narrow = window.matchMedia("(max-width: 560px)");
    var status = document.getElementById("search-status");

    function setOpen(on) {
      box.classList.toggle("open", on);
      input.setAttribute("aria-expanded", on ? "true" : "false");
    }

    function say(msg) {
      if (status) status.textContent = msg;
    }

    // 窄屏（≤560px）平时只留一个搜索图标，点开才展开成满宽输入层
    function openSearch() {
      setToc(false);
      setNav(false);
      closeReadUI();
      if (narrow.matches) document.body.classList.add("search-open");
      if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "true");
      input.focus();
    }
    function closeSearch(restore) {
      document.body.classList.remove("search-open");
      if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
      setOpen(false);
      say("");
      active = -1;
      input.blur();
      // 只有窄屏才有那个图标可回；桌面端 Esc 后把焦点还给页面
      if (restore && narrow.matches && toggleBtn) toggleBtn.focus();
    }
    closeSearchUI = closeSearch;
    if (toggleBtn) toggleBtn.addEventListener("click", openSearch);
    if (cancelBtn)
      cancelBtn.addEventListener("click", function () {
        closeSearch(true);
      });

    // 正文兜底：search-index.js 只是 manifest，正文按 nav 分组拆成多个
    // search-index-NN.js；首次聚焦搜索框才加载，任何一块先到就先出结果。
    var FULL = [];
    var fullLoading = false;
    function ensureFullIndex() {
      if (fullLoading) return;
      fullLoading = true;
      var manifest = document.createElement("script");
      manifest.src = ROOT + "/assets/search-index.js";
      manifest.async = true;
      manifest.onload = function () {
        var chunks = window.AS_SEARCH_CHUNKS || [];
        if (!chunks.length) {
          fullLoading = false;
          return;
        }
        window.AS_SEARCH_INDEX = [];
        chunks.forEach(function (name) {
          var s = document.createElement("script");
          s.src = ROOT + "/assets/" + name;
          s.async = true;
          s.onload = function () {
            FULL = window.AS_SEARCH_INDEX || [];
            if (input.value.trim()) run();
          };
          s.onerror = function () {};
          document.head.appendChild(s);
        });
      };
      manifest.onerror = function () {
        fullLoading = false;
      };
      document.head.appendChild(manifest);
    }
    input.addEventListener("focus", ensureFullIndex);
    input.addEventListener("input", ensureFullIndex);

    function escHtml(v) {
      return String(v).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    }

    function countIn(hay, needle) {
      var n = 0;
      var i = 0;
      while ((i = hay.indexOf(needle, i)) > -1) {
        n++;
        i += needle.length;
      }
      return n;
    }

    // 取命中词前后各一小段，转义后把命中词包成 <mark>
    function snippet(text, parts) {
      var low = text.toLowerCase();
      var at = -1;
      parts.forEach(function (p) {
        var i = low.indexOf(p);
        if (i > -1 && (at < 0 || i < at)) at = i;
      });
      if (at < 0) at = 0;
      var start = Math.max(0, at - 40);
      var end = Math.min(text.length, at + 140);
      // 别从单词/汉字中间切开
      var sp = text.lastIndexOf(" ", start);
      if (sp > start - 24 && sp > -1) start = sp + 1;
      sp = text.indexOf(" ", end);
      if (sp > -1 && sp < end + 24) end = sp;
      var s =
        (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
      s = escHtml(s);
      var pat = parts
        .map(function (p) {
          return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .filter(Boolean)
        .join("|");
      if (pat) s = s.replace(new RegExp("(" + pat + ")", "gi"), "<mark>$1</mark>");
      return s;
    }

    function search(q) {
      var parts = q.split(/\s+/);
      var seen = {};
      var meta = index.filter(function (r) {
        return parts.every(function (p) {
          return r.hay.indexOf(p) > -1;
        });
      });
      meta.sort(function (a, b) {
        // 标题命中排前面；只命中摘要/小节名的（indexOf 为 -1）排后面
        var ai = a.title.toLowerCase().indexOf(parts[0]);
        var bi = b.title.toLowerCase().indexOf(parts[0]);
        return (ai < 0 ? 1e9 : ai) - (bi < 0 ? 1e9 : bi);
      });
      meta.forEach(function (r) {
        seen[r.href] = 1;
      });

      var body = [];
      FULL.forEach(function (s) {
        var hay = (s.t + " " + s.x).toLowerCase();
        if (
          !parts.every(function (p) {
            return hay.indexOf(p) > -1;
          })
        )
          return;
        var href = s.p + "#" + s.s;
        if (seen[href]) return;
        seen[href] = 1;
        var score = 0;
        parts.forEach(function (p) {
          score += countIn(hay, p);
        });
        // 查询词全在标题里：这条就是在讲这个，压过只是顺带提到的长章节
        var tt = s.t.toLowerCase();
        if (
          parts.every(function (p) {
            return tt.indexOf(p) > -1;
          })
        )
          score += 100;
        body.push({
          title: s.t,
          sub: s.n + (s.k === "err" ? " · 报错条目" : s.k === "h3" ? " · 小节" : " · 正文"),
          href: href,
          snip: snippet(s.x, parts),
          score: score,
        });
      });
      body.sort(function (a, b) {
        return b.score - a.score;
      });
      // 章节目录条目只留 4 条：一个大章节的 sections 很多，全排前面会把
      // 真正命中正文小节的结果挤到 12 条之外；页面级命中全部保留
      var pageHits = meta.filter(function (r) {
        return r.kind === "page";
      });
      var secHits = meta.filter(function (r) {
        return r.kind !== "page";
      });
      return pageHits.concat(secHits.slice(0, 4), body);
    }

    function render(list) {
      box.innerHTML = "";
      if (!list.length) {
        box.appendChild(
          el(
            "div",
            "search-results-empty",
            "没有匹配项，试试「工具」「权限」，或报错原文如 TurnBusyException"
          )
        );
        setOpen(true);
        say("没有匹配项");
        return;
      }
      list.slice(0, 12).forEach(function (r) {
        var a = el("a", r.disabled ? "disabled" : "");
        a.innerHTML =
          "<div>" +
          r.title +
          (r.disabled ? ' <span class="where">（编写中）</span>' : "") +
          "</div>" +
          (r.snip ? '<div class="snip">' + r.snip + "</div>" : "") +
          '<div class="where">' +
          r.sub +
          "</div>";
        if (!r.disabled) a.href = abs(r.href);
        else a.style.opacity = ".55";
        a.addEventListener("click", function () {
          setOpen(false);
          say("");
        });
        box.appendChild(a);
      });
      setOpen(true);
      say(
        list.length > 12
          ? "找到 " + list.length + " 条结果，显示前 12 条"
          : "找到 " + list.length + " 条结果"
      );
    }

    function run() {
      var q = input.value.trim().toLowerCase();
      if (!q) {
        setOpen(false);
        say("");
        active = -1;
        return;
      }
      render(search(q));
      active = -1;
    }

    input.addEventListener("input", run);
    input.addEventListener("focus", run);
    input.addEventListener("keydown", function (e) {
      var links = box.querySelectorAll("a[href]");
      if (e.key === "Escape") {
        closeSearch(true);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!links.length) return;
        active = e.key === "ArrowDown" ? Math.min(active + 1, links.length - 1) : Math.max(active - 1, 0);
        links.forEach(function (l, i) {
          l.classList.toggle("active", i === active);
        });
        links[active].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && active >= 0 && links[active]) {
        window.location.href = links[active].href;
      }
    });

    document.addEventListener("click", function (e) {
      if (e.target.closest(".searchbox") || e.target.closest("#search-toggle")) return;
      if (document.body.classList.contains("search-open")) closeSearch(false);
      else if (box.classList.contains("open")) {
        setOpen(false);
        say("");
        active = -1;
      }
    });

    document.addEventListener("keydown", function (e) {
      // 焦点跑到结果链接上时，Esc 也要能收起搜索
      if (e.key === "Escape" && box.classList.contains("open")) {
        closeSearch(true);
        return;
      }
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      e.preventDefault();
      openSearch();
    });
  }

  /* ---------- 侧边栏 ---------- */

  function buildSidebar() {
    var nav = el("nav", "sidebar");
    nav.id = "sidebar";
    nav.setAttribute("aria-label", "章节导航");

    var total = flat.filter(function (i) {
      return i.status === "ready";
    }).length;
    var done = Object.keys(readMap).filter(function (k) {
      return readMap[k];
    }).length;

    var pw = el("div", "progress-wrap");
    pw.innerHTML =
      '<div class="lbl"><span>学习进度</span><span id="prog-txt">' +
      done +
      " / " +
      total +
      "</span></div>" +
      '<div class="bar" role="progressbar" aria-label="学习进度" aria-valuemin="0" aria-valuemax="' +
      total +
      '" aria-valuenow="' +
      done +
      '"><i style="width:' +
      (total ? Math.round((done / total) * 100) : 0) +
      '%"></i></div>';
    nav.appendChild(pw);

    SITE.groups.forEach(function (g) {
      nav.appendChild(el("div", "group-title", g.title));
      g.items.forEach(function (it) {
        var isCur = it.href.indexOf(PAGE_ID + ".html") > -1;
        var numHtml = '<span class="num">' + it.num + "</span>";
        if (it.status === "ready") {
          var a = el("a", (isCur ? "current " : "") + (readMap[stripHref(it.href)] ? "read" : ""));
          a.href = abs(it.href);
          if (isCur) a.setAttribute("aria-current", "page");
          a.innerHTML = numHtml + "<span>" + it.title + "</span>";
          nav.appendChild(a);
        } else {
          var s = el("div", "sidebar-item-disabled");
          s.innerHTML =
            '<span class="num">' +
            it.num +
            "</span><span>" +
            it.title +
            "</span>" +
            (it.status === "later" ? '<span class="tag">下一轮</span>' : '<span class="tag">编写中</span>');
          nav.appendChild(s);
        }
      });
    });
    return nav;
  }

  // 刷新后把当前章滚到侧栏中间；否则长目录每次都从「开始」回到顶部，
  // 切换下面章节还得重新往下拉。
  function revealCurrentChapter(nav) {
    var cur = nav.querySelector("a.current");
    if (!cur) return;
    var target = cur.offsetTop - Math.max(0, (nav.clientHeight - cur.offsetHeight) / 2);
    nav.scrollTop = Math.max(0, target);
  }

  function stripHref(href) {
    return href.replace(/^chapters\/|^appendix\//, "").replace(/\.html$/, "");
  }

  /* ---------- 右侧 TOC ---------- */

  function buildToc() {
    var article = document.querySelector(".article");
    if (!article) return null;
    var heads = article.querySelectorAll("h2[id], h3[id]");
    if (heads.length < 2) return null;
    var toc = el("aside", "toc");
    toc.id = "toc";
    toc.setAttribute("aria-label", "本页目录");
    var top = el("div", "toc-top");
    top.appendChild(el("div", "group-title", "本页目录"));
    // 三级标题太多时，允许只看 h2；只在页面确实有 h3 时出现
    if (article.querySelector("h3[id]")) {
      var compact = el("button", "toc-compact", "精简");
      compact.type = "button";
      compact.id = "toc-compact";
      compact.title = "只看二级标题";
      compact.setAttribute("aria-label", "只看二级标题");
      compact.setAttribute("aria-pressed", prefs.toc ? "true" : "false");
      compact.addEventListener("click", function () {
        prefs.toc = !prefs.toc;
        savePrefs();
        applyPrefs();
        if (tocUpdate) tocUpdate();
      });
      top.appendChild(compact);
    }
    var close = el("button", "toc-close", "✕");
    close.type = "button";
    close.setAttribute("aria-label", "关闭目录");
    close.addEventListener("click", function () {
      setToc(false);
      var t = document.getElementById("toc-toggle");
      if (t) t.focus();
    });
    top.appendChild(close);
    toc.appendChild(top);
    var ul = el("ul", "");
    heads.forEach(function (h) {
      var li = el("li", h.tagName === "H3" ? "toc-sub" : "toc-main");
      var a = el("a", h.tagName === "H3" ? "lvl3" : "lvl2");
      a.href = "#" + h.id;
      // 只剥「1. / 2· / 3、」这种真序号，别把「20 分钟动手练习」的开头吃掉；
      // 末尾的 # 是 initHeadingAnchors 挂的锚点，不进目录
      a.textContent = h.textContent.replace(/^\s*\d+\s*[·.、]\s*/, "").replace(/\s*#\s*$/, "");
      li.appendChild(a);
      ul.appendChild(li);
    });
    toc.appendChild(ul);

    // 小屏抽屉模式：点条目就收起，别挡住刚跳到的正文
    ul.addEventListener("click", function (e) {
      if (e.target.closest("a")) setToc(false);
    });
    if (!tocClickBound) {
      tocClickBound = true;
      document.addEventListener("click", function (e) {
        if (!body.classList.contains("toc-open")) return;
        if (e.target.closest(".toc") || e.target.closest("#toc-toggle")) return;
        setToc(false);
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && body.classList.contains("toc-open")) {
          setToc(false);
          var t = document.getElementById("toc-toggle");
          if (t) t.focus();
        }
      });
    }

    var links = ul.querySelectorAll("a");
    var active = -2;
    function setActive(i) {
      if (i === active) return;
      active = i;
      links.forEach(function (l, k) {
        l.classList.toggle("active", k === i);
        if (k === i) l.setAttribute("aria-current", "location");
        else l.removeAttribute("aria-current");
      });
    }
    // 当前节 = 最后一个已经越过页头（130px）的标题
    function currentHead() {
      var cur = -1;
      for (var i = 0; i < heads.length; i++) {
        if (heads[i].getBoundingClientRect().top <= 130) cur = i;
        else break;
      }
      return cur;
    }
    tocUpdate = function () {
      var cur = currentHead();
      cur = cur < 0 ? 0 : cur;
      // 精简模式只显示 h2：当前节落在 h3 上时，把高亮回退到它所属的 h2
      if (prefs.toc) {
        while (cur > 0 && links[cur] && links[cur].classList.contains("lvl3")) cur--;
      }
      setActive(cur);
    };
    if (tocIO) tocIO.disconnect();
    tocIO = null;
    if ("IntersectionObserver" in window) {
      // 只观察「页头下方 ~ 视口 45%」这条窄带：标题穿过时重算当前节，
      // 比 scroll 事件便宜，也不会每帧都读一遍所有标题的布局
      tocIO = new IntersectionObserver(tocUpdate, {
        rootMargin: "-120px 0px -55% 0px",
        threshold: 0,
      });
      heads.forEach(function (h) {
        tocIO.observe(h);
      });
    }
    // 瞬时跳转（hash 直达、恢复滚动位置）可能整段跨过窄带，IO 不会触发，
    // 这里用 scrollend 兜一次底；只绑一次，重建目录时复用同一个入口
    if (!tocBound) {
      tocBound = true;
      window.addEventListener(
        "scrollend",
        function () {
          if (tocUpdate) tocUpdate();
        },
        { passive: true }
      );
    }
    tocUpdate();
    return toc;
  }

  /* ---------- 阅读进度条 ---------- */

  function initReadProgress() {
    var bar = el("div", "read-progress");
    bar.id = "read-progress";
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", "阅读进度");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", "0");
    body.insertBefore(bar, body.firstChild);

    var ticking = false;
    function calc() {
      var d = document.documentElement;
      var max = d.scrollHeight - window.innerHeight;
      var y = window.scrollY || d.scrollTop || 0;
      var pct = max > 40 ? Math.min(100, Math.max(0, (y / max) * 100)) : 0;
      bar.style.width = pct.toFixed(2) + "%";
      bar.setAttribute("aria-valuenow", String(Math.round(pct)));
      bar.setAttribute("aria-valuetext", Math.round(pct) + "%");
      bar.hidden = max <= 40;
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        calc();
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("load", calc);
    calc();
    // 字体/高亮/图片让总高度晚一点才稳定，再补量一次
    setTimeout(calc, 300);
  }

  /* ---------- 代码块增强 ---------- */

  function enhanceCode() {
    document.querySelectorAll(".article pre").forEach(function (pre) {
      if (pre.parentElement.classList.contains("codeblock")) return;
      if (pre.hasAttribute("data-no-copy")) return;
      var lang = pre.getAttribute("data-lang") || guessLang(pre);
      var file = pre.getAttribute("data-file") || "";
      var wrap = el("div", "codeblock");
      pre.parentNode.insertBefore(wrap, pre);
      var head = el("div", "code-head");
      head.innerHTML =
        '<span class="lang">' +
        lang.toUpperCase() +
        "</span>" +
        (file ? '<span class="file">' + file + "</span>" : "");
      wrap.appendChild(head);
      wrap.appendChild(pre);
      var btn = el("button", "copy-btn", "复制");
      btn.type = "button";
      btn.addEventListener("click", function () {
        copyText(pre.textContent).then(function (ok) {
          btn.textContent = ok ? "已复制" : "复制失败";
          btn.classList.toggle("done", ok);
          announce(ok ? "代码已复制" : "复制失败");
          setTimeout(function () {
            btn.textContent = "复制";
            btn.classList.remove("done");
          }, 1600);
        });
      });
      wrap.appendChild(btn);
    });
  }

  function guessLang(pre) {
    var code = pre.querySelector("code");
    var cls = (code && code.className) || "";
    var m = cls.match(/language-([\w-]+)/);
    return m ? m[1] : "text";
  }

  /* ---------- Tab 切换 ---------- */

  function initTabs() {
    var saved = lsGet(LS.tabs, {});
    document.querySelectorAll(".article .tabs").forEach(function (box, bi) {
      var panels = box.querySelectorAll(".tab-panel");
      if (!panels.length) return;
      var bar = box.querySelector(".tab-bar");
      if (!bar) {
        bar = el("div", "tab-bar");
        box.insertBefore(bar, box.firstChild);
      }
      bar.setAttribute("role", "tablist");
      var ids = [];
      panels.forEach(function (p, pi) {
        var label = p.getAttribute("data-label") || "Tab " + (pi + 1);
        var id = p.id || "t" + bi + "-" + pi;
        p.id = id;
        p.setAttribute("role", "tabpanel");
        p.setAttribute("aria-labelledby", id + "-tab");
        ids.push(id);
        if (!bar.querySelector('[data-target="' + id + '"]')) {
          var b = el("button", "", label);
          b.type = "button";
          b.id = id + "-tab";
          b.setAttribute("role", "tab");
          b.setAttribute("aria-controls", id);
          b.setAttribute("aria-selected", "false");
          b.tabIndex = -1;
          b.setAttribute("data-target", id);
          bar.appendChild(b);
        }
      });
      var key = PAGE_ID + ":" + bi;
      function show(id) {
        panels.forEach(function (p) {
          var on = p.id === id;
          p.classList.toggle("on", on);
          // enhanceCode 会把 pre 包进 .codeblock；只隐藏 pre 会留下一个空的标题栏
          var wrap = p.closest(".codeblock");
          if (wrap) wrap.style.display = on ? "" : "none";
        });
        bar.querySelectorAll("button").forEach(function (b) {
          var on = b.getAttribute("data-target") === id;
          b.classList.toggle("on", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
          b.tabIndex = on ? 0 : -1;
        });
        lsSet(LS.tabs, Object.assign(saved, (function () { var o = {}; o[key] = id; return o; })()));
      }
      bar.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-target]");
        if (b) show(b.getAttribute("data-target"));
      });
      // 标准 tab 行为：左右键在标签之间移动，Home/End 跳首尾
      bar.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End")
          return;
        var btns = Array.prototype.slice.call(bar.querySelectorAll("button[data-target]"));
        var i = btns.indexOf(document.activeElement);
        if (i < 0) return;
        e.preventDefault();
        var next =
          e.key === "Home"
            ? 0
            : e.key === "End"
            ? btns.length - 1
            : (i + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length;
        btns[next].focus();
        show(btns[next].getAttribute("data-target"));
      });
      show(saved[key] && ids.indexOf(saved[key]) > -1 ? saved[key] : ids[0]);
    });
  }

  /* ---------- 出处 chip ---------- */

  function initSrcChips() {
    document.querySelectorAll(".article .src").forEach(function (s) {
      var raw = s.getAttribute("data-src") || s.textContent.trim();
      var m = raw.match(/^(.*?):(\d+)(?:-(\d+))?$/);
      // 图例里的「文件名:行号」只是样式示例，没有真实路径，别把它变成可点胶囊
      if (!m) {
        s.classList.add("src-static");
        return;
      }
      var path = m[1];
      var line = m[2];
      s.setAttribute("title", "点击复制路径" + (line ? "（行 " + line + "）" : "") + "；Ctrl/Cmd + 点击在 GitHub 打开");
      s.textContent = path.split("/").pop() + (line ? ":" + line : "");
      s.addEventListener("click", function (e) {
        if (e.metaKey || e.ctrlKey) {
          var w = window.open(SITE.repo + "/blob/main/" + path, "_blank");
          if (w) w.opener = null;
          return;
        }
        copyText(raw).then(function () {
          var old = s.textContent;
          s.style.borderColor = "var(--ok)";
          s.textContent = "已复制 ✓";
          announce("源码路径已复制");
          setTimeout(function () {
            s.style.borderColor = "";
            s.textContent = old;
          }, 1200);
        });
      });
    });
  }

  /* ---------- 标题锚点 ---------- */

  function initHeadingAnchors() {
    document.querySelectorAll(".article h2[id], .article h3[id]").forEach(function (h) {
      var sub = h.tagName === "H3";
      var a = el("a", "h-anchor", "#");
      a.href = "#" + h.id;
      a.title = sub ? "复制本小节链接" : "复制本节链接";
      a.setAttribute("aria-label", a.title);
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var url = location.href.split("#")[0] + "#" + h.id;
        try {
          history.replaceState(null, "", "#" + h.id);
        } catch (err) {
          // file:// 下部分浏览器不让 replaceState，退化成直接改 hash
          location.hash = h.id;
        }
        copyText(url).then(function (ok) {
          a.textContent = ok ? "✓" : "#";
          announce(ok ? "小节链接已复制" : "复制失败");
          setTimeout(function () {
            a.textContent = "#";
          }, 1200);
        });
      });
      h.appendChild(a);
    });
  }

  /* ---------- 报错条目锚点 ---------- */

  // 附录 B 的每条报错都有 id；这里给标题行挂一个 #，点了复制深链
  function initPitfallAnchors() {
    document.querySelectorAll(".article .pitfall[id]").forEach(function (box) {
      var head = box.querySelector(".pf-h");
      if (!head) return;
      var a = el("a", "pf-anchor", "#");
      a.href = "#" + box.id;
      a.title = "复制这条报错的链接";
      a.setAttribute("aria-label", "复制这条报错的链接");
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var url = location.href.split("#")[0] + "#" + box.id;
        try {
          history.replaceState(null, "", "#" + box.id);
        } catch (err) {
          location.hash = box.id;
        }
        pulse(box);
        copyText(url).then(function (ok) {
          a.textContent = ok ? "✓" : "#";
          announce(ok ? "报错链接已复制" : "复制失败");
          setTimeout(function () {
            a.textContent = "#";
          }, 1200);
        });
      });
      head.appendChild(a);
    });

    function pulse(node) {
      node.classList.remove("flash");
      void node.offsetWidth; // 强制重排，让同一元素能再次播放动画
      node.classList.add("flash");
    }

    // 从搜索结果或外链落到某一条时，给一次短暂的强调
    function flashFromHash() {
      var id = location.hash.slice(1);
      if (!id) return;
      var node = document.getElementById(id);
      if (node && node.classList.contains("pitfall")) pulse(node);
    }
    flashFromHash();
    window.addEventListener("hashchange", flashFromHash);
  }

  /* ---------- 练习勾选 ---------- */

  // 只认 #exercise 后面第一个 ol.steps。别的章节也用 .steps 画流程（比如 12 的合并层），
  // 那些不是练习，不挂勾选框。
  function initExercise() {
    var head = document.getElementById("exercise");
    if (!head) return;
    var ol = head.nextElementSibling;
    while (ol && !(ol.tagName === "OL" && ol.classList.contains("steps"))) ol = ol.nextElementSibling;
    if (!ol) return;

    var lis = Array.prototype.filter.call(ol.children, function (n) {
      return n.tagName === "LI";
    });
    if (!lis.length) return;

    var store = lsGet(LS.ex, {});
    if (!store || typeof store !== "object" || Array.isArray(store)) store = {};
    var saved = Array.isArray(store[PAGE_ID]) ? store[PAGE_ID] : [];
    var done = {};
    saved.forEach(function (i) {
      if (typeof i === "number" && i >= 0 && i < lis.length) done[i] = true;
    });

    // 跨页快照：首页据此判断「练习还差几步」，不必再打开本章
    exMeta[PAGE_ID] = { total: lis.length, done: Object.keys(done).length };
    lsSet(LS.exMeta, exMeta);

    var bar = el("div", "ex-progress");
    var count = el("span", "ex-count");
    count.setAttribute("aria-live", "polite");
    var track = el("span", "ex-bar");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", "练习进度");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", String(lis.length));
    track.setAttribute("aria-valuenow", "0");
    var fill = el("i");
    track.appendChild(fill);
    var reset = el("button", "ex-reset", "清除勾选");
    reset.type = "button";
    bar.appendChild(count);
    bar.appendChild(track);
    bar.appendChild(reset);
    head.parentNode.insertBefore(bar, head.nextSibling);

    function refresh() {
      var n = Object.keys(done).length;
      count.textContent =
        n === lis.length
          ? "练习已全部完成 · " + n + " / " + lis.length + " 步"
          : "练习进度 " + n + " / " + lis.length + " 步";
      fill.style.width = (n / lis.length) * 100 + "%";
      track.setAttribute("aria-valuenow", String(n));
      reset.hidden = n === 0;
    }

    function save() {
      var arr = Object.keys(done)
        .map(Number)
        .sort(function (a, b) {
          return a - b;
        });
      var next = lsGet(LS.ex, {});
      if (!next || typeof next !== "object" || Array.isArray(next)) next = {};
      if (arr.length) next[PAGE_ID] = arr;
      else delete next[PAGE_ID];
      lsSet(LS.ex, next);
      exMeta[PAGE_ID] = { total: lis.length, done: arr.length };
      lsSet(LS.exMeta, exMeta);
    }

    lis.forEach(function (li, i) {
      li.classList.add("ex-item");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "ex-cb";
      cb.id = "ex-" + (PAGE_ID || "page") + "-" + i;
      cb.checked = !!done[i];
      var title = li.querySelector(".sh");
      cb.setAttribute("aria-label", "第 " + (i + 1) + " 步" + (title ? "：" + title.textContent.trim() : ""));

      var box = el("label", "ex-check");
      box.setAttribute("for", cb.id);
      box.appendChild(cb);
      li.insertBefore(box, li.firstChild);
      li.classList.toggle("done", cb.checked);

      cb.addEventListener("change", function () {
        li.classList.toggle("done", cb.checked);
        if (cb.checked) done[i] = true;
        else delete done[i];
        save();
        refresh();
        // 让底部的「标记读完」按钮立刻跟着练习完成度重画
        document.dispatchEvent(new Event("as:exercise"));
      });

      // 点标题也能勾：不用去够右上角的小方框，正文文字依然可以正常选中
      if (title) {
        title.classList.add("ex-toggle");
        title.addEventListener("click", function () {
          var sel = window.getSelection();
          if (sel && !sel.isCollapsed) return; // 正在选中文字时不误触
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event("change"));
        });
      }
    });

    reset.addEventListener("click", function () {
      lis.forEach(function (li) {
        var cb = li.querySelector(".ex-cb");
        if (cb && cb.checked) {
          cb.checked = false;
          cb.dispatchEvent(new Event("change"));
        }
      });
    });

    refresh();
  }

  /* ---------- 面包屑 ---------- */

  function buildCrumbs() {
    var article = document.querySelector(".article");
    if (!article || item < 0) return;
    var it = flat[item];
    var c = el("div", "crumbs");
    c.innerHTML =
      '<a href="' +
      abs("index.html") +
      '">首页</a> › ' +
      it.group +
      " › <span>" +
      it.num +
      " " +
      it.title +
      "</span>";
    article.insertBefore(c, article.firstChild);
  }

  /* ---------- 预计阅读时间 ---------- */

  function buildReadTime() {
    var article = document.querySelector(".article");
    if (!article || item < 0) return;
    var h1 = article.querySelector("h1");
    var mins = flat[item].mins;
    if (!h1 || !mins) return;
    var p = el("p", "read-time");
    p.innerHTML = "预计阅读 <strong>" + mins + "</strong> 分钟";
    h1.insertAdjacentElement("afterend", p);
  }

  /* ---------- 上下章 + 标记已读 ---------- */

  function buildPager() {
    var article = document.querySelector(".article");
    if (!article || item < 0) return;
    var readyPrev = null;
    var readyNext = null;
    for (var i = item - 1; i >= 0; i--) {
      if (flat[i].status === "ready" || flat[i].status === "wip") { readyPrev = flat[i]; break; }
    }
    for (var j = item + 1; j < flat.length; j++) {
      if (flat[j].status === "ready" || flat[j].status === "wip") { readyNext = flat[j]; break; }
    }

    var pager = el("div", "pager");
    [readyPrev, readyNext].forEach(function (t, k) {
      if (!t) return;
      var a = el("a", k === 1 ? "next" : "prev");
      var dirTxt = k === 1 ? "下一章 →" : "← 上一章";
      a.innerHTML = '<span class="dir">' + dirTxt + '</span><span class="t">' + t.num + " " + t.title + "</span>";
      if (t.status === "ready") a.href = abs(t.href);
      else {
        a.classList.add("disabled");
        a.title = "本章编写中";
        a.addEventListener("click", function (e) {
          e.preventDefault();
        });
      }
      pager.appendChild(a);
    });
    article.appendChild(pager);

    var mark = el("div", "read-mark");
    mark.id = "read-mark";
    article.appendChild(mark);

    // 标记按钮、复习提示、复制链接都重画：点完立刻能看到状态变化，不用刷新
    function paintMark() {
      var key = stripHref(flat[item].href);
      var on = !!readMap[key];
      var when = doneMap[key];
      var ex = exMeta[key];
      var exAll = ex && ex.total > 0 && ex.done >= ex.total;
      var lastDone = Math.max(when || 0, reviewMap[key] || 0);
      var days = lastDone ? Math.floor((Date.now() - lastDone) / 864e5) : 0;
      var html =
        '<button class="icon-btn' +
        (on ? " done" : exAll ? " ready-cta" : "") +
        '" id="mark-read">' +
        (on
          ? "✓ 已读完" + (when ? "（" + relDay(when) + "）" : "") + " · 点击撤销"
          : exAll
            ? "✓ 练习已完成 · 标记本章读完"
            : "标记本章已读完") +
        "</button>" +
        '<button class="icon-btn copy-page" id="copy-page" type="button">复制本页链接</button>';

      // 读完一周后提醒回看；只链本页真实存在的锚点
      if (on && lastDone && Date.now() - lastDone >= 7 * 864e5) {
        var refs = [];
        if (document.getElementById("pitfalls")) refs.push('<a href="#pitfalls">陷阱</a>');
        if (document.getElementById("cheatsheet")) refs.push('<a href="#cheatsheet">速查表</a>');
        html +=
          '<span class="review-hint"><span class="rh-text">距上次完成已 ' +
          days +
          " 天" +
          (refs.length ? "，建议回看" + refs.join("与") : "") +
          '</span><button type="button" id="review-done">标记已复习</button></span>';
      }
      html += '<span class="footnote">进度只存在你这台机器的浏览器里</span>';
      mark.innerHTML = html;

      mark.querySelector("#mark-read").addEventListener("click", function () {
        readMap[key] = !readMap[key];
        if (!readMap[key]) {
          delete readMap[key];
          delete doneMap[key];
        } else {
          doneMap[key] = Date.now();
          delete reviewMap[key];
        }
        lsSet(LS.read, readMap);
        lsSet(LS.done, doneMap);
        lsSet(LS.review, reviewMap);
        paintMark();
        render();
      });
      var rv = mark.querySelector("#review-done");
      if (rv) {
        rv.addEventListener("click", function () {
          reviewMap[key] = Date.now();
          lsSet(LS.review, reviewMap);
          announce("已标记复习：" + flat[item].num + " " + flat[item].title);
          paintMark();
        });
      }
      mark.querySelector("#copy-page").addEventListener("click", function () {
        var btn = this;
        // 跳过链接本身不作数，其余 hash（某个小节）跟页面一起复制才方便分享
        var url = location.href.replace(/#main$/, "");
        copyText(url).then(function (ok) {
          btn.textContent = ok ? "✓ 链接已复制" : "复制失败";
          btn.classList.toggle("done", ok);
          announce(ok ? "本页链接已复制" : "复制失败");
          setTimeout(function () {
            btn.textContent = "复制本页链接";
            btn.classList.remove("done");
          }, 1600);
        });
      });
    }

    paintMark();
    document.addEventListener("as:exercise", paintMark);

    seenMap[PAGE_ID] = true;
    lsSet(LS.seen, seenMap);
    // 记下「上次读到哪」，供首页进度卡一键回去（只在正文页写，首页不覆盖）
    if (flat[item].status === "ready") {
      lsSet(LS.last, {
        href: flat[item].href,
        num: flat[item].num,
        title: flat[item].title,
        at: Date.now(),
      });
    }
  }

  /* ---------- 首页进度卡 ---------- */

  function fmtMins(m) {
    if (m < 60) return m + " 分钟";
    var h = m / 60;
    return (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10) + " 小时";
  }

  function relDay(ts) {
    var d = Math.floor((Date.now() - ts) / 864e5);
    if (d <= 0) return "今天";
    if (d === 1) return "昨天";
    if (d < 30) return d + " 天前";
    return Math.floor(d / 30) + " 个月前";
  }

  function buildProgressCard() {
    var host = document.getElementById("progress-card");
    if (!host) return;

    var pages = flat.filter(function (it) {
      return it.status === "ready";
    });
    var read = 0;
    var seen = 0;
    var left = 0;
    var exKnown = 0;
    var exAll = 0;
    pages.forEach(function (it) {
      var key = stripHref(it.href);
      if (readMap[key]) read++;
      if (seenMap[key]) seen++;
      if (!readMap[key]) left += it.mins || 0;
      var m = exMeta[key];
      if (m && m.total > 0) {
        exKnown++;
        if (m.done >= m.total) exAll++;
      }
    });
    var total = pages.length;
    var pct = total ? Math.round((read / total) * 100) : 0;
    var first = pages[0];
    var now = Date.now();

    var last = lsGet(LS.last, null);
    if (last && (typeof last !== "object" || !last.href || !last.num || !last.title)) last = null;
    if (
      last &&
      !flat.some(function (it) {
        return it.href === last.href && it.status === "ready";
      })
    )
      last = null;

    // 上次那篇已标记读完的话，「继续阅读」改指向它后面的第一篇未读
    var target = last;
    if (last && readMap[stripHref(last.href)]) {
      var li = -1;
      var j;
      for (j = 0; j < flat.length; j++) if (flat[j].href === last.href) { li = j; break; }
      target = null;
      for (j = li + 1; j < flat.length && !target; j++) {
        if (flat[j].status === "ready" && !readMap[stripHref(flat[j].href)]) target = flat[j];
      }
      for (j = 0; j < flat.length && !target; j++) {
        if (flat[j].status === "ready" && !readMap[stripHref(flat[j].href)]) target = flat[j];
      }
      if (!target) target = last;
    }

    /* 待办三件套：收尾（练完没标读完）→ 练习（差几步）→ 复习（读完超过 7 天） */
    var tasks = [];
    var taskKeys = {};
    pages.forEach(function (it) {
      var key = stripHref(it.href);
      var m = exMeta[key];
      if (!m || !m.total) return;
      if (m.done >= m.total) {
        if (!readMap[key]) {
          tasks.push({
            key: key,
            href: it.href + "#read-mark",
            tag: "收尾",
            text: it.num + " · 练习已完成，标记读完",
            w: -1,
          });
          taskKeys[key] = true;
        }
        return;
      }
      // 没读完也没开始练的章不催，避免变成骚扰
      if (!readMap[key] && !m.done) return;
      tasks.push({
        key: key,
        href: it.href + "#exercise",
        tag: "练习",
        text: it.num + " · 还差 " + (m.total - m.done) + " 步",
        w: readMap[key] ? 0 : 1,
      });
      taskKeys[key] = true;
    });
    tasks.sort(function (a, b) {
      return a.w - b.w;
    });

    var review = [];
    pages.forEach(function (it) {
      var key = stripHref(it.href);
      if (taskKeys[key] || !readMap[key] || !doneMap[key]) return;
      var lastAt = Math.max(doneMap[key], reviewMap[key] || 0);
      if (now - lastAt < 7 * 864e5) return;
      review.push({
        href: it.href + "#pitfalls",
        tag: "复习",
        text: it.num + " · 读完 " + Math.floor((now - lastAt) / 864e5) + " 天",
        at: lastAt,
      });
    });
    review.sort(function (a, b) {
      return a.at - b.at;
    });

    var picked = tasks.slice(0, 2).concat(review.slice(0, 2)).slice(0, 3);
    var loop = picked.length
      ? picked
          .map(function (t) {
            return (
              '<a class="pc-task' +
              (t.tag === "复习" ? " review" : "") +
              '" href="' +
              abs(t.href) +
              '"><b>' +
              t.tag +
              "</b>" +
              t.text +
              "</a>"
            );
          })
          .join("")
      : '<span class="pc-loop-empty">当前没有待办：继续读下一篇，或挑一篇已读的回看。</span>';

    var meta;
    if (!read && !seen) {
      meta = "还没开始 · 全程约 " + fmtMins(left);
    } else {
      meta = "已标记读完 " + read + " 篇";
      if (seen > read) meta += " · 访问过 " + seen + " 篇";
      meta += " · 还剩约 " + fmtMins(left);
      if (exAll) meta += " · 练习全完成 " + exAll + " 章";
    }
    if (last) meta += " · 上次读到 " + last.num + " " + last.title + (last.at ? "（" + relDay(last.at) + "）" : "");

    var actions;
    if (read >= total) {
      actions = '<a class="pc-go" href="' + abs(first.href) + '">全部读完，从头复习 →</a>';
    } else if (last) {
      actions =
        '<a class="pc-go" href="' +
        abs(target.href) +
        '">继续阅读 ' +
        target.num +
        " " +
        target.title +
        ' →</a><a class="pc-alt" href="' +
        abs(first.href) +
        '">从 00 开始</a>';
    } else {
      actions =
        '<a class="pc-go" href="' +
        abs(first.href) +
        '">从 00 学习地图开始 →</a><a class="pc-alt" href="' +
        abs("appendix/source-map.html") +
        '">先看源码地图</a>';
    }

    var dataBox =
      '<details class="pc-data"><summary>进度数据</summary>' +
      '<div class="pc-data-row">' +
      '<button type="button" id="pc-export">导出</button>' +
      '<button type="button" id="pc-import">导入</button>' +
      '<button type="button" id="pc-clear">清空</button>' +
      "</div>" +
      '<input type="file" id="pc-file" accept="application/json,.json" hidden>' +
      '<p class="pc-data-note">导出的是已读、练习、上次阅读与复习时间的 JSON，换机后可导回；不含主题和阅读设置。</p>' +
      '<p class="pc-confirm" id="pc-msg" hidden></p>' +
      "</details>";

    host.innerHTML =
      '<div class="pc-main"><div class="pc-head"><span class="pc-title">' +
      (last ? "继续阅读" : "学习进度") +
      '</span><span class="pc-num">' +
      read +
      " / " +
      total +
      " 篇 · " +
      pct +
      '%</span></div><div class="bar" role="progressbar" aria-label="学习进度" aria-valuemin="0" aria-valuemax="' +
      total +
      '" aria-valuenow="' +
      read +
      '"><i style="width:' +
      pct +
      '%"></i></div><div class="pc-meta">' +
      meta +
      '</div><div class="pc-loop">' +
      loop +
      '</div></div><div class="pc-actions">' +
      actions +
      dataBox +
      "</div>";

    wireProgressData();
  }

  // 首页进度卡里的导出 / 导入 / 清空：全部走内联确认，不弹浏览器对话框
  function wireProgressData() {
    var file = document.getElementById("pc-file");
    var msg = document.getElementById("pc-msg");
    if (!file || !msg) return;

    function clearMsg() {
      msg.hidden = true;
      msg.className = "pc-confirm";
      msg.textContent = "";
    }

    function showMsg(text, kind) {
      msg.className = "pc-confirm" + (kind ? " " + kind : "");
      msg.textContent = text;
      msg.hidden = false;
    }

    function ask(text, yesLabel, fn) {
      msg.className = "pc-confirm";
      msg.innerHTML =
        "<span>" +
        text +
        '</span><button type="button" id="pc-yes">' +
        yesLabel +
        '</button><button type="button" id="pc-no">取消</button>';
      msg.hidden = false;
      var yes = msg.querySelector("#pc-yes");
      yes.addEventListener("click", fn);
      msg.querySelector("#pc-no").addEventListener("click", clearMsg);
      yes.focus();
    }

    function exportData() {
      var pad = function (n) {
        return (n < 10 ? "0" : "") + n;
      };
      var d = new Date();
      var payload = {
        app: "spring-ai-learn",
        v: 1,
        at: d.toISOString(),
        read: readMap,
        done: doneMap,
        review: reviewMap,
        seen: seenMap,
        ex: lsGet(LS.ex, {}),
        exMeta: exMeta,
        last: lsGet(LS.last, null),
      };
      try {
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download =
          "spring-ai-progress-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + ".json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 2000);
        announce("进度已导出");
        showMsg("已导出，文件在浏览器的下载目录。", "ok");
      } catch (e) {
        showMsg("导出失败：当前浏览器不允许下载文件。", "bad");
      }
    }

    document.getElementById("pc-export").addEventListener("click", exportData);
    document.getElementById("pc-import").addEventListener("click", function () {
      clearMsg();
      file.click();
    });
    document.getElementById("pc-clear").addEventListener("click", function () {
      ask("确认清空？已读、练习勾选、上次阅读与复习时间都会删除，不能恢复。", "确认清空", function () {
        [LS.read, LS.done, LS.review, LS.seen, LS.ex, LS.exMeta, LS.last].forEach(function (k) {
          try {
            localStorage.removeItem(k);
          } catch (e) {}
        });
        location.reload();
      });
    });

    file.addEventListener("change", function () {
      var f = file.files && file.files[0];
      file.value = "";
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var data;
        try {
          data = JSON.parse(String(reader.result));
        } catch (e) {
          showMsg("这个文件不是有效的 JSON，未做任何修改。", "bad");
          return;
        }
        if (!data || data.app !== "spring-ai-learn" || data.v !== 1) {
          showMsg("这不是本站导出的进度文件，未做任何修改。", "bad");
          return;
        }
        var n = data.read && typeof data.read === "object" ? Object.keys(data.read).length : 0;
        ask("导入会覆盖当前进度（文件内有 " + n + " 篇已读记录）。", "确认导入", function () {
          var map = {
            read: LS.read,
            done: LS.done,
            review: LS.review,
            seen: LS.seen,
            ex: LS.ex,
            exMeta: LS.exMeta,
          };
          Object.keys(map).forEach(function (k) {
            if (data[k] && typeof data[k] === "object" && !Array.isArray(data[k])) lsSet(map[k], data[k]);
            else {
              try {
                localStorage.removeItem(map[k]);
              } catch (e) {}
            }
          });
          if (data.last && typeof data.last === "object") lsSet(LS.last, data.last);
          location.reload();
        });
      };
      reader.readAsText(f);
    });
  }

  // 旧数据只有「已读」没有时间：补一个时间戳，7 天复习提醒才有依据
  function backfillDone() {
    var changed = false;
    Object.keys(readMap).forEach(function (k) {
      if (readMap[k] && !doneMap[k]) {
        doneMap[k] = Date.now();
        changed = true;
      }
    });
    if (changed) lsSet(LS.done, doneMap);
  }

  /* ---------- 首页卡片 ---------- */

  function buildCards() {
    document.querySelectorAll("[data-cards]").forEach(function (host) {
      var want = host.getAttribute("data-cards"); // 组名 或 all
      var items = flat.filter(function (it) {
        return want === "all" ? true : it.group === want;
      });
      host.innerHTML = "";
      items.forEach(function (it) {
        var a = el("a", "card" + (it.status === "later" ? " soon" : "") + (it.status === "wip" ? " todo" : ""));
        a.innerHTML =
          '<div class="cnum">' +
          it.num +
          "</div>" +
          '<div class="ctitle">' +
          it.title +
          "</div>" +
          '<div class="cdesc">' +
          it.desc +
          "</div>" +
          '<div class="cmeta">' +
          (it.mins ? "<span>约 " + it.mins + " 分钟</span>" : "") +
          (it.needKey ? '<span class="need-key">需要 API Key</span>' : '<span class="no-key">无需 Key</span>') +
          "</div>";
        if (it.status === "ready") {
          a.href = abs(it.href);
        } else {
          a.href = "#";
          a.title = it.status === "later" ? "规划中的章节，尚未开写" : "本章编写中";
          a.addEventListener("click", function (e) {
            e.preventDefault();
          });
        }
        host.appendChild(a);
      });
    });
  }

  /* ---------- 渲染 ---------- */

  function render() {
    readMap = plainObj(lsGet(LS.read, {}));
    var oldNav = document.getElementById("sidebar");
    if (oldNav) oldNav.remove();
    var oldToc = document.querySelector(".toc");
    if (oldToc) oldToc.remove();
    var layout = document.querySelector(".layout");
    if (!layout) {
      var mainEl = document.querySelector("main");
      layout = el("div", "layout");
      mainEl.parentNode.insertBefore(layout, mainEl);
      layout.appendChild(mainEl);
    }
    var nav = buildSidebar();
    layout.insertBefore(nav, layout.firstChild);
    revealCurrentChapter(nav);
    requestAnimationFrame(function () {
      revealCurrentChapter(nav);
    });
    var toc = buildToc();
    if (toc) layout.appendChild(toc);
    // 首页/没有小节的页面上，目录按钮点了也没内容，直接藏掉
    var tb = document.getElementById("toc-toggle");
    if (tb) tb.style.display = toc ? "" : "none";
  }

  function boot() {
    applyPrefs();
    // 页头插在 body 最前面，skip link 必须再插到它前面，否则第一个 Tab 会落在菜单按钮上
    buildHeader();
    initSkipLink();
    render();
    backfillDone();
    enhanceCode();
    initTabs();
    initSrcChips();
    initHeadingAnchors();
    initPitfallAnchors();
    initExercise();
    buildPager();
    buildCrumbs();
    buildReadTime();
    buildCards();
    buildProgressCard();
    initReadProgress();
    if (window.AS_HL) window.AS_HL.highlightAll();

    // 带 # 直接打开时，页头/侧栏是脚本注入的，浏览器的首次定位可能被布局变化打断；
    // 布局稳定后再补一次（瞬时跳，不走 smooth），位置已经对了就不动
    function reanchor() {
      if (!location.hash) return;
      var id = location.hash.slice(1);
      var node = null;
      try {
        node = document.getElementById(decodeURIComponent(id));
      } catch (e) {
        node = document.getElementById(id);
      }
      if (!node) return;
      var top = node.getBoundingClientRect().top;
      if (top >= 60 && top <= 160) return;
      var root = document.documentElement;
      var prev = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      node.scrollIntoView({ block: "start" });
      root.style.scrollBehavior = prev;
    }
    if (location.hash) {
      requestAnimationFrame(function () {
        requestAnimationFrame(reanchor);
      });
      setTimeout(reanchor, 300);
      window.addEventListener("load", reanchor);
    }

    document.addEventListener("keydown", function (e) {
      // 只有焦点确实落在页面本身（没聚焦任何控件）时，方向键才算「上一章/下一章」。
      // 一旦焦点在链接、按钮、输入框或页内 Tab 上，方向键全部留给控件，避免抢键。
      var t = e.target;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (t !== document.body && t !== document.documentElement) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      var idx = e.key === "ArrowLeft" ? item - 1 : item + 1;
      while (idx >= 0 && idx < flat.length) {
        if (flat[idx].status === "ready") {
          window.location.href = abs(flat[idx].href);
          return;
        }
        idx += e.key === "ArrowLeft" ? -1 : 1;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
