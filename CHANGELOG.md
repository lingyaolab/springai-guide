# 更新记录

站点版本与所讲解的框架版本分开记：框架版本固定在 **Spring AI 2.0.2**，站点版本见下。

## v1.3.0 — 2026-11-07

06 与 15 章教程化巡检：补上「先跑通、再解释、可验收」的入口。

- **06 Advisor 机制**：新增「最小可跑：给 ChatClient 加一个日志 Advisor」。
  先用 `SimpleLoggerAdvisor` 跑通，再解释 `order` 与内外层；不再一上来就是顺序表。
- **15 综合案例**：新增「先说为什么：综合案例不是把所有组件都接上」，
  用表格说明 RAG、工具、记忆、流式、降级各自的加入时机；
  新增「最小可跑：先跑通一条问答闭环」，按 M1 同步问答 → M2 入库+检索 →
  M3 记忆+工具 → M4 流式+引用 → M5 降级+评测逐段验收。
- **其余章节巡检结论**：01–05、07–14、16 已具备 goals / why / 最小示例 /
  常见错误 / 自检 / 练习，未发现需要整体重构的结构缺失；参数表保留作为参考。
- **校验**：搜索索引 283 段，出处 315 条全部可定位，`check-site` 12/12 通过，
  26 个页面浏览器巡检无 console 错误。

## v1.2.0 — 2026-11-07

对照 Spring AI 2.0.2 源码做全站复核，并补一个可播放的信息流实验室。

- 原有 22 页 + 附录逐条回源，修正源码语义与页面表述不一致的地方：
  - 01 / 02 / 03：`spring.ai.deepseek.chat.api-key` 有效并覆盖连接级 key；`.options.model` 仍兼容但已弃用；
    `base-url` 有默认值；`entity` 是 6 个重载；结构化输出 Advisor 位于工具循环内侧；`call()` / `stream()`
    与模板门控引用拆到准确行号。
  - 04 / 05 / 06 / 07：`Flux.timeout` 是空闲超时，总时长用 `take(...)`；流式取消时 user 消息已写入记忆；
    `MessageWindowChatMemory` 的裁剪数量按总数算；同 order Advisor 执行顺序不保证；`request.context()`
    是可变快照；`QuestionAnswerAdvisor` 用最后一条 user 消息检索并替换其文本。
  - 08 / 09 / 10 / 11：`FilterExpressionBuilder` 示例改为 `b.and(b.eq(...), b.gte(...))`；
    `MethodToolCallbackProvider` 用 builder；多查询默认含原问题共 4 路；JDBC 记忆会过滤工具消息；
    MCP stdio 前缀引用修正。
  - 12 / 13 / 14 / 15 / 16：MCP 协议默认行为、`@McpTool` 提示注解、`@McpArg`、非 public 方法；
    ChatClient 观测名；`Document` 构造器；`Flux` 总时长；capstone 切分后重建 id；评测中空
    `relevantIds` 的统计口径；超时/重试引用。
  - 附录 A–E：RAG Advisor order 方向、`ToolAdvisor` 自动注册跳过规则、Boot 4 与 BOM 同步升级、
    `DefaultChatClient` 引用。
- 新增 **00A ChatClient 信息流实验室**：L1 最小调用 9 节点、L2 工程化 14 节点、L3 生产化 22 节点，
  可播放、可单步、可回跳章节，零依赖。
- 搜索索引把章节编号纳入页面与小节的匹配文本，输入 `02`、`16` 可直接定位。
- 出处总数更新为 313 条；`check-site` 与 `check-sources --strict` 全部通过。

## v1.1.2 — 2026-11-06

修复 XML 代码块高亮把 `class="tk-k"` 渲染成可见文本的问题。

- 原因：`mini-highlight.js` 在生成 `<span class="tk-k">` 之后，又对整段 HTML 跑了一次属性正则，
  把生成标签里的 `class=` 也当成 XML 属性，输出了嵌套错误的标记。
- 修复：XML 标签改为逐 token 渲染（`<` / 标签名 / 属性 / 值 / `>` 分别处理），不再对已生成的 HTML 二次替换；
  顺带补上 CDATA 分支。
- 验证：01、07、11、15 章的 XML 块以及全部代码块，可见文本中不再出现 `class="tk-` 或 `</span>`。

## v1.1.1 — 2026-11-06

全站勘误：把逐条回源时发现的不准确表述改掉。

- 第 03 章：ST 模板的花括号转义是 `\{` / `\}`，不是 `{{` / `}}`；变量缺失抛的是
  `IllegalStateException`（`Not all variables were replaced...`），不是「template variable not found」。
- 第 14 章 / 附录 C：`spring.ai.retry.max-attempts` 实际传给 `RetryPolicy.maxRetries`，是「重试次数」，
  加首次共 11 次请求；重试异常还包括 `ResourceAccessException`；最坏等待约 22 分钟。
- 第 09 章：`allowEmptyContext=false` 不会跳过模型，而是换成「超出知识库范围」的固定提示再调用。
- 第 04 章 / 附录 B：`SseEmitter` 本身没有固定 30 秒默认值，是继承 Servlet 容器的异步超时（Tomcat 常见 30 秒）。
- 第 02 / 04 章：MVC 可以适配 `Flux`，只是需要流式 `produces` 与容器异步支持；删掉「一定被聚合」的绝对说法。
- 第 15 章：MVC 控制器改用 `SseEmitter`（原示例把 WebFlux 的 `ServerSentEvent` 放进了 MVC 工程）。
- 第 08 章：`TokenCountBatchingStrategy` 没有 builder，示例改为构造器。
- 第 01 章：删除「base-url 写 `/v1` 会 404」的臆断；`MockChatModel` 改为自写 `StubChatModel`。
- 第 05 章：JDBC 表结构标注为 HSQLDB 测试脚本，列类型随方言变化。
- 首页与导航：工程化分组改为第 13–16 章，出处数更新为 292。

## v1.1.0 — 2026-11-06

新增第 16 章「评测」，补上「改了之后怎么知道变好没有」这一环。

- 三层评测：确定性断言 → 离线回归集 → 在线指标，各自能回答什么、不能回答什么。
- 回归集：四类样本（常规 / 同义改写 / 多轮追问 / 不该回答）、JSONL 结构、chunk id 与源文档 id 的区别。
- 检索指标：recall@k、MRR、hit rate 的公式与实现，说明为什么应该先于生成指标优化。
- 生成指标：`Evaluator` / `EvaluationRequest` / `EvaluationResponse`、`RelevancyEvaluator`、`FactCheckingEvaluator`
  的真实用法；指出内置实现只认 `yes`、只给 0/1，以及官方文档里 `List<Content>` 与源码 `List<Document>` 的偏差。
- LLM-as-judge：point-wise vs pairwise、自恋/位置/长度偏差、judge 选型与 `chain.copy(this)` 自纠正。
- CI 门禁与成本：阈值、重复次数、缓存、分层执行。
- 附录 C 增补评测相关 API；首页与导航同步到 22 页。

## v1.0.0 — 2026-11-06

正文与附录全部完成，站点可发布。

- 第 13 章「可观测性与测试」：Observation 覆盖范围、`gen_ai.client.token.usage`、prompt/completion 日志开关、
  `Usage` 取值、`StubChatModel` / 直调 `ToolCallback` / `StubEmbeddingModel` 的零成本测试、环境变量守卫的集成测试。
- 第 14 章「生产化」：默认重试 10 次 ×5 退避的真实代价、4xx 与 429 的归类、三层超时、限流位置、多模型降级、
  token 成本估算与上线检查清单。
- 第 15 章「综合案例」：知识库问答服务的架构、依赖、配置、幂等入库、Advisor 链、工具身份、流式引用、
  三层测试与 compose 部署。
- 附录 A「术语表」、B「报错速查」、C「API 速查」、D「1.x → 2.0 迁移」、E「源码地图」。
- 全站 276 条 `file:line` 出处；索引 257 段。

## v0.3.0 — 2026-11-06

补齐「流式 → Advisor → 向量库 → 高级检索 → MCP」五段，已读章节达到 13 个。

- 第 04 章「流式与 SSE」：chunk 的真实结构、WebFlux 与 MVC 两种接法、订阅/取消/超时、流式下记忆与观测的聚合、错误阶段划分。
- 第 06 章「Advisor 机制」：order 与内外层的数值推导、`BaseAdvisor` 的 before/after、流式下 `after` 的触发条件、
  `CallAdvisor` 短路、自定义审计 Advisor、内置 Advisor 顺序表与 `copy(this)` 递归。
- 第 08 章「Embedding 与向量库选型」：`dimensions()` 会真调一次、维度三个来源与 1536 兜底、三种距离度量、
  pgvector 建表/扩展/HNSW、`initialize-schema` 默认 false、8191×90% 分批。
- 第 09 章「高级检索」：metadata 过滤 DSL、改写/多查询/翻译/压缩的成本、`VectorStoreDocumentRetriever` 默认值、
  重排钩子、`RetrievalAugmentationAdvisor` 七步与引用回传。
- 第 11 章「MCP 客户端」：stdio/SSE/Streamable HTTP、配置前缀、握手与超时、命名冲突的两条路径、`McpToolFilter`、安全边界。
- 第 12 章「MCP 服务端」：`@McpTool`/`@McpResource`/`@McpPrompt`、四种运行方式、注解扫描条件、端点与鉴权。
- 顺带修正：第 02 章与第 07 章里对 Advisor order 的错误描述（工具 Advisor 在内、日志/RAG 在外）。

## v0.2.0 — 2026-11-06

新增四章，覆盖「对话 → 记忆 → 工具 → 检索」四条主线。

- 第 03 章「Prompt 模板与结构化输出」：模板分隔符与 JSON 花括号冲突、`BeanOutputConverter` 的三步机制、
  `entity()` 的调用链、`StructuredOutputChatOptions` 判定（DeepSeek 不支持原生结构化输出，
  开关会静默退化）、`validateSchema()` 的重试与上限。
- 第 05 章「多轮记忆」：`ChatMemory` 与 `ChatMemoryRepository` 的分工、
  `MessageWindowChatMemory` 的三条裁剪规则、Advisor 的 before/after 与「失败也写入 user 消息」副作用、
  JDBC（`sequence_id`）与 Redis（2.0.1 前缀改名）存法。
- 第 10 章「Tool Calling」：`@Tool` 与 schema 生成、`ToolCallingAdvisor` 的循环、
  `ToolContext`、异常默认转消息、40/150 调用上限、记忆在环内/环外、流式工具调用的分片合并。
- 第 07 章「RAG 总览」：ETL 三段、`TokenTextSplitter` 默认值、DeepSeek 与 embedding 模型的分工、
  `SimpleVectorStore`、`QuestionAnswerAdvisor` 的默认模板与 `SearchRequest` 参数。
- 首页与章节清单同步：已读章节 7 个，全文索引 94 段。

## v0.1.0 — 2026-11-06

首个可发布版本。

- 站点骨架：首页、404、robots、favicon、阅读进度、暗色主题、全文搜索、键盘导航。
- 第 00 章「学习地图」：三条学习主线、章节依赖图、前置知识自查、无 Key 学习路径。
- 第 01 章「环境与依赖」：Spring Boot 4.1.2 + JDK 17 + `spring-ai-bom` 2.0.2 + DeepSeek starter，
  讲清 BOM / starter / autoconfigure / model 四层与常见启动错误。
- 第 02 章「ChatClient」：三种建法、prompt 规格、`content` / `chatResponse` / `entity` / `stream`、
  运行时参数、`ChatMemory` + `MessageChatMemoryAdvisor`、一次调用的 Advisor 链。
- 工具链：`tools/check-site.cjs`（静态检查）、`tools/check-sources.cjs`（出处核验）、
  `tools/build-search-index.cjs`（搜索索引）。
- 发布：GitHub Pages 工作流，发布前自动重建索引并跑静态检查。

### 已知边界

- 内容已全部完成；后续只做勘误与随版本更新（`status` 可用于标记新增章节）。
- 本站按 Spring Boot 4.x 编写；Boot 3.x 项目请使用 Spring AI 1.0.x。
