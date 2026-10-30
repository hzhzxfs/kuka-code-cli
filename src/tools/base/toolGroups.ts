/**
 * 工具逻辑分组与按需选择（纯函数，不读配置、不访问网络）
 *
 * 约束：
 * - 不改变工具名、参数 schema、返回格式与权限校验
 * - 未加载的工具仍可通过 load_tools 的能力发现名单得知
 * - 低置信度时保守地多带一个 coding 组，绝不静默丢失能力
 */
import {
  TOOL_NAME_VIEW_FILE,
  TOOL_NAME_RUN_SHELL,
  TOOL_NAME_SEARCH_FILES,
  TOOL_NAME_SEARCH_CONTENT,
  TOOL_NAME_WRITE_FILE,
  TOOL_NAME_PATCH_FILE,
  TOOL_NAME_FETCH_URL,
  TOOL_NAME_PICK_OPTION,
  TOOL_NAME_SKILL,
  TOOL_NAME_SUB_AGENT,
  TOOL_NAME_PEEK_BG_JOB,
  TOOL_NAME_STOP_BG_JOB,
  TOOL_NAME_EDIT_NOTEBOOK,
  TOOL_NAME_PLAN_TO_AGENT,
  TOOL_NAME_CREATE_TODO,
  TOOL_NAME_GET_TODO,
  TOOL_NAME_LIST_TODOS,
  TOOL_NAME_UPDATE_TODO,
  TOOL_NAME_CREATE_CRON,
  TOOL_NAME_DEL_CRON,
  TOOL_NAME_LIST_CRONS,
} from '../../prompt/tool'

export type ToolGroup = 'core' | 'coding' | 'documents' | 'automation' | 'mcp' | 'internal'

export const TOOL_GROUP_ORDER: ToolGroup[] = ['core', 'coding', 'documents', 'automation', 'mcp', 'internal']

/** 内置工具 → 组。documents 能力由同名 Skill（pdf/docx/pptx/xlsx）提供，无内置工具 */
export const BUILTIN_TOOL_GROUPS: Record<Exclude<ToolGroup, 'mcp' | 'internal'>, string[]> = {
  core: [
    TOOL_NAME_RUN_SHELL,
    TOOL_NAME_SEARCH_FILES,
    TOOL_NAME_SEARCH_CONTENT,
    TOOL_NAME_VIEW_FILE,
    TOOL_NAME_WRITE_FILE,
    TOOL_NAME_PATCH_FILE,
    TOOL_NAME_FETCH_URL,
    TOOL_NAME_PICK_OPTION,
    TOOL_NAME_SKILL,
  ],
  coding: [
    TOOL_NAME_SUB_AGENT,
    TOOL_NAME_PLAN_TO_AGENT,
    TOOL_NAME_PEEK_BG_JOB,
    TOOL_NAME_STOP_BG_JOB,
    TOOL_NAME_EDIT_NOTEBOOK,
    TOOL_NAME_CREATE_TODO,
    TOOL_NAME_GET_TODO,
    TOOL_NAME_LIST_TODOS,
    TOOL_NAME_UPDATE_TODO,
  ],
  documents: [],
  automation: [
    TOOL_NAME_CREATE_CRON,
    TOOL_NAME_DEL_CRON,
    TOOL_NAME_LIST_CRONS,
  ],
}

/** 简单请求的最小工具集：只保留读/搜/shell，不发送写文件与交互类 schema */
export const TOOL_GROUP_DESCRIPTIONS: Record<ToolGroup, string> = {
  core: 'basic file read/search/edit and shell',
  coding: 'code exploration, sub-agents, todos, notebooks, background jobs',
  documents: 'PDF/DOCX/PPTX/XLSX handling via the matching skill',
  automation: 'cron jobs, reminders and scheduling',
  mcp: 'configured MCP server tools',
  internal: 'tool discovery and loading',
}

/** 工具名 → 所属组。MCP 工具（mcp__ 前缀）一律归 mcp */
export function getToolGroup(name: string): ToolGroup {
  if (name.startsWith('mcp__')) return 'mcp'
  for (const group of ['core', 'coding', 'automation'] as const) {
    if (BUILTIN_TOOL_GROUPS[group].includes(name)) return group
  }
  return 'core'
}

const AUTOMATION_RE = /(定时|提醒|每天|每周|每月|周期任务|计划任务)|\b(cron|scheduler|scheduling|schedule|reminder|reminders|remind|timer)\b/i
const CODING_RE = /(代码|函数|接口|报错|异常|编译|构建|测试|重构|实现|修复|仓库|模块|单元测试|类型检查|依赖|脚本|数据库|接口文档)|\b(bug|fix|refactor|implement|test|tests|testing|compile|build|error|exception|function|class|interface|api|git|commit|merge|diff|debug|repo|module|lint|typescript|javascript|python|java|golang|rust|sql)\b/i
const DOCUMENT_RE = /\.(pdf|docx?|xlsx?|pptx?)\b|(文档|表格|幻灯片|演示文稿|工作簿)|\b(pdf|docx|doc|xlsx|xls|pptx|ppt|word|excel|powerpoint|slides?|spreadsheet|workbook)\b/i
const MCP_RE = /\bmcp\b|model context protocol/i

/** 简单请求类型：只发送完成该单步任务所需的最小工具集 */
export type SimpleKind = 'time' | 'greeting' | 'read-file' | 'search'

const TIME_RE = /^(现在|当前)?(的)?(系统)?(时间|日期|几号|几点)(是|为)?(多少|什么|？|\?|$)|^(what('| i)?s|tell me) the (current )?(time|date)/i
const GREETING_RE = /^(hi|hello|hey|你好|您好|谢谢|多谢|thanks?|thx)[!.。！\s]*$/i
const READ_FILE_RE = /^(看看|查看|读取|打开|read|show|cat|open)\s+[\x60"']?[\w./~-]+\.(ts|tsx|js|json|md|txt|py|go|java|css|html|ya?ml|toml|sh|rs|c|cpp|h)\b/i
const SEARCH_RE = /^(搜索|查找|找一下|search|grep|find|locate)\s+\S+/i

/** 判断简单请求类型；未命中返回 undefined（不做语义猜测） */
export function detectSimpleKind(input: string): SimpleKind | undefined {
  const text = (input || '').trim()
  if (!text) return undefined
  if (TIME_RE.test(text)) return 'time'
  if (GREETING_RE.test(text)) return 'greeting'
  if (READ_FILE_RE.test(text) && text.length <= 120) return 'read-file'
  if (SEARCH_RE.test(text) && text.length <= 80 && !/修改|实现|重构|修复|refactor|implement|fix/i.test(text)) {
    return 'search'
  }
  return undefined
}

/** 判断输入是否为简单的单步请求（时间查询、问候、读取单个文件、简单搜索） */
export function isSimpleRequest(input: string): boolean {
  return detectSimpleKind(input) !== undefined
}

/** 简单请求的最小工具集：时间查询只保留 run_shell */
export const SIMPLE_TOOLS: Record<SimpleKind, string[]> = {
  time: [TOOL_NAME_RUN_SHELL],
  greeting: [TOOL_NAME_RUN_SHELL],
  'read-file': [TOOL_NAME_VIEW_FILE],
  search: [TOOL_NAME_SEARCH_CONTENT, TOOL_NAME_SEARCH_FILES],
}

export interface ToolGroupDetection {
  groups: ToolGroup[]
  confidence: 'high' | 'low'
  basis: 'simple' | 'detected' | 'fallback'
  reasons: string[]
  /** 简单请求类型（basis=simple 时存在） */
  simpleKind?: SimpleKind
}

/** 确定性分组识别：不做语义猜测；未命中且非简单请求 → 低置信度回退 */
export function detectToolGroups(input: string, mcpServerNames: string[] = []): ToolGroupDetection {
  const text = input || ''
  const groups = new Set<ToolGroup>(['core'])
  const reasons: string[] = []

  const simpleKind = detectSimpleKind(text)
  if (simpleKind) {
    return { groups: ['core'], confidence: 'high', basis: 'simple', reasons: ['simple request: ' + simpleKind], simpleKind }
  }

  if (CODING_RE.test(text)) {
    groups.add('coding')
    reasons.push('coding task')
  }
  if (DOCUMENT_RE.test(text)) {
    groups.add('documents')
    reasons.push('document task')
  }
  if (AUTOMATION_RE.test(text)) {
    groups.add('automation')
    reasons.push('automation task')
  }

  const mentionsMcp = MCP_RE.test(text) ||
    mcpServerNames.some(server => server.length >= 3 && new RegExp(`(?<![\\w-])${escapeRegExp(server)}(?![\\w-])`, 'i').test(text))
  if (mentionsMcp) {
    groups.add('mcp')
    reasons.push('mcp task')
  }

  if (groups.size === 1) {
    // 低置信度：保守地多带一个相关工具组（coding），并通过 load_tools 暴露其余能力
    groups.add('coding')
    return { groups: sortGroups(groups), confidence: 'low', basis: 'fallback', reasons: ['low confidence fallback: +coding'] }
  }

  return { groups: sortGroups(groups), confidence: 'high', basis: 'detected', reasons }
}

function sortGroups(groups: Set<ToolGroup>): ToolGroup[] {
  return TOOL_GROUP_ORDER.filter(group => groups.has(group))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface ToolSelectionParams {
  input: string
  availableNames: string[]
  mcpServerNames?: string[]
  mode: 'legacy' | 'adaptive'
  /** 上一轮实际使用过的组（任务连续性：不立即卸载） */
  carriedGroups?: ToolGroup[]
  /** 会话内通过 load_tools 显式加载的工具名（append-only） */
  loadedNames?: string[]
  /** 是否存在延迟池（决定是否注入 load_tools 发现能力） */
  hasDeferred?: boolean
}

export interface ToolSelection {
  names: string[]
  groups: ToolGroup[]
  basis: 'legacy' | 'simple' | 'detected' | 'fallback'
  confidence: 'high' | 'low'
  reasons: string[]
}

/**
 * 计算本轮发给 LLM 的工具名序列。
 * - legacy：全部可用工具（保持原有行为）
 * - adaptive：core + 命中的组 + 上一轮仍在使用的组 + 已显式加载的工具
 * 顺序固定为组序 + 可用工具原序，保证同一轮多次组装结果稳定
 */
export function selectToolsForTurn(params: ToolSelectionParams): ToolSelection {
  const available = params.availableNames
  const availableSet = new Set(available)
  const loaded = (params.loadedNames ?? []).filter(name => availableSet.has(name))

  if (params.mode === 'legacy') {
    return {
      names: unique([...available]),
      groups: collectGroups(available),
      basis: 'legacy',
      confidence: 'high',
      reasons: ['legacy mode'],
    }
  }

  const detection = detectToolGroups(params.input, params.mcpServerNames)

  // 简单单步请求：只发送完成该任务所需的最小工具集，不附加 load_tools 与已加载段
  if (detection.basis === 'simple') {
    const minimal = SIMPLE_TOOLS[detection.simpleKind ?? 'time'] ?? [TOOL_NAME_RUN_SHELL]
    const names = minimal.filter(name => availableSet.has(name))
    return {
      names,
      groups: ['core'],
      basis: 'simple',
      confidence: 'high',
      reasons: detection.reasons,
    }
  }

  const groups = new Set<ToolGroup>(detection.groups)
  for (const group of params.carriedGroups ?? []) groups.add(group)

  const selected = new Set<string>()
  const names: string[] = []
  for (const group of TOOL_GROUP_ORDER) {
    if (group === 'internal' || !groups.has(group)) continue
    for (const name of available) {
      if (getToolGroup(name) !== group || selected.has(name)) continue
      selected.add(name)
      names.push(name)
    }
  }

  // 显式加载的工具始终保留（append-only，保持前缀缓存稳定）
  for (const name of loaded) {
    if (selected.has(name)) continue
    selected.add(name)
    names.push(name)
  }

  return {
    names,
    groups: sortGroups(groups),
    basis: detection.basis,
    confidence: detection.confidence,
    reasons: detection.reasons,
  }
}

/** 工具名集合 → 组集合（用于沿用上一轮工具） */
export function collectGroups(names: string[]): ToolGroup[] {
  const groups = new Set<ToolGroup>()
  names.forEach(name => groups.add(getToolGroup(name)))
  return sortGroups(groups)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
