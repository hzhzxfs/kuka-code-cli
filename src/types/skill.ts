/**
 * Skill 系统类型定义
 */

export type SkillScope = 'user' | 'project' | 'plugin'

/** auto：允许确定性触发（显式触发条件/文件类型）；manual：仅在显式调用时加载 */
export type SkillLoadMode = 'auto' | 'manual'

export interface SkillConfig {
  name: string
  description: string
  prompt: string
  locate?: SkillScope
  filePath?: string
  /** 轻量摘要（缺省取 description 首行） */
  summary?: string
  /** 分类（缺省 general） */
  category?: string
  /** 确定性触发词（缺省空，不做自动匹配） */
  triggers?: string[]
  /** 兼容别名（缺省空） */
  aliases?: string[]
  /** 加载模式（缺省 auto，但无 triggers 时不会自动加载） */
  loadMode?: SkillLoadMode
  /** 职责正交的依赖 Skill（缺省空，加载深度上限 2） */
  requires?: string[]
  /** 解析时的文件 mtime，用于显式加载前的失效判断 */
  fileMtimeMs?: number
}

/** 轻量 Skill registry 条目：不含 SKILL.md 正文 */
export interface SkillRegistryEntry {
  name: string
  summary: string
  category: string
  triggers: string[]
  aliases: string[]
  loadMode: SkillLoadMode
  sourcePath?: string
}
