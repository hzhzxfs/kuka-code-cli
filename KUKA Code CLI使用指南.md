# 怎么启动 Kuka Code

## LLM配置

### 方式一：直接手写 `~/.kuka/model.conf`

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



## 先决条件(仅首次需要)

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

## 总结

- **想马上试** → 进项目目录敲 `node bin/cc.js version`
- **想以后随处敲 cc** → `npm link`(普通 Node)或丢一个 `cc.cmd` 到 PATH

---

本沙箱因受管 Node 的限制,没法直接演示裸 `cc` 命令,但 `node bin/cc.js` 路径已反复验证可用。
