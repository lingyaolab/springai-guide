/* 站点自检（零依赖，只做静态检查）
 *
 * 用法：
 *   node tools/check-site.cjs            全部静态检查
 *   node tools/check-site.cjs --quiet    只输出失败项与汇总
 *
 * 检查内容：
 *   1. nav.js 里 status=ready 的页面都存在
 *   2. chapters/ 与 appendix/ 下的每个 html 都登记在 nav.js 里
 *   3. nav 里每一节的标题与页面 <h2> 文本、id 完全一致
 *   4. 站内链接（含锚点）都能落地；同一页 id 不重复
 *   5. 每页有 description、og:title，title 全局唯一
 *   6. 首页 data-cards 的分组名与 nav 的 groups 一致
 *   7. 发布入口与元文件齐全（根跳转页 / 404 / robots / .nojekyll / favicon / Pages 工作流）
 *   8. 搜索索引包含全部 ready 页面（内容改动后忘记重建会在这里失败）
 *   9. 正文里的 <span class="src"> 都有 data-src（图例除外）
 *
 * 退出码：0 全过；1 有失败；2 工具本身出错（例如找不到 nav.js）
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "spring-ai-learn");
const ASSETS = path.join(SITE, "assets");
const NAV = path.join(ASSETS, "nav.js");
const INDEX = path.join(ASSETS, "search-index.js");

const quiet = process.argv.includes("--quiet");
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  if (!ok) console.log("FAIL " + name + (detail === undefined ? "" : "  :: " + detail));
  else if (!quiet) console.log("PASS " + name);
}

const ENTITY_MAP = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&rarr;": "→",
  "&times;": "×",
};
function plain(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (m) => (m in ENTITY_MAP ? ENTITY_MAP[m] : m))
    .replace(/\s+/g, " ")
    .trim();
}
const rel = (p) => path.relative(SITE, p).replace(/\\/g, "/");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

/* ---------- 读 nav ---------- */

let SITE_NAV;
try {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(NAV, "utf8"), sandbox);
  SITE_NAV = sandbox.window.AS_SITE;
} catch (e) {
  console.log("FAIL 无法读取 nav.js :: " + e.message);
  process.exit(2);
}

const flat = [];
SITE_NAV.groups.forEach((g) => g.items.forEach((it) => flat.push(Object.assign({ group: g.title }, it))));
const ready = flat.filter((it) => it.status === "ready");
const byHref = new Map(flat.map((it) => [it.href, it]));

/* ---------- 1 & 2：页面与 nav 双向一致 ---------- */

const missing = ready.filter((it) => !fs.existsSync(path.join(SITE, it.href))).map((it) => it.href);
check("ready 章节文件都存在", missing.length === 0, missing.join(", "));

const pages = walk(SITE).filter((p) => path.basename(p) !== "404.html" && path.basename(p) !== "index.html");
const unlisted = pages.map(rel).filter((r) => !byHref.has(r));
check("每个章节页都登记在 nav.js", unlisted.length === 0, unlisted.join(", "));

const laterPages = flat.filter((it) => it.status !== "ready" && fs.existsSync(path.join(SITE, it.href)));
check(
  "未开写章节没有遗留页面",
  laterPages.length === 0,
  laterPages.map((it) => it.href).join(", ")
);

/* ---------- 3：nav sections 与页面 h2 一致 ---------- */

const sectionProblems = [];
const pageH2 = new Map();
for (const it of ready) {
  const file = path.join(SITE, it.href);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, "utf8");
  const heads = [...html.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/g)].map((m) => ({
    id: (m[1].match(/\bid="([^"]+)"/) || [])[1] || "",
    title: plain(m[2]),
  }));
  pageH2.set(it.href, heads);
  const want = it.sections || [];
  if (want.length !== heads.length) {
    sectionProblems.push(`${it.href}：nav ${want.length} 节，页面 ${heads.length} 个 h2`);
  }
  want.forEach(([id, title], i) => {
    const h = heads[i];
    if (!h) return;
    if (h.id !== id) sectionProblems.push(`${it.href} 第 ${i + 1} 节 id：nav=${id}，页面=${h.id || "(空)"}`);
    if (h.title !== title) sectionProblems.push(`${it.href} 第 ${i + 1} 节标题：nav=「${title}」，页面=「${h.title}」`);
  });
}
check("nav 小节与页面 h2 完全一致", sectionProblems.length === 0, sectionProblems.slice(0, 12).join(" | "));

/* ---------- 4：链接与 id ---------- */

const linkProblems = [];
const idProblems = [];
const allPages = walk(SITE);
const idCache = new Map();
for (const file of allPages) {
  const html = fs.readFileSync(file, "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) idProblems.push(`${rel(file)} 重复 id：${[...new Set(dup)].join(", ")}`);
  idCache.set(file, new Set(ids));
}
for (const file of allPages) {
  const html = fs.readFileSync(file, "utf8");
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|tel:|javascript:|data:)/.test(href) || href === "#") continue;
    if (href.startsWith("#")) {
      const id = href.slice(1);
      if (id && !idCache.get(file).has(id)) linkProblems.push(`${rel(file)} → ${href}（本页无此 id）`);
      continue;
    }
    const [rawPath, anchor] = href.split("#");
    const target = path.resolve(path.dirname(file), rawPath);
    if (!fs.existsSync(target)) {
      linkProblems.push(`${rel(file)} → ${href}（文件不存在）`);
      continue;
    }
    if (anchor) {
      const targetIds = idCache.get(target) || new Set([...fs.readFileSync(target, "utf8").matchAll(/\bid="([^"]+)"/g)].map((x) => x[1]));
      if (!targetIds.has(anchor)) linkProblems.push(`${rel(file)} → ${href}（目标页无此 id）`);
    }
  }
}
check("站内链接都能落地", linkProblems.length === 0, linkProblems.slice(0, 12).join(" | "));
check("页面 id 不重复", idProblems.length === 0, idProblems.slice(0, 8).join(" | "));

/* ---------- 5：meta 与 title ---------- */

const metaProblems = [];
const titles = new Map();
for (const file of allPages) {
  const html = fs.readFileSync(file, "utf8");
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  if (!title) metaProblems.push(`${rel(file)} 缺 <title>`);
  else if (titles.has(title.trim())) metaProblems.push(`${rel(file)} 与 ${titles.get(title.trim())} 标题重复`);
  else titles.set(title.trim(), rel(file));
  if (!/<meta\s+name="description"/.test(html)) metaProblems.push(`${rel(file)} 缺 description`);
  if (path.basename(file) !== "404.html" && !/<meta\s+property="og:title"/.test(html)) {
    metaProblems.push(`${rel(file)} 缺 og:title`);
  }
  if (!/<html lang="zh-CN"/.test(html)) metaProblems.push(`${rel(file)} 缺 lang="zh-CN"`);
  if (!/<meta charset="utf-8"/.test(html)) metaProblems.push(`${rel(file)} 缺 charset`);
}
check("head 元信息完整且标题唯一", metaProblems.length === 0, metaProblems.slice(0, 10).join(" | "));

/* ---------- 6：首页分组卡 ---------- */

const home = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const cardGroups = [...home.matchAll(/data-cards="([^"]+)"/g)].map((m) => m[1]);
const navGroups = SITE_NAV.groups.map((g) => g.title);
const badGroups = cardGroups.filter((g) => !navGroups.includes(g));
const unusedGroups = navGroups.filter((g) => !cardGroups.includes(g));
check(
  "首页分组卡与 nav groups 对齐",
  badGroups.length === 0 && unusedGroups.length === 0,
  `多余=[${badGroups}] 未用=[${unusedGroups}]`
);

/* ---------- 7：发布入口与元文件 ---------- */

const required = [
  ["index.html", path.join(SITE, "index.html")],
  ["404.html", path.join(SITE, "404.html")],
  ["robots.txt", path.join(SITE, "robots.txt")],
  [".nojekyll", path.join(SITE, ".nojekyll")],
  ["assets/favicon.svg", path.join(ASSETS, "favicon.svg")],
  ["仓库根跳转页 index.html", path.join(ROOT, "index.html")],
  ["Pages 工作流", path.join(ROOT, ".github/workflows/deploy-pages.yml")],
];
const missingFiles = required.filter(([, p]) => !fs.existsSync(p)).map(([n]) => n);
check("发布入口与元文件齐全", missingFiles.length === 0, missingFiles.join(", "));

const rootHome = fs.existsSync(path.join(ROOT, "index.html")) ? fs.readFileSync(path.join(ROOT, "index.html"), "utf8") : "";
check("根跳转页指向 spring-ai-learn/", /spring-ai-learn\/index\.html/.test(rootHome));

/* ---------- 8：搜索索引 ---------- */

if (!fs.existsSync(INDEX)) {
  check("搜索索引存在", false, "缺少 assets/search-index.js，先跑 node tools/build-search-index.cjs");
} else {
  const chunks = fs.readdirSync(ASSETS).filter((f) => /^search-index-\d+\.js$/.test(f));
  const blob = [INDEX, ...chunks.map((f) => path.join(ASSETS, f))].map((f) => fs.readFileSync(f, "utf8")).join("\n");
  const absent = ready.filter((it) => !blob.includes('"p":"' + it.href + '"')).map((it) => it.href);
  check("搜索索引覆盖全部 ready 章节", absent.length === 0, absent.join(", "));
}

/* ---------- 9：出处 chip ---------- */

const chipProblems = [];
for (const it of ready) {
  const html = fs.readFileSync(path.join(SITE, it.href), "utf8");
  for (const m of html.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span\s*>/g)) {
    if (!/\bclass="src"/.test(m[1])) continue;
    if (/[\u4e00-\u9fa5]/.test(plain(m[2]))) continue; // 图例（文件名:行号）不是真实出处
    if (!/data-src="/.test(m[1])) chipProblems.push(`${it.href} :: ${plain(m[2]) || "(空)"}`);
  }
}
check("出处胶囊都带 data-src", chipProblems.length === 0, chipProblems.slice(0, 8).join(" | "));

/* ---------- 汇总 ---------- */

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
if (failed.length) {
  console.log("失败项：");
  failed.forEach((f) => console.log("  - " + f.name + (f.detail ? " :: " + f.detail : "")));
  process.exit(1);
}
console.log("结论：静态检查全部通过");
