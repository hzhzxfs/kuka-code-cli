import Anthropic from '@anthropic-ai/sdk'
import * as path from 'path'
import { getConfManager } from '../../manager/ConfManager'
import { getSkillTypesDescription } from '../skills/skillsManager'
import { getContextMode } from '../../tools/base/tools'
import { getMemoryDescription } from '../memory/memManager'
import { getRuleDescription } from '../rules/rulesManager'
import { readInitialCwd } from '../../util/cwd'
import { PLAN_MODE_SYSTEM_REMINDER_PROMPT } from '../../prompt/plan'
import { REMINDER_SYS_OPEN, REMINDER_SYS_CLOSE } from '../../prompt/define'

export function generateSkillsReminder(): Anthropic.ContentBlockParam[] {
  // legacy：保持原有 name: description 全量清单
  if (getContextMode() === 'legacy') {
    const skillsDesc = getSkillTypesDescription()
    if (!skillsDesc) return []
    return [{
      type: 'text' as const,
      text: `${REMINDER_SYS_OPEN}\nAvailable skills (invoke via the skill tool):\n\n${skillsDesc}\n${REMINDER_SYS_CLOSE}`
    }]
  }

  // adaptive：不注入任何 Available skills 列表；Skill 只通过匹配提示 + skill 工具按需加载
  return []
}

export function generateRulesReminders(): Anthropic.ContentBlockParam[] {
  const configManager = getConfManager()
  const customRules = configManager.getCoreConfig()?.customRules ?? ''
  const customRulesSection = customRules ? `Custom rules (user-defined instructions):\n\n${customRules}` : ''
  const ruleSection = getRuleDescription()
  const memorySection = getMemoryDescription()

  if (!customRulesSection && !ruleSection && !memorySection) {
    return []
  }

  const dateStr = new Date().toISOString().slice(0, 10)
  const sections = [customRulesSection, ruleSection, memorySection, `# Date\nCurrent date: ${dateStr}`]
    .filter(Boolean)
    .join('\n\n')

  const rulesReminder = `${REMINDER_SYS_OPEN}
The following session context should be applied when relevant — it takes precedence over default behavior.

${sections}
${REMINDER_SYS_CLOSE}`

  return [{
    type: 'text' as const,
    text: rulesReminder
  }]
}

export function generatePlanReminders(): Anthropic.ContentBlockParam[] {
  const currentDir = readInitialCwd()
  const plansDir = path.join(currentDir, '.kukacode/', 'plans/')

  const rulesReminder = PLAN_MODE_SYSTEM_REMINDER_PROMPT(plansDir)

  return [{ type: 'text' as const, text: rulesReminder }]
}
