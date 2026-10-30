/**
 * Skill 按需分发：只在需要时提示模型通过 skill 工具加载对应 Skill。
 *
 * 约束：
 * - 提示里只出现 Skill 名称与触发原因，绝不复制 SKILL.md 正文
 * - 正文统一由 skill 工具的 tool_result 注入（loaded skills 层）
 * - 显式 /name、alias、文件类型、声明式 triggers、名称整词命中，优先级高到低
 */
import type Anthropic from '@anthropic-ai/sdk'
import { getSkillsManager } from './skillsManager'
import { resolveSkillRef, selectSkillsForTurn, skillRefKeys } from './skillRegistry'
import { getContextMode } from '../../tools/base/tools'
import { getCommandsManager } from '../commands/commandsManager'
import { getAgentsManager } from '../agents/agentsManager'
import { getStateManager } from '../../manager/StateManager'
import { logWarn } from '../../util/log'
import { REMINDER_SYS_OPEN, REMINDER_SYS_CLOSE } from '../../prompt/define'

const SYSTEM_COMMANDS = new Set(['compact', 'clear', 'quickchat'])

/** 从 /name 输入中解析显式 Skill 引用；系统命令、自定义命令、子代理名不算 */
export function parseExplicitSkillRef(input: string): string | undefined {
  const text = input.trim()
  if (!text.startsWith('/')) return undefined
  const token = text.slice(1).split(/\s+/)[0]
  if (!token || SYSTEM_COMMANDS.has(token)) return undefined
  try {
    if (getCommandsManager().getCommandConfig(token)) return undefined
    if (getAgentsManager().getAgentConfig(token)) return undefined
  } catch {
    return undefined
  }
  return resolveSkillRef(getSkillsManager().getSkillRegistry(), token)?.name
}

function formatSkillNames(names: string[]): string {
  return names.map(name => `"${name}"`).join(', ')
}

/**
 * 生成本轮的 Skill 分发提示（轻量 reminder）。
 * adaptive 模式生效；legacy 模式返回空数组，保持旧注入行为。
 */
export function buildSkillDispatchReminders(input: string, opts: { sessionId?: string } = {}): Anthropic.ContentBlockParam[] {
  try {
    if (getContextMode() === 'legacy') return []

    const registry = getSkillsManager().getSkillRegistry()
    if (registry.length === 0) return []

    const explicitRef = parseExplicitSkillRef(input)
    const selection = selectSkillsForTurn(registry, input, { explicitRef })

    // 显式写了 /name 但没有任何 Skill 命中：给出可读错误，不阻断对话
    if (!explicitRef && input.trim().startsWith('/')) {
      const token = input.trim().slice(1).split(/\s+/)[0]
      const isUnresolvedSlash = token && !SYSTEM_COMMANDS.has(token) &&
        !getCommandsManager().getCommandConfig(token) &&
        !getAgentsManager().getAgentConfig(token)
      if (isUnresolvedSlash) {
        const available = registry.map(entry => entry.name).join(', ')
        return [{
          type: 'text' as const,
          text: `${REMINDER_SYS_OPEN}\nNo skill named "${token}" is registered. Available skills: ${available || 'none'}. Continue with the user's request without loading a skill.\n${REMINDER_SYS_CLOSE}`,
        }]
      }
    }

    if (!explicitRef && selection.names.length === 0) return []

    const runtime = opts.sessionId ? getStateManager().session(opts.sessionId) : null
    const pending = selection.names.filter(name => {
      const entry = resolveSkillRef(registry, name)
      if (!entry) return false
      const canonical = skillRefKeys(entry)[0]
      return !runtime || !runtime.isSkillLoadedThisTurn(canonical)
    })
    if (pending.length === 0) return []

    const lines: string[] = []
    if (explicitRef) {
      lines.push(`The user explicitly invoked skill ${formatSkillNames(pending)}. Dispatch it with the skill tool (skill: "${pending[0]}") before answering. The skill body loads through that tool call — do not restate it from memory.`)
    } else {
      const reason = selection.reasons[0] ? ` (${selection.reasons[0]})` : ''
      lines.push(`A skill matches the current task: ${formatSkillNames(pending)}${reason}. Dispatch it with the skill tool if it applies; otherwise continue normally. Only the dispatched skill's body is loaded.`)
    }

    return [{
      type: 'text' as const,
      text: `${REMINDER_SYS_OPEN}\n${lines.join('\n')}\n${REMINDER_SYS_CLOSE}`,
    }]
  } catch (error) {
    // 路由失败只降级为不提示，保留真实错误日志（不吞错、不崩溃）
    logWarn(`Skill 分发提示生成失败: ${error instanceof Error ? error.message : String(error)}`)
    return []
  }
}
