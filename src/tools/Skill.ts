import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { Tool } from './base/Tool'
import { TOOL_DESCRIPTION } from '../prompt/tools/skill'
import { getSkillsManager } from '../services/skills/skillsManager'
import { collectSkillClosure, normalizeSkillName, resolveSkillRef } from '../services/skills/skillRegistry'
import { getContextMode } from './base/tools'
import { getStateManager } from '../manager/StateManager'
import { TOOL_NAME_SKILL } from '../prompt/tool'
import { logWarn } from '../util/log'

const TOOL_NAME = TOOL_NAME_SKILL
// 辅助函数：生成显示标题
function getTitle(input?: { skill?: string; args?: string }) {
  if (input?.skill) {
    const parts = [`skill: "${input.skill}"`]
    if (input.args) {
      parts.push(`args: "${input.args}"`)
    }
    return parts.join(', ')
  }
  return TOOL_NAME
}

const toolParams = z.strictObject({
  skill: z.string().describe('Name of the skill to invoke (e.g. "commit", "review-pr", "pdf")'),
  args: z.string().optional().describe('Extra arguments to pass to the skill, if any'),
})

type ToolRes = {
  name: string
  description: string
  systemPrompt: string  // skill 自身的系统提示（skillConfig.prompt 原文）
  filePath?: string
  /** 本轮已加载过，正文未重复注入 */
  alreadyLoaded?: boolean
  /** 显式依赖的辅助 Skill */
  dependencies?: string[]
  /** 循环依赖（已跳过） */
  cycles?: string[]
}

function availableSkillNames(): string {
  return getSkillsManager().getSkillRegistry().map(entry => entry.name).join(', ')
}

export const Skill = {
  name: TOOL_NAME,
  description() {
    return TOOL_DESCRIPTION
  },
  toolParams,
  isSafe() {
    return false
  },
  async validateInput({ skill }: z.infer<typeof toolParams>) {
    try {
      const resolved = getSkillsManager().resolveSkillName(skill)

      if (!resolved) {
        return {
          result: false,
          message: `No skill named "${skill}". Available: ${availableSkillNames() || 'none'}.`,
        }
      }

      return { result: true }
    } catch (error) {
      return {
        result: false,
        message: `Skill system is not yet initialized: ${error}`,
      }
    }
  },
  genToolPermission({ skill }: z.infer<typeof toolParams>) {
    const resolved = getSkillsManager().resolveSkillName(skill)
    const skillConfig = resolved ? getSkillsManager().getSkillConfig(resolved) : undefined

    if (!skillConfig) {
      throw new Error(`No skill named "${skill}" was found.`)
    }

    return {
      title: skillConfig.name,
      content: skillConfig.prompt,
    }
  },
  genToolResultMessage({ name, description, systemPrompt, filePath }: ToolRes) {
    const title = name
    const summary = filePath ?? `Skill "${name}" is now active.`

    const preview = systemPrompt.length > 8000
      ? systemPrompt.substring(0, 8000) + '...'
      : systemPrompt
    const content = `${description}\n\n${preview}`

    return {
      title,
      summary,
      content,
    }
  },
  getDisplayTitle(input) {
    return getTitle(input)
  },
  async *call({ skill, args }: z.infer<typeof toolParams>, agentContext?: any) {
    const manager = getSkillsManager()
    const adaptive = getContextMode() === 'adaptive'
    const resolvedName = manager.resolveSkillName(skill)

    if (!resolvedName) {
      throw new Error(`No skill named "${skill}". Available: ${availableSkillNames() || 'none'}.`)
    }

    const skillConfig = await manager.getSkillConfigFresh(resolvedName)
    if (!skillConfig) {
      throw new Error(`Skill "${resolvedName}" could not be loaded from its SKILL.md. Available: ${availableSkillNames() || 'none'}.`)
    }

    const runtime = agentContext?.sessionId ? getStateManager().session(agentContext.sessionId) : null
    const canonical = normalizeSkillName(skillConfig.name)

    // 同一轮同一 Skill 只注入一次正文（alias 归一化后去重）
    if (adaptive && runtime && !runtime.markSkillLoaded(canonical)) {
      const output: ToolRes = {
        name: skillConfig.name,
        description: skillConfig.description,
        systemPrompt: skillConfig.prompt,
        filePath: skillConfig.filePath,
        alreadyLoaded: true,
      }
      yield {
        type: 'result' as const,
        resultForAssistant: `Skill "${output.name}" is already active in this turn. Continue with the current instructions; the body was not injected again.`,
        data: output,
      }
      return
    }

    const trimmedArgs = args?.trim()
    const renderContent = (config: typeof skillConfig): string => {
      let textContent = config.prompt
      if (trimmedArgs && config.name === skillConfig.name) {
        if (textContent.includes('$ARGUMENTS')) {
          textContent = textContent.replaceAll('$ARGUMENTS', trimmedArgs)
        } else {
          textContent = `${textContent}\n\nARGUMENTS: ${trimmedArgs}`
        }
      }
      return config.filePath
        ? `Skill’s base path: ${config.filePath}\n\n${textContent}`
        : textContent
    }

    const blocks: Anthropic.ContentBlockParam[] = [
      { type: 'text' as const, text: renderContent(skillConfig) },
    ]

    // 显式依赖：depth<=2、规范化去重、循环检测，失败降级为提示而不是崩溃
    const closure = collectSkillClosure(manager.getSkillRegistry(), [skillConfig.name], {
      maxDepth: 2,
      requires: name => manager.getSkillConfig(manager.resolveSkillName(name) ?? name)?.requires ?? [],
    })
    const dependencies: string[] = []
    for (const depName of closure.names.slice(1)) {
      try {
        if (runtime && adaptive && !runtime.isSkillLoadedThisTurn(normalizeSkillName(depName))) {
          runtime.markSkillLoaded(normalizeSkillName(depName))
        }
        const depConfig = await manager.getSkillConfigFresh(depName)
        if (!depConfig) continue
        dependencies.push(depConfig.name)
        blocks.push({
          type: 'text' as const,
          text: `Skill "${depConfig.name}" is now active as a dependency of "${skillConfig.name}".\n\n${renderContent(depConfig)}`,
        })
      } catch (error) {
        logWarn(`Skill 依赖加载失败 [${skillConfig.name} -> ${depName}]: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (closure.cycles.length > 0) {
      blocks.push({
        type: 'text' as const,
        text: `Skill dependency cycle detected and skipped: ${closure.cycles.join('; ')}`,
      })
    }

    if (runtime) {
      const bodyChars = blocks.reduce((total, block) => total + (block.type === 'text' ? block.text.length : 0), 0)
      runtime.addLoadedSkillChars(bodyChars)
    }

    const output: ToolRes = {
      name: skillConfig.name,
      description: skillConfig.description,
      systemPrompt: skillConfig.prompt,
      filePath: skillConfig.filePath,
      ...(dependencies.length > 0 ? { dependencies } : {}),
      ...(closure.cycles.length > 0 ? { cycles: closure.cycles } : {}),
    }

    yield {
      type: 'result' as const,
      resultForAssistant: this.genResultForAssistant(output),
      data: output,
      additionalBlocks: blocks,
    }
  },
  genResultForAssistant(output: ToolRes): string {
    const deps = output.dependencies?.length ? ` (dependencies: ${output.dependencies.join(', ')})` : ''
    return `Activating skill: ${output.name}${deps}`
  },
} satisfies Tool<typeof toolParams, ToolRes>
