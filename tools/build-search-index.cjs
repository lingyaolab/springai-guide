/* 生成站点全文搜索索引：spring-ai-learn/assets/search-index.js（manifest）
 * 以及按 nav 分组拆分的 search-index-NN.js（正文分块）
 *
 * 为什么需要它：nav.js 里的 sections 只有节标题，搜不到报错原文、方法名、
 * 表格里的结论。这里把 nav 里所有 ready 页面的正文按 h2 切段抽成纯文本，供 site.js
 * 在「标题/摘要」匹配不到时兜底。
 *
 * 用法（内容改动后重跑一次即可）：
 *   node tools/build-search-index.cjs
 *
 * 约定：
 *   - 只索引 nav.js 里 status === "ready" 的页面
 *   - 每段文本截断到 7000 字符，避免单节过长把索引撑爆
 *   - 带 id 的 h3 在 h2 内部再切一刀，搜索结果直接落到小节，
 *     而不是每次都丢到整节开头
 *   - 带 id 的 .pitfall（附录 B 的报错卡）单独成段，并从 h2 正文里剪掉，
 *     否则搜报错原文时会被所在 h2 的大段正文抢走
 *   - 输出结构：[{ p: 页面相对路径, n: "12 标题", s: 节锚点, t: 节标题, x: 正文 }]
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "spring-ai-learn");
const OUT = path.join(SITE, "assets", "search-index.js");
const MAX_SECTION_CHARS = 7000;

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(SITE, "assets", "nav.js"), "utf8"), sandbox);
const AS = sandbox.window.AS_SITE;

const flat = [];
AS.groups.forEach((g) => g.items.forEach((it) => flat.push(Object.assign({ group: g.title }, it))));
const groupOrder = AS.groups.map((g) => g.title);
const byGroup = new Map();

const ENTITIES = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&apos;": "'", "&mdash;": "—", "&ndash;": "–", "&hellip;": "…",
  "&rarr;": "→", "&larr;": "←", "&times;": "×", "&middot;": "·",
};

function toText(html) {
  let s = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  s = s.replace(/&[a-z#0-9]+;/gi, (m) => (m in ENTITIES ? ENTITIES[m] : m));
  return s.replace(/\s+/g, " ").trim();
}

// 把 ranges（绝对下标）从 text 里剪掉；text 在原文中的起点是 offset
function cutRanges(text, ranges, offset) {
  let out = "";
  let cur = 0;
  for (const [rs, re] of ranges) {
    const a = Math.max(rs, offset) - offset;
    const b = Math.min(re, offset + text.length) - offset;
    if (b <= cur || a >= text.length || b <= a) continue;
    out += text.slice(cur, a);
    cur = b;
  }
  return out + text.slice(cur);
}

const out = [];
let pages = 0;

for (const it of flat) {
  if (it.status !== "ready") continue;
  const file = path.join(SITE, it.href);
  if (!fs.existsSync(file)) {
    console.warn(`[skip] ${it.href} 不存在`);
    continue;
  }
  let html = fs.readFileSync(file, "utf8");
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/);
  if (article) html = article[1];
  else console.warn(`[warn] ${it.href} 找不到 <article>，退化为整页索引`);

  const headRe = /<h2\b([^>]*)>([\s\S]*?)<\/h2>/g;
  const heads = [];
  let m;
  while ((m = headRe.exec(html))) {
    heads.push({ attrs: m[1], title: toText(m[2]), start: m.index, end: headRe.lastIndex });
  }
  if (!heads.length) {
    console.warn(`[skip] ${it.href} 没有 <h2>，无法切段`);
    continue;
  }
  pages++;

  // 带 id 的报错卡：每条单独成段（s 就是它的 id），并从 h2 正文里剪掉
  const pfRe = /<div class="pitfall"[^>]*\bid="([^"]+)"[^>]*>/g;
  const pfStarts = [];
  let pm;
  while ((pm = pfRe.exec(html))) pfStarts.push({ id: pm[1], start: pm.index });
  const h2Starts = heads.map((h) => h.start);
  const pfRanges = pfStarts.map((p, i) => {
    const nextH2 = h2Starts.find((s) => s > p.start) ?? html.length;
    const nextPf = i + 1 < pfStarts.length ? pfStarts[i + 1].start : html.length;
    return [p.start, Math.min(nextH2, nextPf)];
  });

  // h3 小节：h2 内部再切一刀，结果能直接落到「第 2 步 / 三种 store」这种粒度
  const h3Re = /<h3\b([^>]*)>([\s\S]*?)<\/h3>/g;
  const subs = [];
  let hm;
  while ((hm = h3Re.exec(html))) {
    const id = (hm[1].match(/\bid="([^"]+)"/) || [])[1];
    if (id) subs.push({ id, title: toText(hm[2]), start: hm.index, end: h3Re.lastIndex });
  }

  const push = (sid, title, from, to, kind) => {
    let body = html.slice(from, to);
    if (pfRanges.length) body = cutRanges(body, pfRanges, from);
    let text = toText(body);
    if (text.length > MAX_SECTION_CHARS) text = text.slice(0, MAX_SECTION_CHARS);
    // 空段也留：标题自己就是搜索词，至少能落到这个锚点（x 为空不显示 snippet）
    const row = {
      p: it.href,
      n: it.num + " " + it.title,
      s: sid,
      t: title,
      x: text,
    };
    if (kind) row.k = kind;
    const bucket = byGroup.get(it.group) || [];
    bucket.push(row);
    byGroup.set(it.group, bucket);
  };

  heads.forEach((h, i) => {
    const id = (h.attrs.match(/\bid="([^"]+)"/) || [])[1];
    if (!id) return;
    const secEnd = i + 1 < heads.length ? heads[i + 1].start : html.length;
    const inner = subs.filter((s) => s.start > h.end && s.start < secEnd);
    if (!inner.length) {
      push(id, h.title, h.end, secEnd);
      return;
    }
    // h2 开头到第一个 h3 之前的引言；太短（只有一个过渡句）就不单独成段
    push(id, h.title, h.end, inner[0].start);
    inner.forEach((s, k) => {
      push(s.id, s.title, s.end, k + 1 < inner.length ? inner[k + 1].start : secEnd, "h3");
    });
  });

  pfStarts.forEach((p, i) => {
    const chunk = html.slice(p.start, pfRanges[i][1]);
    const head = chunk.match(/<div class="pf-h">([\s\S]*?)<\/div>/);
    const text = toText(chunk);
    const bucket = byGroup.get(it.group) || [];
    bucket.push({
      p: it.href,
      n: it.num + " " + it.title,
      s: p.id,
      t: head ? toText(head[1]) : "报错条目",
      x: text.slice(0, 1500),
      k: "err",
    });
    byGroup.set(it.group, bucket);
  });
}

const banner =
  "/* 自动生成，勿手改：node tools/build-search-index.cjs（源：各页 h2 之间的正文）。 */\n";

// 按 nav 分组拆块：搜索框首次聚焦时先拿 manifest，再并行加载各块；
// 任何一块先到就先出结果，不必等整个 1 MB 索引下载完。
const ASSETS = path.join(SITE, "assets");
for (const f of fs.readdirSync(ASSETS)) {
  if (/^search-index-\d+\.js$/.test(f)) fs.unlinkSync(path.join(ASSETS, f));
}
const chunks = [];
let chunkBytes = 0;
let seq = 0;
for (const group of groupOrder) {
  const rows = byGroup.get(group);
  if (!rows || !rows.length) continue;
  seq++;
  const name = "search-index-" + String(seq).padStart(2, "0") + ".js";
  const content =
    banner +
    "/* " + group + " */\n" +
    "window.AS_SEARCH_INDEX=(window.AS_SEARCH_INDEX||[]).concat(" +
    JSON.stringify(rows) +
    ");\n";
  fs.writeFileSync(path.join(ASSETS, name), content, "utf8");
  chunkBytes += fs.statSync(path.join(ASSETS, name)).size;
  chunks.push(name);
}
fs.writeFileSync(
  OUT,
  banner + "window.AS_SEARCH_CHUNKS=" + JSON.stringify(chunks) + ";\n",
  "utf8"
);

const totalRows = [...byGroup.values()].reduce((a, b) => a + b.length, 0);
const bytes = chunkBytes + fs.statSync(OUT).size;
const ready = flat.filter((it) => it.status === "ready").length;
console.log(
  `ready 页 ${ready} 个，索引 ${pages} 个，索引段 ${totalRows} 条，` +
    `${chunks.length} 块，共 ${(bytes / 1024).toFixed(0)} KB`
);
if (pages !== ready) console.warn(`[warn] 有 ${ready - pages} 个 ready 页面没进索引，检查上面的 skip/warn`);
console.log(`→ ${path.relative(ROOT, OUT)} + ${chunks.length} 个分块`);
