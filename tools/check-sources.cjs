/* 全站源码出处核验：每个 <span class="src" data-src="path:line"> 是否真的对得上 2.0.2 源码
 *
 * 用法：
 *   node tools/check-sources.cjs              硬错误（缺文件 / 行号越界 / data-src 格式错）
 *   node tools/check-sources.cjs --strict     空白行、纯收尾符号也判失败
 *   node tools/check-sources.cjs --context    额外跑「上下文标识符」启发式（只提示，不判失败）
 *   node tools/check-sources.cjs --limit=50   每类问题最多列 50 条
 *
 * 检查内容：
 *   1. 路径能在 spring-ai-2.0.2/ 下找到（找不到再退回仓库根目录）
 *   2. 行号 / 行号区间不越界
 *   3. 可见文字里的行号与 data-src 的起行一致
 *   4. 引用起点不是空行、不是孤立的 } / }); / ] 等收尾符号
 *   5. 路径大小写与磁盘真实文件名完全一致（Windows 也不放过）
 *   6. （--context）chip 前最近的 <code> 标识符是否出现在引用行 ±15 行内
 *
 * 注意：图例里的 <span class="src">文件名:行号</span> 只是样式示例，没有 data-src，
 * 按约定跳过，不算问题。
 *
 * 退出码：0 无硬错误；1 有硬错误（或 --strict 下有空白/收尾行）；2 工具本身出错
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "spring-ai-learn");
const SRC = path.join(ROOT, "spring-ai-2.0.2");

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const contextMode = args.includes("--context");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Math.max(1, parseInt(limitArg.split("=")[1], 10) || 30) : 30;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

const ENTITIES = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&hellip;": "…",
  "&rarr;": "→",
};

function text(html) {
  let s = html.replace(/<[^>]+>/g, " ");
  s = s.replace(/&[a-z#0-9]+;/gi, (m) => (m in ENTITIES ? ENTITIES[m] : m));
  return s.replace(/\s+/g, " ").trim();
}

const STOP = new Set(
  (
    "public private protected static final abstract synchronized native transient volatile " +
    "class interface enum record extends implements return throws throw new this super " +
    "import package void true false null var String Integer Long Double Float Boolean Object " +
    "List Map Set Optional Mono Flux Collections Arrays System Out"
  ).split(" ")
);

const fileCache = new Map();
function linesOf(file) {
  if (!fileCache.has(file)) fileCache.set(file, fs.readFileSync(file, "utf8").split(/\r?\n/));
  return fileCache.get(file);
}

function resolveSource(p) {
  const clean = p.replace(/^\.\//, "");
  const a = path.join(SRC, clean);
  if (fs.existsSync(a)) return a;
  const b = path.join(ROOT, clean);
  if (fs.existsSync(b)) return b;
  return null;
}

/* Windows 的 existsSync 不区分大小写；这里逐段对照真实目录名，
 * 避免 AGENTS.md / agents.md 这类问题在 Windows 上被放过、到 Linux CI 才炸。 */
function exactWalk(base, relPath) {
  let dir = base;
  for (const part of relPath.split("/").filter(Boolean)) {
    if (part === ".") continue;
    if (!fs.existsSync(dir)) return false;
    const names = fs.readdirSync(dir);
    if (!names.includes(part)) return false;
    dir = path.join(dir, part);
  }
  return fs.existsSync(dir);
}

function exactPathExists(p) {
  const clean = p.replace(/^\.\//, "");
  if (clean.startsWith("spring-ai-2.0.2/")) {
    return exactWalk(ROOT, clean);
  }
  return exactWalk(SRC, clean) || exactWalk(ROOT, clean);
}

/* ---------- 收集 chip ---------- */

const chips = [];
for (const f of walk(SITE).sort()) {
  const html = fs.readFileSync(f, "utf8");
  // 属性可能被排版拆到下一行（> 单独一行），所以用 [^>]* 跨行匹配
  const re = /<span\b([^>]*)>([\s\S]*?)<\/span\s*>/g;
  let m;
  while ((m = re.exec(html))) {
    if (!/\bclass="src"/.test(m[1])) continue;
    const dm = m[1].match(/data-src="([^"]+)"/);
    chips.push({
      page: path.relative(SITE, f).replace(/\\/g, "/"),
      at: m.index,
      html,
      visible: text(m[2]),
      raw: dm ? dm[1] : null,
    });
  }
}

/* ---------- 逐条核验 ---------- */

let missingFile = 0;
let badRange = 0;
let badFormat = 0;
let noRaw = 0;
const mismatch = [];
const reviews = [];
const caseSeen = new Set();
const caseIssues = [];

for (const c of chips) {
  if (!c.raw) {
    noRaw++;
    // 图例（文件名:行号）不是真实引用；能解析出英文路径的才回退
    if (!/^[\w./-]+:\d+/.test(c.visible)) continue;
    c.raw = c.visible;
  }

  const pm = c.raw.match(/^(.*?):(\d+)(?:-(\d+))?$/);
  if (!pm) {
    badFormat++;
    reviews.push({ type: "格式", page: c.page, raw: c.raw, msg: "不是 path:line 形式" });
    continue;
  }
  const [, p, sStr, eStr] = pm;
  const start = Number(sStr);
  const end = eStr ? Number(eStr) : start;

  const file = resolveSource(p);
  if (!file) {
    missingFile++;
    reviews.push({ type: "缺文件", page: c.page, raw: c.raw, msg: "源码里找不到 " + p });
    continue;
  }
  if (!caseSeen.has(p)) {
    caseSeen.add(p);
    if (!exactPathExists(p)) caseIssues.push(p);
  }

  const lines = linesOf(file);
  if (start < 1 || start > lines.length || end < start || end > lines.length) {
    badRange++;
    reviews.push({
      type: "行号",
      page: c.page,
      raw: c.raw,
      msg:
        "文件共 " + lines.length + " 行，" +
        (end < start ? "区间倒置 " + start + "-" + end : "引用 " + start + (end !== start ? "-" + end : "") + " 越界"),
    });
    continue;
  }

  // 可见文字里的起行应与 data-src 一致（排除 :2504-2511 这种只写行号的写法）
  const vm = c.visible.match(/:(\d+)(?:-(\d+))?$/);
  if (vm && c.visible.length <= 48 && Number(vm[1]) !== start) {
    mismatch.push(c.page + " :: 显示 " + c.visible + "，data-src 是 " + c.raw);
  }

  // 起点是否是空行 / 纯收尾符号
  const lineText = (lines[start - 1] || "").trim();
  if (!lineText) {
    reviews.push({ type: "空行", page: c.page, raw: c.raw, msg: "第 " + start + " 行是空行" });
  } else if (/^[})\];]+;?$/.test(lineText) || lineText === "*/") {
    reviews.push({ type: "收尾行", page: c.page, raw: c.raw, msg: "第 " + start + " 行是「" + lineText + "」" });
  }

  if (!contextMode || !file.endsWith(".java")) continue;

  // 启发式：chip 前最近一个 <code> 的最后一个标识符，是否出现在引用行附近
  const before = c.html.slice(Math.max(0, c.at - 260), c.at);
  if (/<\/(td|p|li|div|tr|table)>/i.test(before)) continue; // 跨块就不再猜
  const codes = [...before.matchAll(/<code>([\s\S]*?)<\/code>/g)];
  if (!codes.length) continue;
  const last = codes[codes.length - 1];
  const code = text(last[1]);
  if (/[./]|\/\/|:#/.test(code)) continue; // 文件名 / 路径 / URL
  const gap = text(before.slice(last.index + last[0].length)).replace(/\s/g, "");
  if (gap.length > 24) continue; // 中间隔了半句话，标识符多半不属于这个 chip
  const tokens = (code.match(/[A-Za-z_$][\w$]{3,}/g) || []).filter((t) => !STOP.has(t));
  if (!tokens.length) continue;
  const token = tokens[tokens.length - 1];
  const from = Math.max(0, start - 16);
  const to = Math.min(lines.length, Math.min(end, start + 80) + 6);
  if (!lines.slice(from, to).join("\n").includes(token)) {
    reviews.push({
      type: "上下文",
      page: c.page,
      raw: c.raw,
      msg: "前文代码「" + (code.length > 32 ? code.slice(0, 32) + "…" : code) + "」，附近未出现 " + token,
    });
  }
}

/* ---------- 汇总 ---------- */

const byType = {};
for (const r of reviews) byType[r.type] = (byType[r.type] || 0) + 1;
const blankLike = (byType["空行"] || 0) + (byType["收尾行"] || 0);

console.log(
  "出处 " + chips.length + " 条：" +
    "缺文件 " + missingFile +
    "，行号越界 " + badRange +
    "，格式错误 " + badFormat +
    "，显示行号不一致 " + mismatch.length +
    "，大小写不符 " + caseIssues.length +
    "，空白/收尾行 " + blankLike +
    (contextMode ? "，上下文可疑 " + (byType["上下文"] || 0) : "") +
    (noRaw ? "（" + noRaw + " 条图例无 data-src，已跳过）" : "")
);

if (mismatch.length) {
  console.log("\n显示行号不一致：");
  mismatch.slice(0, LIMIT).forEach((v) => console.log("  " + v));
}

if (caseIssues.length) {
  console.log("\n大小写不符：");
  caseIssues.slice(0, LIMIT).forEach((v) => console.log("  " + v));
}

for (const type of ["格式", "缺文件", "行号", "空行", "收尾行"]) {
  const list = reviews.filter((r) => r.type === type);
  if (!list.length) continue;
  console.log("\n[" + type + "] " + list.length + " 条");
  list.slice(0, LIMIT).forEach((r) => console.log("  " + r.page + " :: " + r.raw + " :: " + r.msg));
}

const ctx = reviews.filter((r) => r.type === "上下文");
if (ctx.length) {
  console.log("\n[上下文] " + ctx.length + " 条（--context 启发式，仅提示）");
  ctx.slice(0, LIMIT).forEach((r) => console.log("  " + r.page + " :: " + r.raw + " :: " + r.msg));
}

const hard = missingFile + badRange + badFormat + caseIssues.length;
if (hard || (strict && blankLike)) {
  console.log("\n结论：有 " + hard + " 条硬错误" + (strict && blankLike ? "，" + blankLike + " 条空白/收尾行" : ""));
  process.exit(1);
}
console.log("\n结论：全部出处可定位");
