# Kuka Java SDK

[Kuka Code Core](https://github.com/midea-ai/kuka-code-core) 的官方 Java SDK：一个事件驱动的 AI 编程助手核心引擎，支持多代理协作、Skill 扩展、Plan 模式任务规划等能力。SDK 内嵌 core 运行时（sidecar），加一个 Maven 依赖即开箱即用，同步阻塞、直接返回结果。

## 安装

```xml
<dependency>
  <groupId>io.github.midea-ai</groupId>
  <artifactId>kuka-code</artifactId>
  <version>{版本号}</version>
</dependency>
```

要求：Java 17+，本机 Node.js ≥ 18（core 运行时依赖）。

## 快速开始

```java
package com.kuka.example.demo;

import kukacore.KukaCore;
import kukacore.KukaJson;
import kukacore.KukaSession;
import kukacore.type.KukaCoreConfig;

import java.util.concurrent.CompletableFuture;

public class Test {
    public static void main(String[] args) {
        try (KukaCore core = KukaCore.start(KukaCoreConfig.builder().workingDir("/path/to/your/project").build())) {
            KukaSession session = core.createSession();
            session.on("message:text:chunk", d -> System.out.print(KukaJson.str(d, "delta", "")));

            CompletableFuture<Void> done = new CompletableFuture<>();
            session.on("state:update", d -> {
                if ("idle".equals(KukaJson.str(d, "state"))) done.complete(null);
            });

            session.processUserInput("你好");
            done.join(); // 等回复完成再关
        }
    }
}
```

模型配置与更多用法见 [文档](https://midea-ai.github.io/kuka-code-core)，完整示例见 [example/java-demo](https://github.com/midea-ai/kuka-code-core/tree/main/example/java-demo)（交互式 CLI 与一次性执行）。

## License

[MIT](https://github.com/midea-ai/kuka-code-core/blob/main/LICENSE)
