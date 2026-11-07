# Spring AI 2.0.2 学习站 · 仓库入口

这是学习站的源码仓库。站点本体在 [`spring-ai-learn/`](spring-ai-learn/)，可以直接当静态网站部署。

- **本地看站**：双击 [`spring-ai-learn/index.html`](spring-ai-learn/index.html)，或在仓库根执行 `python -m http.server 8080` 后访问 <http://localhost:8080/spring-ai-learn/>
- **部署**：见 [DEPLOY.md](DEPLOY.md)（GitHub Pages / Vercel / Netlify / 自建服务器）
- **更新记录**：见 [CHANGELOG.md](CHANGELOG.md)
- **自检**：`node tools/check-site.cjs` 与 `node tools/check-sources.cjs`

## 目录结构

```
spring-ai-learn/           站点本体（发布时把这个目录作为站点根）
├── index.html             首页（学习进度、章节入口、更新记录）
├── 404.html               站内 404（自包含样式，任意深度可用）
├── robots.txt
├── chapters/              第 00–16 章 + 00A 信息流实验室
├── appendix/              附录 A–E
└── assets/                base.css / site.js / nav.js / search-index.js / flow-demo.* / favicon.svg

tools/                     零依赖 Node 脚本
├── check-site.cjs         静态检查（链接、锚点、nav 一致性、meta、发布物）
├── check-sources.cjs      校验每处 file:line 能否在 2.0.2 源码里定位，并检查路径大小写
└── build-search-index.cjs 从各页正文生成全文搜索索引

spring-ai-2.0.2/           上游源码副本（仅本地核对出处用，86 MB，不入库）
```

## 内容约定

- 全部内容对应 **Spring AI 2.0.2** + **Spring Boot 4.1.x** + **JDK 17**，默认模型 **DeepSeek**。
- 页面上的每个版本号、默认值、配置前缀、抛错点都带 `file:line` 出处标签。
- 站点零构建、不联网、不依赖 CDN，`file://` 直接打开即可阅读。
- 章节清单一律改 `spring-ai-learn/assets/nav.js`；正文改动后重跑 `node tools/build-search-index.cjs`。

## 拉取上游源码（本地核对出处）

```powershell
git clone --depth 1 --branch v2.0.2 https://github.com/spring-projects/spring-ai.git spring-ai-2.0.2
```

`spring-ai-2.0.2/` 已在 `.gitignore` 中忽略，不要把整份源码提交进本站仓库。

## 来源与许可

教程基于 [spring-ai](https://github.com/spring-projects/spring-ai) 2.0.2 的源码与官方文档整理，引用部分遵循上游 Apache-2.0 许可。
