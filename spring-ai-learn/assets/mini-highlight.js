/* mini-highlight.js —— 自带极简语法高亮，不依赖 CDN，离线可看。
 * 支持 java / xml / bash / json / properties / text。
 * 只认 <pre data-lang="..."> 或 <pre><code class="language-...">。
 * 任一环节出错就保持原文不动（降级为纯文本代码块）。
 */
(function () {
  "use strict";

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function span(cls, text) {
    return '<span class="tk-' + cls + '">' + esc(text) + "</span>";
  }

  // 按顺序尝试各分支，命中即输出对应 token；未命中的部分原样输出。
  // 规则里的 ^ 在编译时换成 sticky(y) 匹配，避免逐字符 slice 造成 O(n^2)。
  function compile(rules) {
    rules.forEach(function (r) {
      if (!r._re) {
        r._re = new RegExp(r.re.source.replace(/^\^/, ""), "y");
      }
    });
    return rules;
  }

  function scan(src, rules) {
    var out = "";
    var i = 0;
    while (i < src.length) {
      var matched = false;
      for (var r = 0; r < rules.length; r++) {
        var rule = rules[r];
        rule._re.lastIndex = i;
        var m = rule._re.exec(src);
        if (m && m[0].length > 0) {
          out += rule.render ? rule.render(m) : span(rule.cls, m[0]);
          i += m[0].length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        out += esc(src[i]);
        i++;
      }
    }
    return out;
  }

  var JAVA_KW =
    "abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|record|return|sealed|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|var|void|volatile|while|yield|true|false|null";

  var LANGS = {
    java: [
      { re: /^\/\*[\s\S]*?\*\//, cls: "c" },
      { re: /^\/\/[^\n]*/, cls: "c" },
      { re: /^"""[\s\S]*?"""/, cls: "s" },
      { re: /^"(?:[^"\\\n]|\\.)*"/, cls: "s" },
      { re: /^'(?:[^'\\\n]|\\.)*'/, cls: "s" },
      { re: /^@[A-Za-z_]\w*/, cls: "a" },
      { re: /^\b\d[\d_]*(?:\.\d[\d_]*)?(?:[lLfFdD])?\b/, cls: "n" },
      { re: new RegExp("^\\b(?:" + JAVA_KW + ")\\b"), cls: "k" },
      {
        re: /^[A-Za-z_$][\w$]*(?=\s*\()/,
        render: function (m) {
          return span("f", m[0]);
        },
      },
      { re: /^[A-Z][A-Za-z0-9_]*/, cls: "t" },
      { re: /^[a-z][\w$]*(?=\.)/, render: function (m) { return span("x", m[0]); } },
      { re: /^[{}()\[\];,.]/, render: function (m) { return span("p", m[0]); } },
      { re: /^[=+\-*/%<>!&|?:]+/, render: function (m) { return span("p", m[0]); } },
    ],
    bash: [
      { re: /^#[^\n]*/, cls: "c" },
      { re: /^"(?:[^"\\]|\\.)*"/, cls: "s" },
      { re: /^'(?:[^'])*'/, cls: "s" },
      { re: /^\$\{?[A-Za-z_][\w]*\}?/, cls: "n" },
      {
        re: /^\b(?:export|set|cd|echo|mvn|java|gradle|curl|source|if|then|fi|for|do|done|while|cat|grep|chmod|sudo|git|docker|kubectl|npm|node)\b/,
        cls: "k",
      },
      { re: /^--?[\w-]+/, cls: "a" },
      { re: /^\/[\w./-]+/, render: function (m) { return span("x", m[0]); } },
      { re: /^\d+(\.\d+)+/, cls: "n" },
    ],
    json: [
      { re: /^"(?:[^"\\]|\\.)*"(?=\s*:)/, cls: "t" },
      { re: /^"(?:[^"\\]|\\.)*"/, cls: "s" },
      { re: /^\b(?:true|false|null)\b/, cls: "k" },
      { re: /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, cls: "n" },
      { re: /^[{}\[\],:]/, render: function (m) { return span("p", m[0]); } },
    ],
    properties: [
      { re: /^#[^\n]*/, cls: "c" },
      { re: /^[A-Za-z][\w.\-]*(?==)/, cls: "t" },
      { re: /^=.*/, render: function (m) { return span("s", m[0]); } },
      { re: /^\$\{[^}]*\}/, cls: "n" },
    ],
    xml: [
      { re: /^<!--[\s\S]*?-->/, cls: "c" },
      { re: /^<\?[\s\S]*?\?>/, cls: "g" },
      { re: /^<!\[CDATA\[[\s\S]*?\]\]>/, cls: "s" },
      {
        re: /^<\/?[\w:.-]+(\s+[^>]*?)?\/?>/,
        render: function (m) {
          return m[0]
            .replace(/^<\/?[\w:.-]+/, function (s) { return span("k", s); })
            .replace(/[\w:.-]+(?==)/g, function (s) { return span("a", s); })
            .replace(/"[^"]*"/g, function (s) { return span("s", s); })
            .replace(/\/?>/g, function (s) { return span("k", s); });
        },
      },
    ],
  };

  // xml 的内层已经产出 span，不能再转义；scan() 会对已生成的标签二次转义，
  // 因此 xml 走独立的整块处理路径。
  //
  // 注意：不能对「已经插入 span 的 HTML」再做属性正则替换——那样会把
  // 生成的 <span class="tk-k"> 里的 class= 也当成属性，输出可见的 class="tk-k">。
  // 这里改为逐个 token 渲染，标签文本先分段再转义。
  function renderXmlTag(tag) {
    var out = "";
    var i = 0;
    var m;

    if (tag.slice(0, 2) === "</") {
      out += span("k", "</");
      i = 2;
    } else {
      out += span("k", "<");
      i = 1;
    }

    m = /^[\w:.-]+/.exec(tag.slice(i));
    if (m) {
      out += span("k", m[0]);
      i += m[0].length;
    }

    while (i < tag.length) {
      var rest = tag.slice(i);
      if (/^\s+/.test(rest)) {
        m = /^\s+/.exec(rest);
        out += m[0];
        i += m[0].length;
        continue;
      }
      if (/^\/?>/.test(rest)) {
        m = /^\/?>/.exec(rest);
        out += span("k", m[0]);
        i += m[0].length;
        continue;
      }
      m = /^([\w:.-]+)(=)/.exec(rest);
      if (m) {
        out += span("a", m[1]) + "=";
        i += m[0].length;
        continue;
      }
      m = /^"[^"]*"|^'[^']*'/.exec(rest);
      if (m) {
        out += span("s", m[0]);
        i += m[0].length;
        continue;
      }
      out += esc(rest[0]);
      i++;
    }
    return out;
  }

  function highlightXml(src) {
    var out = "";
    var i = 0;
    while (i < src.length) {
      var rest = src.slice(i);
      if (/^</.test(rest)) {
        var m = /^<!--[\s\S]*?-->|^<!\[CDATA\[[\s\S]*?\]\]>|^<\?[\s\S]*?\?>|^<\/?[\w:.-]+(?:\s+[^>]*?)?\/?>/.exec(rest);
        if (m) {
          var tag = m[0];
          if (/^<!--/.test(tag)) {
            out += span("c", tag);
          } else if (/^<!\[CDATA\[/.test(tag)) {
            out += span("s", tag);
          } else if (/^<\?/.test(tag)) {
            out += span("g", tag);
          } else {
            out += renderXmlTag(tag);
          }
          i += tag.length;
          continue;
        }
      }
      if (/^\s+/.test(rest)) {
        var w = /^\s+/.exec(rest)[0];
        out += w;
        i += w.length;
        continue;
      }
      var txt = /^[^<]+/.exec(rest);
      if (!txt) {
        out += esc(rest[0]);
        i++;
        continue;
      }
      out += esc(txt[0]);
      i += txt[0].length;
    }
    return out;
  }

  function langOf(pre, code) {
    var d = pre.getAttribute("data-lang");
    if (d) return d;
    var m = (code.className || "").match(/language-([\w-]+)/);
    return m ? m[1] : null;
  }

  function highlightAll() {
    var pres = document.querySelectorAll("pre");
    Array.prototype.forEach.call(pres, function (pre) {
      var code = pre.querySelector("code") || pre;
      if (code.getAttribute("data-hl") === "1") return;
      var lang = langOf(pre, code);
      if (!lang) return;
      try {
        var src = code.textContent;
        if (src.length > 40000) return;
        var html;
        if (lang === "xml") {
          html = highlightXml(src);
        } else {
          var rules = LANGS[lang];
          if (!rules) return;
          html = scan(src, compile(rules));
        }
        code.innerHTML = html;
        code.setAttribute("data-hl", "1");
      } catch (e) {
        /* 出错就保留原文，绝不破坏内容 */
      }
    });
  }

  window.AS_HL = { highlightAll: highlightAll };
})();
