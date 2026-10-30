/**
 * 最终请求边界守卫：在 provider adapter 构造请求体之前执行。
 *
 * 这里看到的 messages/tools 就是即将交给 SDK/HTTP client 的对象，禁止再回查全局 registry 添加工具。
 * 规则：
 * - adaptive：tools 仅保留本轮所选工具；simple 轮次首轮仅 run_shell，tool result 之后为空
 * - adaptive：移除任何 "Available skills" 全量 Skill 提醒块
 * - legacy：不做任何裁剪
 */
import type { UserMsg, AiMessage } from '../../types/message'
import type { Tool } from '../../tools/base/Tool'
import { getStateManager } from '../../manager/StateManager'
import { getContextMode } from '../../tools/base/tools'

export type RequestPhase = 'initial' | 'tool_continuation'

export interface GuardedRequest {
  messages: (UserMsg | AiMessage)[]
  tools: Tool[]
  phase: RequestPhase
  skillsReminderRemoved: boolean
}

type AnyMessage = UserMsg | AiMessage

function hasToolResult(content: any): boolean {
  if (!Array.isArray(content)) return false
  return content.some(block => block?.type === 'tool_result')
}

export function detectRequestPhase(messages: AnyMessage[]): RequestPhase {
  return messages.some(message => message.type === 'user' && hasToolResult(message.message.content))
    ? 'tool_continuation'
    : 'initial'
}

function stripSkillsReminder(messages: AnyMessage[]): { messages: AnyMessage[]; removed: boolean } {
  let removed = false
  const result: AnyMessage[] = []

  for (const message of messages) {
    const content = message.message.content as any
    if (typeof content === 'string') {
      if (!content.includes('Available skills')) {
        result.push(message)
        continue
      }
      removed = true
      const cleaned = content
        .replace(/<reminder-sys>[\s\S]*?Available skills[\s\S]*?<\/reminder-sys>/g, '')
        .trim()
      if (cleaned) result.push({ ...message, message: { ...message.message, content: cleaned } } as AnyMessage)
      continue
    }
    if (!Array.isArray(content)) {
      result.push(message)
      continue
    }
    const blocks = content.filter(block => {
      const isSkillsReminder = block?.type === 'text' &&
        typeof block.text === 'string' &&
        block.text.includes('Available skills')
      if (isSkillsReminder) removed = true
      return !isSkillsReminder
    })
    if (blocks.length === content.length) {
      result.push(message)
    } else if (blocks.length > 0) {
      result.push({ ...message, message: { ...message.message, content: blocks } } as AnyMessage)
    }
    // 整条消息只剩被移除的提醒时直接丢弃
  }

  return { messages: result, removed }
}

export function guardFinalRequest(
  messages: AnyMessage[],
  tools: Tool[],
  sessionId?: string,
): GuardedRequest {
  const phase = detectRequestPhase(messages)
  if (getContextMode() === 'legacy' || !sessionId) {
    return { messages, tools, phase, skillsReminderRemoved: false }
  }

  let finalTools = tools
  try {
    const runtime = getStateManager().session(sessionId)
    const policy = runtime.getTurnToolPolicy()

    if (policy === 'simple') {
      finalTools = phase === 'tool_continuation'
        ? []
        : tools.filter(tool => tool.name === 'run_shell').slice(0, 1)
    } else {
      // 只允许本轮已选中的工具，防止上游意外带入全量工具
      const selected = new Set(runtime.getTurnSelectedTools())
      if (selected.size > 0) {
        finalTools = tools.filter(tool => selected.has(tool.name))
      }
    }
  } catch {
    // 状态不可用时保持传入值，避免请求失败
  }

  const stripped = stripSkillsReminder(messages)
  return {
    messages: stripped.messages,
    tools: finalTools,
    phase,
    skillsReminderRemoved: stripped.removed,
  }
}
