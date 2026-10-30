/**
 * Skill registry 与确定性匹配（纯函数，不读文件、不调模型）
 *
 * 原则：
 * - registry 只携带轻量元数据，绝不包含 SKILL.md 正文
 * - 自动匹配仅做确定性判断：显式 /name、文件类型、声明式 triggers、名称/别名整词命中
 * - 低置信度不自动加载，交由模型通过 skill 工具显式请求
 */
import type { SkillConfig, SkillRegistryEntry } from '../../types/skill'

/** 文档类文件格式 → 候选 Skill 名（按格式精确加载，不加载全部文档能力） */
export const DOCUMENT_FORMAT_SKILLS: Record<string, string> = {
  pdf: 'pdf',
  doc: 'docx',
  docx: 'docx',
  ppt: 'pptx',
  pptx: 'pptx',
  xls: 'xlsx',
  xlsx: 'xlsx',
}

const SUMMARY_MAX_CHARS = 160

/** 名称规范化：去 /、小写、空格/下划线转连字符；alias 去重以此为准 */
export function normalizeSkillName(name: string): string {
  return name
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
}

/** 取 description 首行/首句作为轻量摘要 */
export function toSkillSummary(description: string, limit = SUMMARY_MAX_CHARS): string {
  const firstLine = (description || '').trim().split(/\r?\n/)[0].trim()
  const firstSentence = firstLine.split(/(?<=[.!?。！？])\s+/)[0] || firstLine
  return firstSentence.length > limit ? firstSentence.slice(0, limit).trimEnd() + '…' : firstSentence
}

/** 由 SkillConfig 生成轻量 registry 条目（剔除正文） */
export function buildSkillRegistry(configs: SkillConfig[]): SkillRegistryEntry[] {
  return configs.map(config => ({
    name: config.name,
    summary: config.summary?.trim() || toSkillSummary(config.description),
    category: config.category?.trim() || 'general',
    triggers: config.triggers ? [...config.triggers] : [],
    aliases: config.aliases ? [...config.aliases] : [],
    loadMode: config.loadMode === 'manual' ? 'manual' : 'auto',
    sourcePath: config.filePath,
  }))
}

/** 名称或别名的全部规范化候选（含插件前缀名去掉插件段后的短名） */
export function skillRefKeys(entry: SkillRegistryEntry): string[] {
  const keys = new Set<string>()
  const add = (value?: string) => {
    if (!value) return
    const normalized = normalizeSkillName(value)
    if (normalized) keys.add(normalized)
    const colon = normalized.lastIndexOf(':')
    if (colon >= 0 && colon < normalized.length - 1) keys.add(normalized.slice(colon + 1))
  }
  add(entry.name)
  entry.aliases.forEach(add)
  return [...keys]
}

/** 按名称/别名解析 Skill（规范化名称匹配，alias 不重复命中） */
export function resolveSkillRef(registry: SkillRegistryEntry[], ref: string): SkillRegistryEntry | undefined {
  const target = normalizeSkillName(ref)
  if (!target) return undefined
  return registry.find(entry => skillRefKeys(entry).includes(target))
}

/** 输入中出现的文档格式（pdf/docx/pptx/xlsx 等） */
export function detectDocumentFormats(input: string): string[] {
  const formats = new Set<string>()
  const extRe = /\.(pdf|docx?|xlsx?|pptx?)\b/gi
  let match: RegExpExecArray | null
  while ((match = extRe.exec(input)) !== null) {
    const format = match[1].toLowerCase()
    formats.add(DOCUMENT_FORMAT_SKILLS[format] || format)
  }
  for (const format of Object.values(DOCUMENT_FORMAT_SKILLS)) {
    if (new RegExp(`\\b${format}\\b`, 'i').test(input)) formats.add(format)
  }
  return [...formats]
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 整词/短语命中（ASCII 用词边界，中文用子串） */
export function matchesTrigger(input: string, trigger: string): boolean {
  const value = trigger.trim()
  if (!value) return false
  const normalized = value.replace(/^\./, '')
  if (/^[\x00-\x7F]+$/.test(normalized)) {
    return new RegExp(`(?<![\\w-])${escapeRegExp(normalized)}(?![\\w-])`, 'i').test(input)
  }
  return input.includes(normalized)
}

export interface SkillSelection {
  names: string[]
  reasons: string[]
  /** explicit=用户显式调用；file-type=文件类型；trigger=声明式触发；name=名称整词命中 */
  basis: 'explicit' | 'file-type' | 'trigger' | 'name' | 'none'
}

export interface SkillSelectOptions {
  /** 显式调用的 Skill 引用（/name 或 alias） */
  explicitRef?: string
  /** 每轮自动加载上限：1 个主 Skill + 1 个正交辅助 Skill */
  maxAuto?: number
  /** 额外候选（例如已被工具调用标记的辅助 Skill），按优先级追加 */
  extraNames?: string[]
}

/**
 * 选择本轮应提示加载的 Skill（不加载正文，只返回名字）。
 * 优先级：显式名称/alias > 文件类型 > 声明式 triggers > 名称整词命中 > 不加载
 */
export function selectSkillsForTurn(
  registry: SkillRegistryEntry[],
  input: string,
  options: SkillSelectOptions = {},
): SkillSelection {
  if (options.explicitRef) {
    const explicit = resolveSkillRef(registry, options.explicitRef)
    return explicit
      ? { names: [explicit.name], reasons: [`explicit: ${options.explicitRef}`], basis: 'explicit' }
      : { names: [], reasons: [], basis: 'none' }
  }

  const maxAuto = options.maxAuto ?? 1
  const picked: string[] = []
  const reasons: string[] = []
  let basis: SkillSelection['basis'] = 'none'
  const push = (name: string, reason: string, reasonBasis: SkillSelection['basis']) => {
    if (picked.length >= maxAuto) return
    const entry = registry.find(item => item.name === name)
    if (!entry || picked.some(existing => normalizeSkillName(existing) === normalizeSkillName(name))) return
    picked.push(name)
    reasons.push(reason)
    if (basis === 'none') basis = reasonBasis
  }

  // 1) 文件类型：只匹配对应格式的 Skill
  for (const format of detectDocumentFormats(input)) {
    const entry = registry.find(item =>
      normalizeSkillName(item.name) === format ||
      item.aliases.some(alias => normalizeSkillName(alias) === format) ||
      item.triggers.some(trigger => normalizeSkillName(trigger) === format)
    )
    if (entry && entry.loadMode !== 'manual') push(entry.name, `file-type: ${format}`, 'file-type')
  }

  // 2) 声明式 triggers（loadMode=manual 的 Skill 不参与自动匹配）
  for (const entry of registry) {
    if (entry.loadMode === 'manual' || entry.triggers.length === 0) continue
    const hit = entry.triggers.find(trigger => matchesTrigger(input, trigger))
    if (hit) push(entry.name, `trigger: ${hit}`, 'trigger')
  }

  // 3) 名称/别名整词命中（高置信度语义匹配的确定性退路）
  for (const entry of registry) {
    if (entry.loadMode === 'manual') continue
    const key = skillRefKeys(entry).find(candidate => candidate.length >= 3 && matchesTrigger(input, candidate))
    if (key) push(entry.name, `name: ${key}`, 'name')
  }

  for (const extra of options.extraNames ?? []) {
    const entry = resolveSkillRef(registry, extra)
    if (entry) push(entry.name, `dependency: ${extra}`, 'trigger')
  }

  return { names: picked, reasons, basis }
}

export interface SkillClosure {
  names: string[]
  missing: string[]
  cycles: string[]
  depthLimited: string[]
}

/**
 * 解析显式依赖闭环：深度上限（默认 2）、去重、循环检测。
 * 返回顺序为 BFS 顺序（主 Skill 在前），调用方可据此依次注入正文。
 */
export function collectSkillClosure(
  registry: SkillRegistryEntry[],
  roots: string[],
  options: { maxDepth?: number; requires?: (name: string) => string[] } = {},
): SkillClosure {
  const maxDepth = options.maxDepth ?? 2
  const getRequires = options.requires ?? (() => [])
  const names: string[] = []
  const missing: string[] = []
  const cycles: string[] = []
  const depthLimited: string[] = []
  const visited = new Set<string>()
  const queue: Array<{ name: string; depth: number; path: string[] }> = []

  for (const root of roots) {
    const entry = resolveSkillRef(registry, root)
    if (!entry) {
      missing.push(root)
      continue
    }
    queue.push({ name: entry.name, depth: 0, path: [normalizeSkillName(entry.name)] })
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    const key = normalizeSkillName(current.name)
    if (visited.has(key)) continue
    visited.add(key)
    names.push(current.name)

    for (const dep of getRequires(current.name)) {
      const resolved = resolveSkillRef(registry, dep)
      if (!resolved) {
        missing.push(dep)
        continue
      }
      const depKey = normalizeSkillName(resolved.name)
      if (current.path.includes(depKey)) {
        cycles.push([...current.path, depKey].join(' -> '))
        continue
      }
      if (current.depth + 1 >= maxDepth) {
        depthLimited.push(resolved.name)
        continue
      }
      queue.push({ name: resolved.name, depth: current.depth + 1, path: [...current.path, depKey] })
    }
  }

  return { names, missing, cycles, depthLimited }
}
