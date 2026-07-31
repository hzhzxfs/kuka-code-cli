#!/usr/bin/env node
/**
 * Kuka Code — command line AI agent.
 *
 * Sub-commands
 *   cc                         Interactive chat in the current directory (default permission: Bypass)
 *   cc -p "do x"               Run a single prompt and exit
 *   cc switch                 Configure / switch the LLM provider
 *   cc models                  List configured models
 *   cc skills                  List available skills
 *   cc mcp                     List configured MCP servers
 *   cc config                  Show current configuration
 *   cc version                 Show version
 *   cc help                    Show help
 *
 * Global flags
 *   -d, --dir <path>           Working directory (default: cwd)
 *   --permission <level>       Ask | AutoEdit | AutoRun | Bypass  (default: Bypass)
 *   --bypass / --no-bypass     Force / disable all-permissions mode
 *   --resume <sessionId>       Resume a previous session
 */

import { KukaCore } from '../core/KukaCore';
import type { KukaSession } from '../core/KukaSession';
import { MAIN_AGENT_ID } from '../types';
import type { SkillConfig } from '../types/skill';
import type { MCPServerInfo } from '../types/mcp';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Small flag parser
// ---------------------------------------------------------------------------
interface ParsedArgs {
  flags: Record<string, string | boolean>;
  positionals: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (a.startsWith('-') && a.length > 1) {
      const key = a.slice(1);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(a);
    }
  }
  return { flags, positionals };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const c = {
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function getVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')
    );
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function printHelp(): void {
  console.log(`
${c.bold('Kuka Code')} — a command-line AI agent  (v${getVersion()})

${c.bold('Usage')}
  ${c.cyan('cc')}                         Start an interactive chat in the current directory
  ${c.cyan('cc')} -p "your prompt"        Run a single prompt and exit
  ${c.cyan('cc')} switch [...]            Configure / switch the LLM provider
  ${c.cyan('cc')} models                  List configured models
  ${c.cyan('cc')} skills                  List available skills
  ${c.cyan('cc')} mcp                     List configured MCP servers
  ${c.cyan('cc')} config                  Show current configuration
  ${c.cyan('cc')} version                 Show version
  ${c.cyan('cc')} help                    Show this help

${c.bold('Global flags')}
  -d, --dir <path>        Working directory (default: current directory)
  --permission <level>    Ask | AutoEdit | AutoRun | Bypass   (default: ${c.green('Bypass')})
  --bypass                Run with ALL permissions, skip every prompt (default)
  --no-bypass             Disable bypass (still auto-agrees, no interactive prompt)
  --resume <sessionId>    Resume a previous session

${c.bold('cc switch — configure an LLM')}
  ${c.cyan('cc switch')} --provider openai --model gpt-4o \\
      --base-url https://api.openai.com/v1 --api-key sk-xxx
  ${c.cyan('cc switch')} --provider anthropic --model claude-3-5-sonnet \\
      --base-url https://api.anthropic.com --api-key sk-ant-xxx

  Options:
    --provider <name>     openai | anthropic | deepseek | qwen | kimi | ... (required)
    --model <name>        model id passed to the API (required)
    --base-url <url>      custom API endpoint (required)
    --api-key <key>       API key (required; also read from KUKA_API_KEY / OPENAI_API_KEY)
    --adapt <type>        openai | anthropic (auto-inferred if omitted)
    --max-tokens <n>      default 8192
    --context-length <n>  default 128000
    --test                validate the API connection before saving (default: off)
    --set-default         also make it the active model (default: on)

${c.bold('Notes')}
  • Runs with ${c.green('Bypass')} permission by default: every tool call is allowed and no
    permission prompt is shown — it executes end-to-end without asking the user.
  • Configuration lives in ${c.cyan('~/.kuka')} (model.conf, history, skills, mcp, ...).
`);
}

function printBanner(): void {
  const art = [
    '#   # #   # #   #  ###         ####  ###  ####  #####        #### #       #   ',
    '##  # #   # ##  # #   #       #     #   # #   # #           #     #       #   ',
    '# # # #   # # # # #####       #     #   # #   # ###         #     #       #   ',
    '#  ## #   # #  ## #   #       #     #   # #   # #           #     #       #   ',
    '#   #  ###  #   # #   #        ####  ###  ####  #####        #### #####   #   ',
  ];
  console.log('');
  art.forEach((line) => console.log(c.cyan(line)));
  console.log(c.gray('  作者: xhj   ·   Kuka Code CLI v' + getVersion()));
  console.log('');
}

function inferAdapt(provider: string, baseURL: string): 'openai' | 'anthropic' {
  const p = (provider || '').toLowerCase();
  const u = (baseURL || '').toLowerCase();
  if (p.includes('anthropic') || u.includes('anthropic')) return 'anthropic';
  return 'openai';
}

// ---------------------------------------------------------------------------
// Core factory
// ---------------------------------------------------------------------------
function makeCore(workingDir: string): KukaCore {
  return new KukaCore({
    workingDir,
    logLevel: 'none',
    thinking: true,
    disableTopicDetection: true,
    disableBackgroundTasks: false,
    disabledTools: ['ask_form'],
  });
}

// ---------------------------------------------------------------------------
// Command: interactive chat / single prompt
// ---------------------------------------------------------------------------
async function cmdChat(opts: {
  workingDir: string;
  permissionLevel: 'Ask' | 'AutoEdit' | 'AutoRun' | 'Bypass';
  prompt?: string;
  resume?: string;
}): Promise<void> {
  printBanner();
  const core = makeCore(opts.workingDir);
  const result = await core.createSession(
    opts.resume ? { sessionId: opts.resume, permissionLevel: opts.permissionLevel } : { permissionLevel: opts.permissionLevel }
  );
  if (!result.ok) {
    console.error(c.red(`创建会话失败: ${result.error}`));
    process.exit(1);
  }
  const session: KukaSession = result.session!;
  // Belt-and-suspenders: ensure bypass is active.
  session.updatePermissionLevel(opts.permissionLevel);

  // Permission auto-agree (only relevant if bypass is off).
  session.on('tool:permission:request', (data: { toolId: string; toolName: string }) => {
    session.respondToToolPermission({ toolId: data.toolId, toolName: data.toolName, selected: 'agree' });
  });

  logSessionEvents(session);
  streamAssistantText(session);

  if (opts.prompt && opts.prompt.trim()) {
    await runSinglePrompt(session, opts.prompt.trim());
    await core.closeSession(session.sessionId);
    await core.dispose();
    process.exit(0);
  }

  await interactiveLoop(core, session);
}

const MAX_LOG_LEN = 200;
const truncate = (s: string, n = MAX_LOG_LEN) => (s.length > n ? `${s.slice(0, n)}...(${s.length - n} more)` : s);

function logSessionEvents(session: KukaSession): void {
  const events = [
    'tool:execution:complete',
    'tool:execution:error',
    'task:agent:start',
    'task:agent:end',
    'todos:update',
    'session:interrupted',
  ];
  events.forEach((e) =>
    session.on(e, (data: unknown) => console.log(c.gray(`${e}|${truncate(JSON.stringify(data))}`)))
  );
}

function streamAssistantText(session: KukaSession): void {
  const isMain = (agentId?: string) => agentId === MAIN_AGENT_ID || !agentId;
  let subAgentDepth = 0;
  session.on('task:agent:start', () => (subAgentDepth++));
  session.on('task:agent:end', () => {
    if (subAgentDepth > 0) subAgentDepth--;
  });
  session.on('message:text:chunk', ({ delta }: { delta: string }) => {
    if (subAgentDepth > 0 || !delta) return;
    process.stdout.write(delta);
  });
  session.on('message:complete', (d: { agentId?: string }) => {
    if (isMain(d.agentId)) process.stdout.write('\n');
  });
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function interactiveLoop(core: KukaCore, session: KukaSession): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '' });
  let interruptCount = 0;

  process.on('SIGINT', () => {
    interruptCount++;
    console.log('\n⚠️  中断会话...');
    if (interruptCount === 1 && session) session.interrupt();
    else {
      rl.close();
      process.exit(0);
    }
  });

  await new Promise<void>((resolve, reject) => {
    let awaitingInput = false;
    const askAndSend = async (): Promise<void> => {
      if (awaitingInput) return;
      awaitingInput = true;
      const input = (await prompt(rl, c.blue('\n👤 消息 (esc 中断, exit 退出): '))).trim();
      awaitingInput = false;
      if (input === 'exit' || input === 'quit') {
        resolve();
        return;
      }
      if (!input) {
        askAndSend();
        return;
      }
      process.stdout.write('\n' + c.green('🤖 Kuka: '));
      interruptCount = 0;
      session.processUserInput(input);
    };

    session.once('session:error', (data: { message: string }) => reject(new Error(data.message)));
    session.on('state:update', ({ state }: { state: string }) => {
      if (state === 'idle') askAndSend();
    });
    session.on('session:interrupted', () => askAndSend());
    session.once('session:ready', () => askAndSend());
  });

  console.log('\n=== 会话结束 ===');
  core.closeSession(session.sessionId);
  await core.dispose();
  rl.close();
  process.exit(0);
}

function runSinglePrompt(session: KukaSession, promptText: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    session.on('state:update', ({ state }: { state: string }) => {
      if (state === 'idle') finish();
    });
    session.once('session:error', (data: { message: string }) => {
      settled = true;
      reject(new Error(data.message));
    });
    process.stdout.write('\n' + c.green('🤖 Kuka: '));
    session.processUserInput(promptText);
    // Safety timeout in case the session never returns to idle.
    setTimeout(finish, 10 * 60 * 1000);
  });
}

// ---------------------------------------------------------------------------
// Command: switch (configure LLM)
// ---------------------------------------------------------------------------
async function cmdSwitch(args: ParsedArgs): Promise<void> {
  const f = args.flags;
  const workingDir = (typeof f.dir === 'string' && f.dir) || process.cwd();

  let provider = typeof f.provider === 'string' ? f.provider : '';
  let model = typeof f.model === 'string' ? f.model : '';
  let baseURL = typeof f['base-url'] === 'string' ? f['base-url'] : '';
  let apiKey =
    (typeof f['api-key'] === 'string' && f['api-key']) ||
    process.env.KUKA_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    '';
  let adapt = (typeof f.adapt === 'string' ? f.adapt : '') as 'openai' | 'anthropic' | '';
  const maxTokens = typeof f['max-tokens'] === 'string' ? parseInt(f['max-tokens'], 10) : 8192;
  const contextLength = typeof f['context-length'] === 'string' ? parseInt(f['context-length'], 10) : 128000;
  const runTest = f.test === true;
  const setDefault = f['set-default'] !== false; // default on

  // Interactive fallback for missing required values.
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string, hidden = false) =>
    new Promise<string>((res) => {
      if (hidden) {
        // crude hidden input (no raw mode); just read normally.
        rl.question(q, (ans) => res(ans.trim()));
      } else {
        rl.question(q, (ans) => res(ans.trim()));
      }
    });

  if (!provider) provider = await ask(c.blue('provider (openai/anthropic/...): '));
  if (!model) model = await ask(c.blue('model id: '));
  if (!baseURL) baseURL = await ask(c.blue('base url: '));
  if (!apiKey) apiKey = await ask(c.blue('api key: '), true);
  rl.close();

  if (!provider || !model || !baseURL || !apiKey) {
    console.error(c.red('缺少必需参数: --provider, --model, --base-url, --api-key'));
    process.exit(1);
  }
  if (!adapt) adapt = inferAdapt(provider, baseURL);

  const profileName = `${model}[${provider}]`;
  const core = makeCore(workingDir);
  try {
    const r = await core.addModel(
      {
        provider,
        modelName: model,
        baseURL,
        apiKey,
        maxTokens: Number.isFinite(maxTokens) ? maxTokens : 8192,
        contextLength: Number.isFinite(contextLength) ? contextLength : 128000,
        adapt: adapt as 'openai' | 'anthropic',
      },
      !runTest
    );
    if (setDefault) {
      await core.switchModel(profileName);
    }
    console.log(c.green(`✅ 已保存模型配置: ${profileName}`) + (setDefault ? c.gray(' (已设为默认)') : ''));
    console.log(c.gray(`当前模型: ${r.modelName}`));
    console.log(c.gray(`模型列表: ${r.modelList.join(', ')}`));
  } catch (e) {
    console.error(c.red(`配置失败: ${e instanceof Error ? e.message : String(e)}`));
    process.exit(1);
  } finally {
    await core.dispose();
  }
}

// ---------------------------------------------------------------------------
// Info commands
// ---------------------------------------------------------------------------
async function withCore<T>(workingDir: string, fn: (core: KukaCore) => Promise<T>): Promise<T> {
  const core = makeCore(workingDir);
  try {
    return await fn(core);
  } finally {
    await core.dispose();
  }
}

async function cmdModels(workingDir: string): Promise<void> {
  await withCore(workingDir, async (core) => {
    const data = await core.getModelData();
    console.log(c.bold('当前模型: ') + c.green(data.modelName || '(未配置)'));
    console.log(c.bold('已配置模型:'));
    if (data.modelList.length === 0) {
      console.log(c.gray('  (空) 用 `cc switch` 添加一个模型'));
    } else {
      data.modelList.forEach((m: string) => console.log('  • ' + (m === data.modelName ? c.green(m) : m)));
    }
  });
}

async function cmdSkills(workingDir: string): Promise<void> {
  await withCore(workingDir, async (core) => {
    const skills = await core.getSkillsInfo(true);
    console.log(c.bold(`可用 Skills (${skills.length}):`));
    if (skills.length === 0) console.log(c.gray('  (空)'));
    skills.forEach((s: SkillConfig) => console.log('  • ' + c.cyan(s.name) + c.gray(` — ${s.description || ''}`)));
  });
}

async function cmdMcp(workingDir: string): Promise<void> {
  await withCore(workingDir, async (core) => {
    const servers = await core.getMCPServerInfo();
    console.log(c.bold(`MCP 服务 (${servers.length}):`));
    if (servers.length === 0) console.log(c.gray('  (空) 用 core.addMCPServer 或配置文件添加'));
    servers.forEach((s: MCPServerInfo) =>
      console.log('  • ' + c.cyan(s.config.name) + c.gray(` [${s.status ? 'active' : 'inactive'}]`) + c.gray(` — ${s.config.description || ''}`))
    );
  });
}

async function cmdConfig(workingDir: string): Promise<void> {
  const { getKukaRootDir } = await import('../util/savePath');
  await withCore(workingDir, async (core) => {
    const data = await core.getModelData();
    console.log(c.bold('Kuka Code 配置'));
    console.log('  版本:        ' + getVersion());
    console.log('  配置根目录:  ' + c.cyan(getKukaRootDir()));
    console.log('  工作目录:    ' + c.cyan(workingDir));
    console.log('  当前模型:    ' + c.green(data.modelName || '(未配置)'));
    console.log('  权限模式:    ' + c.green('Bypass (默认，跳过所有权限检查)'));
  });
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const { flags, positionals } = parseArgs(process.argv.slice(2));
  const workingDir = (typeof flags.dir === 'string' && flags.dir) || process.cwd();

  let permissionLevel: 'Ask' | 'AutoEdit' | 'AutoRun' | 'Bypass' = 'Bypass';
  if (flags.permission) {
    const v = String(flags.permission);
    if (['Ask', 'AutoEdit', 'AutoRun', 'Bypass'].includes(v)) permissionLevel = v as any;
  }
  if (flags['no-bypass'] === true) permissionLevel = 'Ask';
  if (flags.bypass === true) permissionLevel = 'Bypass';

  const sub = positionals[0];

  switch (sub) {
    case 'switch':
      await cmdSwitch({ flags, positionals: positionals.slice(1) });
      return;
    case 'models':
      await cmdModels(workingDir);
      return;
    case 'skills':
      await cmdSkills(workingDir);
      return;
    case 'mcp':
      await cmdMcp(workingDir);
      return;
    case 'config':
      await cmdConfig(workingDir);
      return;
    case 'version':
    case '--version':
      console.log(getVersion());
      return;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return;
    default:
      await cmdChat({
        workingDir,
        permissionLevel,
        prompt: typeof flags.prompt === 'string' ? flags.prompt : typeof flags.p === 'string' ? flags.p : undefined,
        resume: typeof flags.resume === 'string' ? flags.resume : undefined,
      });
      return;
  }
}

main().catch((err) => {
  console.error(c.red('错误: ' + (err instanceof Error ? err.message : String(err))));
  process.exit(1);
});
