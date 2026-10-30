/**
 * adaptive 最终 payload 诊断日志（仅 debug 级别输出）
 *
 * 只记录大小/名称/计数，不记录 prompt 正文、密钥或工具参数。
 */
import type { Message, UserMsg, AiMessage } from '../../types/message'
import type { Tool } from '../../tools/base/Tool'
import { buildTools, getContextMode } from '../../tools/base/tools'
import { getStateManager } from '../../manager/StateManager'
import { getConfManager } from '../../manager/ConfManager'
import { getSkillsManager } from '../skills/skillsManager'
import { logInfo } from '../../util/log'

export interface PayloadDiagnostics {
  mode: string
  matchedSkillNames: string[]
  selectedToolNames: string[]
  messageChars: number
  skillRegistryChars: number
  loadedSkillChars: number
  toolSchemaChars: number
  toolsCount: number
  fallbackReason: string
}

export function isDebugLogging(): boolean {
  return getConfManager().getCoreConfig()?.logLevel === 'debug'
}

export function buildPayloadDiagnostics(
  sessionId: string,
  messages: (UserMsg | AiMessage)[],
  tools: Tool[],
): PayloadDiagnostics {
  const runtime = getStateManager().session(sessionId)
  const registry = getSkillsManager().getSkillRegistry()
  return {
    mode: getContextMode(),
    matchedSkillNames: runtime.getTurnMatchedSkills(),
    selectedToolNames: tools.map(tool => tool.name),
    messageChars: JSON.stringify(messages).length,
    skillRegistryChars: JSON.stringify(registry).length,
    loadedSkillChars: runtime.getLoadedSkillChars(),
    toolSchemaChars: JSON.stringify(buildTools(tools)).length,
    toolsCount: tools.length,
    fallbackReason: runtime.getTurnSelectionReason() || 'none',
  }
}

/** 在最终 provider 请求前调用：debug 模式输出一行结构化诊断 */
export function logPayloadDiagnostics(
  sessionId: string,
  messages: (UserMsg | AiMessage)[] | Message[],
  tools: Tool[],
): void {
  if (!isDebugLogging()) return
  try {
    logInfo('[payload] ' + JSON.stringify(buildPayloadDiagnostics(sessionId, messages as (UserMsg | AiMessage)[], tools)))
  } catch {
    // 诊断失败不影响请求
  }
}


let entryLogged = false

/** 仅 debug 模式输出一次实际入口与构建标识 */
function logEntryOnce(): void {
  if (entryLogged) return
  entryLogged = true
  try {
    const pkg = require('../../../package.json')
    logInfo('[llm-entry] ' + JSON.stringify({
      entry: process.argv[1] || 'unknown',
      version: pkg?.version || 'unknown',
      node: process.version,
    }))
  } catch {
    logInfo('[llm-entry] ' + JSON.stringify({ entry: process.argv[1] || 'unknown', version: 'unknown', node: process.version }))
  }
}

/**
 * 发送边界日志：数据全部来自最终 requestBody（转换后的 messages/tools）。
 */
export function logFinalRequestBoundary(body: any, sessionId?: string): void {
  if (!isDebugLogging()) return
  try {
    const runtime = sessionId ? getStateManager().session(sessionId) : null
    const bodyMessages = body?.messages || []
    const bodyTools = body?.tools || []
    const phase = (bodyMessages as any[]).some(message =>
      message?.role === 'tool' ||
      (Array.isArray(message?.content) && message.content.some((block: any) => block?.type === 'tool_result'))
    ) ? 'tool_continuation' : 'initial'
    logEntryOnce()
    logInfo('[llm-boundary] ' + JSON.stringify({
      requestPhase: phase,
      stream: body?.stream === true,
      loadingMode: getContextMode(),
      selectedSkills: runtime ? runtime.getTurnMatchedSkills() : [],
      selectedTools: runtime ? runtime.getTurnSelectedTools() : [],
      finalTools: bodyTools.map((tool: any) => tool?.function?.name || tool?.name).filter(Boolean),
      finalMessageChars: JSON.stringify(bodyMessages).length,
      finalToolSchemaChars: JSON.stringify(bodyTools).length,
      fullSkillsReminderIncluded: JSON.stringify(body).includes('Available skills'),
      fallbackReason: runtime ? (runtime.getTurnSelectionReason() || 'none') : 'none',
    }))
  } catch {
    // 诊断失败不影响请求
  }
}
