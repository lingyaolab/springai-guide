# Spring AI 2.0.2 配套示例

对齐版本：**Spring AI 2.0.2** + **Spring Boot 4.1.2** + **JDK 17**。

## 运行

```powershell
$env:JAVA_HOME="C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot"
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"

cd samples
mvn test
$env:DEEPSEEK_API_KEY="..."
mvn spring-boot:run
```

## 内容

- `SamplesApplication`：启动后跑一次普通对话与结构化输出。
- `ChatService`：封装 `ChatClient`。
- `MovieService`：`.entity(Movie.class)` 结构化输出。
- `WeatherTools`：`@Tool` / `@ToolParam`。
- `ChatServiceTest`：离线 `StubChatModel`，不访问网络。

## 说明

- `mvn test` 不需要 API Key。
- `mvn spring-boot:run` 需要 `DEEPSEEK_API_KEY`。
- 配置在 `application.yml`，默认模型 `deepseek-chat`。
