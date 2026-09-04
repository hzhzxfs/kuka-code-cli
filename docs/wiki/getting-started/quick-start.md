# 快速开始

本文档介绍如何在 1 分钟内快速启动一个 AI 编码 Agent。

## 方式一：Node.js 直接集成

如果你使用 Node.js 开发，可以直接使用 `kuka-code`，无需桥接服务。

### 1. 新建项目并安装依赖

```bash
mkdir my-app && cd my-app
npm init -y
npm install kuka-code
```

### 2. 下载示例文件

将 [`quickstart.mjs`](https://github.com/midea-ai/kuka-code-core/tree/main/example/quickstart.mjs) 下载到 `my-app` 目录，然后修改以下两处配置：

```javascript
// quickstart.mjs
  workingDir: '/path/to/your/project',       // Agent 将操作的目标代码仓库路径
  "apiKey": "sk-your-api-key",               // 替换为你的 deepseek API Key
```

> 💡 **提示**：`addModel` 和 `applyTaskModel` 只需运行一次，模型配置会持久化保存。后续运行可以注释掉模型相关代码。

更多模型配置选项，请参考 [添加新模型](wiki/getting-started/basic-usage/add-new-model)。

### 3. 运行

```bash
node quickstart.mjs
```

<img src="https://github.com/midea-ai/kuka-code-core/releases/download/docs-assets/quick-start.gif" alt="快速开始演示" />

### 4. 与 Agent 交互

启动后，你可以通过以下方式与 Agent 交互：

- **输入消息**：在提示符后输入自然语言指令
- **权限响应**：当 Agent 需要执行敏感操作时，输入：
  - `y` = `agree`（单次同意）
  - `a` = `allow`（永久放行，支持前缀匹配）
  - `n` = `refuse`（拒绝）
- **中断回复**：按 `Ctrl+C` 中断当前正在生成的回复（会话保留，可继续输入）
- **退出程序**：输入 `exit` 或 `quit`；空闲等待输入时按一次 `Ctrl+C`、生成回复时连按两次 `Ctrl+C` 也会退出
- **会话 ID**：启动、正常退出、`Ctrl+C` 退出时都会打印 `会话 ID`，用 `cc --resume <id>` 可恢复该对话

### 5. 核心 API 说明

示例中使用的核心 API：

```javascript
// 创建会话
const result = await core.createSession();
if (!result.ok) throw new Error(result.error);
const session = result.session;

// 发送用户输入
session.processUserInput("帮我重构这个函数");

// 中断会话
session.interrupt();

// 监听会话级事件
session.on('session:ready', (data) => { ... });
session.on('message:text:chunk', ({ delta }) => { process.stdout.write(delta); });
session.on('tool:permission:request', (data) => { ... });

// 响应权限请求
session.respondToToolPermission({ toolId, toolName, selected: 'agree' });
```

完整 API 列表请参考 [KukaCore 公共 API](wiki/core-concepts/core-architecture/kuka-code-public-api) 与 [KukaSession 会话级 API](wiki/core-concepts/core-architecture/kuka-session-api)。

### 6. 进阶：TypeScript 示例工程（demo）

`example/demo` 是一个最小化的 TypeScript 工程，演示 `kuka-code` 的两种典型用法。它的模型配置不写在代码里，而是启动时自动读取 `~/.kukacode/model.conf`（首次使用需先创建该文件，格式见 [demo/README](https://github.com/midea-ai/kuka-code-core/blob/main/example/demo/README.md)）。

```bash
cd example/demo
npm install
```

**入口 1 — 交互式 CLI**（多轮对话、流式输出、Ctrl+C 中断、权限询问）：

```bash
npm run cli <项目路径> [会话id]   # 会话id 可选，传入则加载历史会话继续对话
```

**入口 2 — 一次性执行**（执行单条指令后退出，全程免人工确认）：

```bash
npm run exec <项目路径> "<用户输入>" [详略档位]   # 详略档位：verbose | medium | simple | minimal，缺省 verbose
```

---

## 方式二：跨语言集成（C# / Java / Python）

如果你使用其他语言，可以通过 WebSocket 或 gRPC 桥接集成 `kuka-code`。

### 架构

**WebSocket 方式（kuka-bridge）：**
```
客户端应用 (C# / Java / Python)
    ↕ WebSocket (ws://localhost:3765)
Node.js 桥接服务 (kuka-bridge)
    ↕ 内部调用
kuka-code (npm 包)
```

**gRPC 方式（kuka-grpc）：**
```
客户端应用 (C# / Java / Python / ...)
    ↕ gRPC 双向流 (grpc://localhost:3766)
Node.js gRPC 服务 (kuka-grpc)
    ↕ 内部调用
kuka-code (npm 包)
```

### 项目结构

```
example/
├── quickstart.mjs            # Node.js 直接集成（无需桥接）
├── demo/                     # TypeScript 示例工程（交互式 CLI + 一次性执行）
│
├── kuka-grpc/                # 桥接服务端 ─ gRPC
├── kuka-bridge/              # 桥接服务端 ─ WebSocket
└── kuka-bridge-clients/      # 连接 kuka-bridge 的多语言客户端示例
    ├── kuka-csharp-demo/     # 客户端示例 ─ C#
    ├── kuka-java-demo/       # 客户端示例 ─ Java
    └── kuka-python-demo/     # 客户端示例 ─ Python
```

### 启动步骤

详见 [跨语言集成文档](https://github.com/midea-ai/kuka-code-core/blob/main/example/README.md)。

---

## 关键概念

| 概念 | 说明 | 文档 |
|------|------|------|
| **KukaCore** | 进程级入口，管理全局资源、配置和会话池 | [KukaCore - 公共 API 层](wiki/core-concepts/core-architecture/kuka-code-public-api) |
| **KukaSession** | 会话级入口，处理输入、事件、权限响应和后台任务 | [KukaSession - 会话级 API](wiki/core-concepts/core-architecture/kuka-session-api) |
| **KukaEngine** | 单会话核心引擎，负责输入队列、模式控制和对话调度 | [KukaEngine - 业务逻辑](wiki/core-concepts/core-architecture/kuka-engine-business-logic) |
| **事件系统** | 流式输出、状态变化、工具执行均通过事件通知 | [事件总线架构](wiki/core-concepts/event-system/event-bus) |
| **工具权限** | 写操作（RunShell、PatchFile 等）默认需要用户授权 | [权限系统](wiki/core-concepts/permission-system/overview) |
| **MCP** | 通过标准协议为 AI 扩展自定义工具 | [MCP 使用](wiki/getting-started/basic-usage/mcp-usage) |
| **Skill** | 可复用的 AI 工作流，存储为 Markdown 文件 | [Skill 使用](wiki/getting-started/basic-usage/skill-usage) |
| **SubAgent** | 隔离执行的专用子代理 | [SubAgent 后台任务](wiki/core-concepts/task-management/agent-task) |

---

## 下一步

- 📚 [添加新模型配置](wiki/getting-started/basic-usage/add-new-model) - 配置更多 LLM 服务商
- 🔧 [命令使用说明](wiki/getting-started/basic-usage/command-usage) - 学习内置命令
- 🤖 [SubAgent 后台任务](wiki/core-concepts/task-management/agent-task) - 委派专项任务
- ⏰ [定时任务使用](wiki/getting-started/basic-usage/cron-usage) - 设置周期性任务
- 🔌 [MCP 集成使用](wiki/getting-started/basic-usage/mcp-usage) - 接入外部工具
