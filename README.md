<div align="center">

<h3>An Event-Driven AI Coding Assistant Core Engine</h3>

<p>Providing reliable and pluggable intelligent processing capabilities for building code assistant tools.</p>

[![GitHub License](https://img.shields.io/github/license/midea-ai/kuka-code-core?style=flat-square)](https://github.com/midea-ai/kuka-code-core/blob/main/LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/midea-ai/kuka-code-core)
[![npm version](https://img.shields.io/npm/v/kuka-code?style=flat-square)](https://www.npmjs.com/package/kuka-code)
[![Documentation](https://img.shields.io/badge/docs-GitHub%20Pages-blue?style=flat-square)](https://midea-ai.github.io/kuka-code-core)
[![arXiv](https://img.shields.io/badge/arXiv-2604.11045-b31b1b?style=flat-square)](https://arxiv.org/abs/2604.11045)

[中文](./README_CN.md) | **English**

</div>

## 📖 Project Overview

**Kuka Code Core** is an event-driven AI coding assistant core engine that provides reliable and pluggable intelligent processing capabilities for building code assistant tools. It supports core capabilities such as multi-agent collaboration, Skill extension, and Plan mode task planning, and can be quickly integrated into various AI programming tools.

[View Documentation](https://midea-ai.github.io/kuka-code-core)

## ✨ Core Features

| Feature | Description |
|:--------|:------------|
| **Natural Language Instructions** | Directly drive programming tasks through natural language |
| **Permission Control** | Fine-grained permission management ensures safe and controllable operations |
| **Subagent Management** | Multi-agent collaboration with dynamic sub-agent scheduling based on task types |
| **Skill Extension Mechanism** | Plugin architecture to flexibly extend AI programming capabilities |
| **Plan Mode Task Planning** | Decomposition and execution planning of complex tasks |
| **MCP Protocol Support** | Built-in Model Context Protocol service to support tool extension |
| **Multi-Model Support** | Compatible with Anthropic, OpenAI SDK, and LLM APIs from major vendors |

## 🎯 Scenarios

- **IDE / Editor Plugin Development** — Provides low-level AI capability encapsulation for editors, allowing developers to focus on UI interaction without self-developing complex large model scheduling and tool calling logic.

- **Enterprise Internal R&D Tools** — Private deployment + permission control, adapting to enterprise-owned models and security specifications. Out-of-the-box toolchain avoids building AI programming infrastructure from scratch.

- **Vertical Domain Intelligent Workflow** — Decomposes complex engineering tasks (migration, refactoring, documentation) into automated processes. Multi-agent collaborative execution replaces manual processing of repetitive coding work.

- **Academic Research & Agent Prototype Verification** — Provides a lightweight Agent experimental environment for academic institutions and independent researchers, supporting flexible combinations of toolchains and agent strategies, allowing researchers to focus on algorithmic innovation.

## 💼 Use Cases

### IDE Extension (VSCode / JetBrains)

[Kuka Code Extension](https://github.com/midea-ai/kuka-code-vscode-extension) is an intelligent programming plugin based on the Kuka Code Core engine, supporting both the VSCode extension and JetBrains plugins (IntelliJ IDEA / PyCharm / GoLand / WebStorm / CLion, etc.).

<p align="center">
  <img src="https://github.com/midea-ai/kuka-code-core/releases/download/docs-assets/plan-mode.gif" alt="Kuka Code VSCode Extension"/>
</p>

### KukaClaw 

[KukaClaw](https://github.com/midea-ai/KukaClaw) is a general-purpose engineering harness for building personal AI agents.

<p align="center">
  <img src="https://github.com/midea-ai/kuka-code-core/releases/download/docs-assets/kukaclaw-intro.GIF" alt="KukaClaw"/>
</p>

### Skill Web App

A Skill web application based on Kuka Code Core, integrating Agent Skill Browser / Creator / Playground demo.

<p align="center">
  <img src="https://github.com/midea-ai/kuka-code-core/releases/download/docs-assets/skill-create.gif" alt="Skill Web App"/>
</p>

## 🚀 Quick Start

### 1. Create a project and install dependencies

```bash
mkdir my-app && cd my-app
npm init -y
npm install kuka-code
```

### 2. Download the example file

Download [quickstart.mjs](https://github.com/midea-ai/kuka-code-core/tree/main/example/quickstart.mjs) to the `my-app` directory, then modify the following two configurations:

```js
const core = new KukaCore({
  workingDir: '/path/to/your/project', // Target repository path for the Agent to operate on
  ...
});

const modelConfig = {
  apiKey: 'sk-your-api-key', // Replace with your API Key
  ...
};
```

For more model configuration options, see [Model Management](https://midea-ai.github.io/kuka-code-core/#/wiki/getting-started/basic-usage/add-new-model)

### 3. Run

```bash
node quickstart.mjs
```

<img src="https://github.com/midea-ai/kuka-code-core/releases/download/docs-assets/quick-start.gif" alt="miniCli" />

Cross-Language Integration Reference [README.md](./example/README.md)

## 🛠 Development

```bash
# 1. Install dependencies
npm install

# 2. Build
npm run build

```

## 📜 License & Third-Party Dependencies

`kuka-code` is released under the [MIT License](./LICENSE).

All production dependencies are pulled from the npm registry under permissive licenses (MIT / ISC / BSD / Apache-2.0 / BlueOak-1.0.0 / 0BSD); no copyleft (GPL / AGPL / LGPL) code is introduced. The full component list, license summary, and external service terms are tracked in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). Resolved versions are pinned via `package-lock.json` for reproducible installs and license traceability.

When calling third-party model or service APIs (Anthropic, OpenAI, OpenAI-compatible endpoints, MCP servers) through this library, the embedding application is responsible for complying with the corresponding provider's terms of service.
