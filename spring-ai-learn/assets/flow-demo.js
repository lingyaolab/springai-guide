/* 00A ChatClient 信息流实验室：L1 最小调用 → L2 工程化 → L3 生产化（零依赖） */
(function () {
  "use strict";

  var root = document.getElementById("fd");
  if (!root) return;

  var NODES = {
    input: {
      name: "UserInput",
      title: "用户输入",
      input: "问题字符串或模板变量",
      output: "ChatClient.prompt() 链式调用",
      next: "Prompt",
      link: "02-chatclient.html",
      linkText: "02 ChatClient",
    },
    prompt: {
      name: "Prompt",
      title: "组装 Prompt",
      input: "system + user + params + options",
      output: "Prompt(messages, options)",
      next: "AdvisorChain",
      link: "02-chatclient.html",
      linkText: "02 ChatClient",
    },
    advisors: {
      name: "AdvisorChain",
      title: "Advisor 链",
      input: "ChatClientRequest + 已注册 Advisor",
      output: "按 order 排好的调用链（越小越靠外）",
      next: "ChatModel",
      link: "06-advisors.html",
      linkText: "06 Advisor 机制",
    },
    model: {
      name: "ChatModel",
      title: "第一次模型调用",
      input: "messages + tools + options",
      output: "ChatResponse（文本或 tool_calls）",
      next: "ToolCallingAdvisor",
      link: "02-chatclient.html",
      linkText: "02 ChatClient",
    },
    tooladv: {
      name: "ToolCallingAdvisor",
      title: "检测工具调用",
      input: "ChatResponse 里的 tool_calls",
      output: "有工具就执行，没有就返回",
      next: "ToolCallback",
      link: "10-tool-calling.html",
      linkText: "10 Tool Calling",
    },
    tool: {
      name: "ToolCallback",
      title: "执行 Java 工具",
      input: "工具名 + 参数 JSON + ToolContext",
      output: "ToolResponseMessage",
      next: "ChatModel 2",
      link: "10-tool-calling.html",
      linkText: "10 Tool Calling",
    },
    model2: {
      name: "ChatModel 2",
      title: "带工具结果再推理",
      input: "上下文 + ToolResponseMessage",
      output: "最终 ChatResponse",
      next: "ResponseSpec",
      link: "10-tool-calling.html",
      linkText: "10 Tool Calling",
    },
    spec: {
      name: "ResponseSpec",
      title: "取结果",
      input: "ChatResponse / Flux<ChatResponse>",
      output: "content() / entity() / chatResponse()",
      next: "Output",
      link: "02-chatclient.html",
      linkText: "02 ChatClient",
    },
    output: {
      name: "Output",
      title: "返回调用方",
      input: "String / 实体 / ChatResponse",
      output: "业务对象或 SSE 帧",
      next: "Controller / 前端",
      link: "04-streaming-sse.html",
      linkText: "04 流式与 SSE",
    },

    memory: {
      addedAt: 2,
      name: "ChatMemory",
      title: "记忆 Advisor",
      input: "conversationId + 历史消息",
      output: "MessageChatMemoryAdvisor 注入历史",
      next: "AdvisorChain",
      link: "05-chat-memory.html",
      linkText: "05 多轮记忆",
    },
    rag: {
      addedAt: 2,
      name: "RAG",
      title: "QuestionAnswerAdvisor",
      input: "最后一条 user 消息 + SearchRequest",
      output: "检索上下文替换 user 消息",
      next: "ChatModel",
      link: "07-rag-overview.html",
      linkText: "07 RAG 总览",
    },
    structured: {
      addedAt: 2,
      name: "StructuredOutput",
      title: "结构化输出校验",
      input: "JSON 文本 + BeanOutputConverter",
      output: "实体对象 / 校验失败后重试",
      next: "ResponseSpec",
      link: "03-prompt-structured-output.html",
      linkText: "03 提示词与结构化输出",
    },
    observation: {
      addedAt: 2,
      name: "Observation",
      title: "可观测性",
      input: "ChatClient / ChatModel 调用",
      output: "trace / metric / log",
      next: "监控系统",
      link: "13-observability-testing.html",
      linkText: "13 可观测性与测试",
    },
    streaming: {
      addedAt: 2,
      name: "Streaming",
      title: "流式输出",
      input: "Flux<ChatResponse>",
      output: "增量 content + SSE",
      next: "前端",
      link: "04-streaming-sse.html",
      linkText: "04 流式与 SSE",
    },

    auth: {
      addedAt: 3,
      name: "Auth",
      title: "鉴权与租户",
      input: "JWT / API Key / 租户 ID",
      output: "可信用户与租户上下文",
      next: "Gateway",
      link: "14-production.html",
      linkText: "14 生产化",
    },
    gateway: {
      addedAt: 3,
      name: "Gateway",
      title: "网关与限流",
      input: "HTTP / SSE 请求",
      output: "路由、配额与并发保护",
      next: "Retry",
      link: "14-production.html",
      linkText: "14 生产化",
    },
    retry: {
      addedAt: 3,
      name: "Retry",
      title: "重试与超时",
      input: "限流 / 网络错误 / 慢响应",
      output: "退避重试或快速失败",
      next: "ModelRouter",
      link: "14-production.html",
      linkText: "14 生产化",
    },
    router: {
      addedAt: 3,
      name: "ModelRouter",
      title: "多模型路由",
      input: "任务类型、成本与可用性",
      output: "DeepSeek / 备用模型",
      next: "ChatModel",
      link: "14-production.html",
      linkText: "14 生产化",
    },
    mcpclient: {
      addedAt: 3,
      name: "MCP Client",
      title: "接入外部工具",
      input: "MCP Server 的能力清单",
      output: "远端工具变成 ToolCallback",
      next: "ToolCallingAdvisor",
      link: "11-mcp-client.html",
      linkText: "11 MCP 客户端",
    },
    mcpserver: {
      addedAt: 3,
      name: "MCP Server",
      title: "暴露自己的能力",
      input: "@McpTool / @McpResource",
      output: "供其他 Agent 调用的 MCP 服务",
      next: "外部 Agent",
      link: "12-mcp-server.html",
      linkText: "12 MCP 服务端",
    },
    eval: {
      addedAt: 3,
      name: "Evaluation",
      title: "回归与评测",
      input: "标注集 + judge 模型",
      output: "recall / MRR / 通过率",
      next: "发布门禁",
      link: "16-evaluation.html",
      linkText: "16 评测",
    },
    deploy: {
      addedAt: 3,
      name: "Deploy",
      title: "部署与成本",
      input: "容器、密钥、监控",
      output: "可回滚的在线服务",
      next: "用户",
      link: "15-capstone.html",
      linkText: "15 综合案例",
    },
  };

  var LEVELS = {
    minimal: {
      label: "MINIMAL CALL",
      level: "L1",
      blurb:
        "L1 只有 9 个节点：用户输入组装成 Prompt，Advisor 链排序后调用 ChatModel；模型要工具就执行工具再推理，最后统一从 ResponseSpec 取结果。",
      ids: [
        "input",
        "prompt",
        "advisors",
        "model",
        "tooladv",
        "tool",
        "model2",
        "spec",
        "output",
      ],
    },
    service: {
      label: "SERVICE",
      level: "L2",
      blurb:
        "L2 在 L1 的 9 个节点上新增 5 个：ChatMemory、RAG、StructuredOutput、Observation、Streaming。ChatClient 还是那条链，工程能力开始挂到 Advisor 与 ResponseSpec 上。",
      ids: [
        "input",
        "memory",
        "rag",
        "prompt",
        "advisors",
        "model",
        "tooladv",
        "tool",
        "model2",
        "structured",
        "observation",
        "spec",
        "streaming",
        "output",
      ],
    },
    production: {
      label: "PRODUCTION",
      level: "L3",
      blurb:
        "L3 在 L2 的 14 个节点上再加 8 个：Auth、Gateway、Retry、ModelRouter、MCP Client、MCP Server、Evaluation、Deploy。它们不都在模型循环里，很多接在入口、工具面与发布流程上。",
      ids: [
        "auth",
        "gateway",
        "retry",
        "router",
        "input",
        "memory",
        "rag",
        "prompt",
        "advisors",
        "model",
        "tooladv",
        "tool",
        "mcpclient",
        "model2",
        "structured",
        "observation",
        "spec",
        "streaming",
        "mcpserver",
        "eval",
        "output",
        "deploy",
      ],
    },
  };

  var modeButtons = root.querySelectorAll(".fd-mode");
  var rail = document.getElementById("fd-rail");
  var blurb = document.getElementById("fd-blurb");
  var stepEl = document.getElementById("fd-step");
  var titleEl = document.getElementById("fd-title");
  var inputEl = document.getElementById("fd-input");
  var outputEl = document.getElementById("fd-output");
  var nextEl = document.getElementById("fd-next-node");
  var linkEl = document.getElementById("fd-link");
  var counterEl = document.getElementById("fd-counter");
  var labelEl = document.getElementById("fd-scenario-label");
  var levelEl = document.getElementById("fd-level");
  var jsonEl = document.getElementById("fd-json");
  var eventsEl = document.getElementById("fd-events");
  var packetEl = document.getElementById("fd-packet");
  var barEl = document.getElementById("fd-bar");
  var railWrap = root.querySelector(".fd-rail-wrap");
  var current = "minimal";
  var index = 0;
  var timer = null;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function nodes() {
    return LEVELS[current].ids.map(function (id) {
      return NODES[id];
    });
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function stopPlay() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    playBtn.setAttribute("aria-pressed", "false");
    playBtn.textContent = "▶ 播放";
  }

  function paintRail() {
    rail.innerHTML = "";
    nodes().forEach(function (n, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "fd-node";
      b.dataset.i = String(i);
      var badge = n.addedAt
        ? '<span class="fd-badge l' + n.addedAt + '">+L' + n.addedAt + "</span>"
        : "";
      b.innerHTML =
        '<span class="fd-idx">' +
        pad2(i + 1) +
        "</span>" +
        badge +
        '<span class="fd-name">' +
        n.name +
        '</span><span class="fd-out">' +
        n.output +
        "</span>";
      b.addEventListener("click", function () {
        stopPlay();
        select(i);
      });
      rail.appendChild(b);
    });
  }

  function positionPacket() {
    var active = rail.querySelector(".fd-node.active");
    if (!active || !railWrap) {
      packetEl.classList.remove("on");
      return;
    }
    var wr = railWrap.getBoundingClientRect();
    var ar = active.getBoundingClientRect();
    packetEl.style.left = ar.left - wr.left + ar.width / 2 - 4 + "px";
    packetEl.classList.add("on");
  }

  function paintEvents() {
    if (!eventsEl) return;
    eventsEl.innerHTML = "";
    var from = Math.max(0, index - 6);
    nodes()
      .slice(from, index + 1)
      .forEach(function (n) {
        var chip = document.createElement("span");
        chip.className = "fd-event";
        chip.textContent = n.name;
        eventsEl.appendChild(chip);
      });
  }

  function select(i) {
    index = Math.max(0, Math.min(nodes().length - 1, i));
    var list = rail.querySelectorAll(".fd-node");
    for (var k = 0; k < list.length; k++) {
      list[k].classList.toggle("active", k === index);
      list[k].classList.toggle("done", k < index);
      if (k === index) list[k].setAttribute("aria-current", "step");
      else list[k].removeAttribute("aria-current");
    }
    var n = nodes()[index];
    var len = nodes().length;
    stepEl.textContent = "步骤 " + (index + 1) + " / " + len;
    counterEl.textContent = pad2(index + 1) + " / " + pad2(len);
    barEl.style.width = ((index + 1) / len) * 100 + "%";
    titleEl.textContent = n.title;
    inputEl.textContent = n.input;
    outputEl.textContent = n.output;
    nextEl.textContent = n.next;
    jsonEl.textContent = JSON.stringify(
      {
        step: index + 1,
        node: n.name,
        addedAt: n.addedAt || 1,
        input: n.input,
        output: n.output,
        next: n.next,
      },
      null,
      2
    );
    paintEvents();
    linkEl.innerHTML = '对应章节：<a href="' + n.link + '">' + n.linkText + "</a>";
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === len - 1;
    var active = list[index];
    if (active) {
      var left = active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2;
      if (rail.scrollWidth > rail.clientWidth + 4) {
        rail.scrollTo({
          left: Math.max(0, left),
          behavior: reduce ? "auto" : "smooth",
        });
      }
    }
    requestAnimationFrame(positionPacket);
  }

  function renderScenario(key) {
    stopPlay();
    current = key;
    index = 0;
    modeButtons.forEach(function (b) {
      b.setAttribute(
        "aria-pressed",
        b.dataset.scenario === key ? "true" : "false"
      );
    });
    blurb.textContent = LEVELS[key].blurb;
    labelEl.textContent = LEVELS[key].label;
    levelEl.textContent = LEVELS[key].level;
    eventsEl.innerHTML = "";
    jsonEl.textContent = "";
    paintRail();
    select(0);
  }

  var prevBtn = document.getElementById("fd-prev");
  var nextBtn = document.getElementById("fd-next");
  var playBtn = document.getElementById("fd-play");
  var resetBtn = document.getElementById("fd-reset");

  prevBtn.addEventListener("click", function () {
    stopPlay();
    select(index - 1);
  });
  nextBtn.addEventListener("click", function () {
    stopPlay();
    select(index + 1);
  });
  resetBtn.addEventListener("click", function () {
    stopPlay();
    select(0);
  });
  playBtn.addEventListener("click", function () {
    if (timer) {
      stopPlay();
      return;
    }
    if (index >= nodes().length - 1) select(0);
    playBtn.setAttribute("aria-pressed", "true");
    playBtn.textContent = "❚❚ 暂停";
    timer = setInterval(function () {
      if (index >= nodes().length - 1) {
        stopPlay();
        return;
      }
      select(index + 1);
    }, 1400);
  });

  modeButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      renderScenario(b.dataset.scenario);
    });
  });

  document.addEventListener("keydown", function (e) {
    if (!root.contains(document.activeElement)) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      stopPlay();
      select(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      stopPlay();
      select(index - 1);
    }
  });

  rail.addEventListener("scroll", positionPacket, { passive: true });
  window.addEventListener("resize", positionPacket);

  var requested = new URLSearchParams(location.search).get("scenario");
  renderScenario(LEVELS[requested] ? requested : "minimal");
})();
