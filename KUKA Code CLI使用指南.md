# 怎么使用 Kuka Code

## 一、LLM配置：直接手写 `~/.kuka/model.conf`

配置文件就是普通 JSON，路径在你的用户目录：`~/.kuka/model.conf` (Windows 即 `C:\Users\你的用户名\.kuka\model.conf`)。

格式如下：

```json
{
  "modelProfiles": [
    {
      "name": "deepseek-v4-flash[custom]",
      "provider": "custom",
      "modelName": "deepseek-v4-flash",
      "baseURL": "https://api.deepseek.com",
      "apiKey": "sk-XXXXXXX",
      "maxTokens": 384000,
      "contextLength": 1000000,
      "adapt": "openai"
    }
  ],
  "modelPointers": {
    "main": "deepseek-v4-flash[custom]",
    "quick": "deepseek-v4-flash[custom]"
  }
}
```

#### 字段说明 (照抄即可):

| 字段 | 必填 | 说明 |
| :--- | :---: | :--- |
| `name` | ✅ | 唯一标识，必须是 `modelName[provider]` 格式，如 `gpt-4o[openai]`、`deepseek-chat[custom]` |
| `provider` | ✅ | 自由字符串，只作方括号标签，如 `openai`/`anthropic`/`custom`/`deepseek` |
| `modelName` | ✅ | 真正发给 API 的模型名 |
| `baseURL` | 可选 | 自定义端点；OpenAI/Anthropic 官方地址可省略 |
| `apiKey` | ✅ | 必须填真实 key (见下方"重要真相") |
| `maxTokens` | ✅ | 最大输出 token，如 `8192` |
| `contextLength` | ✅ | 上下文窗口，如 `128000` |
| `adapt` | ✅ | 枚举，只能 `openai` 或 `anthropic` |
| `modelPointers.main` | ✅ | 设为你想激活的那个 `name`，它就是当前模型 |

> ⚠️ **`adapt` 的取值规律:**
>
> - 所有 OpenAI 兼容端点 (OpenAI、DeepSeek、Qwen、GLM、Kimi、OpenRouter、本地 Ollama/llama.cpp 的 `/v1`) 都填 `openai`；
> - 只有 Claude 填 `anthropic`。



## 二、环境配置

```bash
cd "C:\work\kuka agent\kuka-code\kuka-code-core-main"
npm install          # 装依赖(只需一次;本沙箱 node_modules 已就绪,新机器要跑)
```

> **注:** `dist/` 已编译好,无需再 `tsc`。本机若代理导致 `npm` 失败,可先 `npm config delete proxy` 或 `set HTTP_PROXY=` 再装。

## 方式一:进目录用 node 跑(100% 可靠,推荐先试)

不用任何全局配置,在项目目录里:

```bash
node bin/cc.js version      # 看版本
node bin/cc.js config       # 看配置
node bin/cc.js -p "你好"     # 单条对话
node bin/cc.js              # 进入交互式对话
```

> `kuka` 和 `cc` 完全等价(`bin/kuka.js` 是同一入口)。

## 方式二:让 cc 变成全局命令(你问的"cmd 里直接敲 cc")

标准做法(普通 Windows + 官方 Node 一般 OK):

```bash
cd "C:\work\kuka agent\kuka-code\kuka-code-core-main"
npm link
```

然后新开一个 cmd,直接 `cc version` 即可。`npm link` 会把 `cc/kuka` 注册到 npm 的全局 bin(通常在 `%APPDATA%\npm`,安装 Node 时已加进 PATH)。

> 如果敲 `cc` 仍报"不是内部或外部命令":运行 `npm get prefix` 看全局目录,把它的 `node_modules\.bin`(即 `%APPDATA%\npm`)加进系统 PATH,或干脆重启终端。

## 方式三:最稳的全局方案 —— 手写一个 cc.cmd(不受 npm 怪癖影响)

如果你想要"任意目录敲 cc 都行"且不想管 npm,在任意一个已在 PATH 里的文件夹(比如 `C:\Windows` 或一个 tools 目录)建 `cc.cmd`:

```cmd
@echo off
node "C:\work\kuka agent\kuka-code\kuka-code-core-main\bin\cc.js" %*
```

同理建 `kuka.cmd` 指向同一个 js。这样 `cc/kuka` 在所有 cmd 窗口都能用,且不依赖 node 是受管版还是官方版。

---

## 三、安装自定义 Skill

**支持。kuka code 会自动扫描两个目录下的 skill，无需任何注册命令，放进去就能用。**

### 1. 两个作用域（优先级不同）

| 作用域 | 目录 | 说明 |
| :--- | :--- | :--- |
| 用户级（全局） | `~/.kuka/skills/<skill名>/SKILL.md` | 对所有项目生效（Windows：`C:\Users\你的用户名\.kuka\skills\...`） |
| 项目级（当前目录） | `<你运行 cc 的目录>/.kuka/skills/<skill名>/SKILL.md` | 只对当前项目生效，**同名时优先级最高，会覆盖用户级** |

> 优先级顺序：**插件 < 用户级 < 项目级**。同名 skill，后加载的覆盖先加载的。

### 2. 一个 skill 的目录结构

每个 skill 是一个**子目录**，里面放一个 `SKILL.md`：

```
~/.kuka/skills/
└── my-translator/          ← 目录名随意，仅作文件夹
    └── SKILL.md            ← 必须是这个文件名
```

### 3. SKILL.md 格式（带 YAML 头）

```markdown
---
name: my-translator
description: 把用户给的任意文本翻译成英文，并保留术语表
---

你是一个翻译助手。规则如下：
1. 默认翻译为目标语言：英文
2. 遇到专有名词（如产品名）保留原文并附在括号里
3. 输出只给译文，不要解释

# 术语表
- kuka code → Kuka Code CLI
```

要点（对照源码 `skillsManager.ts` / `formatter.ts`）：

- `name`、`description`、以及正文（`prompt`）**三者都必须非空**，缺任意一个该 skill 会被忽略并在日志报错。
- `name` 是模型的调用标识；`description` 是模型判断是否调用这个 skill 的依据，**写清楚它能干什么**很重要。
- `---` 之间是 YAML 头，正文就是注入给模型的指令。支持 `|` 块标量（多行文本）。
- 改完直接 `cc skills` 查看是否被正确识别。

### 4. 实战：装一个 skill

```bash
# Windows 示例：用户级
mkdir "%USERPROFILE%\.kuka\skills\my-translator"
# 用记事本或任意编辑器写入上面的 SKILL.md
notepad "%USERPROFILE%\.kuka\skills\my-translator\SKILL.md"

# 验证
cc skills
# 应能看到：• my-translator  — 把用户给的任意文本翻译成英文...
```

项目级同理，只是目录换成 `你的项目\.kuka\skills\`。

---

## 四、安装自定义 MCP Server

**支持。把 MCP 服务写进配置文件即可，kuka code 在会话启动时自动连接并加载其工具。**

### 1. 两个作用域

| 作用域 | 配置文件 | 说明 |
| :--- | :--- | :--- |
| 用户级（全局） | `~/.kuka/.mcp.json` | 对所有项目生效 |
| 项目级（当前目录） | `<你运行 cc 的目录>/.kuka/.mcp.json` | 只对当前项目生效，优先级更高 |

### 2. 配置文件格式

支持两种写法，**推荐用 `mcpServers` 包裹**（与 Claude Code 一致）：

```json
{
  "mcpServers": {
    "my-server": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "description": "文件系统 MCP，提供文件读写工具"
    }
  }
}
```

也可以省略 `mcpServers` 直接写对象（kuka code 两种都能读）：

```json
{
  "my-server": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
  }
}
```

### 3. 三种传输方式（transport）

**① stdio（本地命令，最常见）**

```json
{
  "mcpServers": {
    "fs": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:/work"],
      "env": { "MY_TOKEN": "xxx" },
      "description": "本地文件系统服务"
    }
  }
}
```

**② sse（Server-Sent Events 远程服务）**

```json
{
  "mcpServers": {
    "remote-sse": {
      "transport": "sse",
      "url": "http://localhost:3001/sse",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

**③ http（Streamable HTTP 远程服务）**

```json
{
  "mcpServers": {
    "remote-http": {
      "transport": "http",
      "url": "http://localhost:3001/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

字段对照（`MCPServerConfig`）：

| 字段 | 必填 | 说明 |
| :--- | :---: | :--- |
| `name`（JSON 键） | ✅ | 服务唯一名，对应 `.mcp.json` 里的键 |
| `transport` | 可选 | `stdio`(默认) / `sse` / `http` |
| `description` | 可选 | 描述，便于 `cc mcp` 查看 |
| `command` / `args` / `env` | stdio 用 | 本地可执行命令 |
| `url` / `headers` | sse/http 用 | 远程地址与请求头 |

### 4. 实战：加一个 MCP

```bash
# 用户级：直接编辑/新建 ~/.kuka/.mcp.json（内容见上方示例）
notepad "%USERPROFILE%\.kuka\.mcp.json"

# 验证（列出已识别的 MCP，会显示连接状态）
cc mcp
# 应能看到：• fs [connected] — 本地文件系统服务
```

> 提示：`cc mcp` 显示 `connected` 即表示工具已加载，之后在对话里模型就能调用它提供的工具。
> 想临时停用某个服务，把对应条目删掉即可；也可以参考源码 `MCPManager` 提供的 `disableMCPServer` / `enableMCPServer` 等运行期接口（当前 CLI 未暴露为命令，需手动改文件）。