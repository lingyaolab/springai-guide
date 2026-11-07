# 部署说明

站点是零构建的纯静态文件，**发布物就是 `spring-ai-learn/` 这一个目录**，不需要 npm、不需要编译。

## 1. 发布物清单

| 必须发布 | 说明 |
| --- | --- |
| `spring-ai-learn/index.html` | 站点入口 |
| `spring-ai-learn/404.html` | 站内 404（自包含样式，任意路径深度可用） |
| `spring-ai-learn/.nojekyll` | 告诉 GitHub Pages 跳过 Jekyll |
| `spring-ai-learn/robots.txt` | 允许抓取 |
| `spring-ai-learn/assets/` | 样式、脚本、搜索索引、favicon |
| `spring-ai-learn/chapters/`、`appendix/` | 全部正文 |

**不要发布**：

- `spring-ai-2.0.2/`（86 MB 上游源码副本，只在本地核对 `file:line` 用）
- `tools/`（自检脚本，Node 环境使用，不是站点资源）
- 仓库根 `index.html` 只是本地/整仓部署时的跳转入口；用下面的平台配置时不需要它

## 2. 本地预览

```powershell
# 方式一：直接双击（file:// 下全部功能可用）
spring-ai-learn\index.html

# 方式二：起一个静态服务器，行为与线上一致
python -m http.server 8080
# 打开 http://localhost:8080/spring-ai-learn/
```

## 3. GitHub Pages（推荐，仓库已带工作流）

工作流：`.github/workflows/deploy-pages.yml`

1. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**
2. 在 Actions 里手动 `Run workflow`（当前工作流只在手动触发；Pages 未启用时不会随 push 自动运行）
3. 工作流依次执行：
   - `node tools/build-search-index.cjs` 重建搜索索引
   - `node tools/check-site.cjs --quiet` 静态检查（任何一项失败会阻止发布）
   - 上传 `spring-ai-learn/` 作为 Pages artifact
   - 部署到 `https://<user>.github.io/<repo>/`

站点内部全部使用相对链接，部署在子路径下不需要改任何配置。

## 4. Vercel / Netlify / Cloudflare Pages

三者配置相同：

| 配置项 | 值 |
| --- | --- |
| Root / Base directory | `spring-ai-learn` |
| Build command | 留空 |
| Output directory | `.`（或留空，视平台提示） |

`404.html` 会作为站内 404 自动生效。

## 5. 自建服务器（nginx）

```nginx
server {
  listen 80;
  server_name learn.example.com;
  root /srv/spring-ai-learn;
  index index.html;

  location / {
    try_files $uri $uri/ =404;
  }
  error_page 404 /404.html;

  gzip on;
  gzip_types text/html text/css application/javascript image/svg+xml;
}
```

静态资源可加长缓存，HTML 建议 `no-cache`（内容更新后即时生效）：

```nginx
location ~* \.(css|js|svg)$ { add_header Cache-Control "public, max-age=86400"; }
```

流式示例如果也部署在同一台机器上，记得给 SSE 关掉代理缓冲（`proxy_buffering off;`），否则用户要等全部生成完才看到内容。

## 6. 自定义域名（GitHub Pages）

1. 在 `spring-ai-learn/` 新建 `CNAME` 文件，内容为域名（如 `learn.example.com`）
2. DNS 添加 `CNAME` 记录指向 `<user>.github.io`
3. 在仓库 Settings → Pages 填入同一个域名并开启 HTTPS

## 7. 发布前检查清单

```powershell
node tools/build-search-index.cjs   # 正文改过就必须重建
node tools/check-site.cjs           # 链接、锚点、nav 一致性、meta、发布物
node tools/check-sources.cjs        # 每条出处是否都能在 2.0.2 源码里定位（含路径大小写）
```

再手测三件事：

- 手机宽度（390px）下：侧栏抽屉、搜索层、阅读设置、目录抽屉
- 首页进度卡：导出 → 导入 → 清空
- 随便点开一章，确认顶部进度条与底部「标记本章已读完」正常

## 8. 更新流程

1. 改正文（新增章节时同时改 `spring-ai-learn/assets/nav.js`）
2. `node tools/build-search-index.cjs`
3. `node tools/check-site.cjs`、`node tools/check-sources.cjs`
4. 在 `CHANGELOG.md` 记一笔（站点内首页「更新记录」同步）
5. 提交并 push；启用 Pages 后，在 Actions 里手动运行 `Deploy site`

## 9. 版本号约定

- `spring-ai-learn/assets/nav.js` 里的 `version` 是**所讲解的框架版本**（显示在页头，当前 `2.0.2`），不要和站点版本混用
- 站点版本记录在 `CHANGELOG.md` 与首页「更新记录」里
