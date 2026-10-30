import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function writeSkill(dir: string, folder: string, content: string): string {
  const skillDir = path.join(dir, folder)
  fs.mkdirSync(skillDir, { recursive: true })
  const file = path.join(skillDir, 'SKILL.md')
  fs.writeFileSync(file, content, 'utf8')
  return file
}

test('skills manager parses optional metadata and keeps registry lightweight', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kuka-skills-'))
  const userDir = path.join(base, 'user-skills')
  const projectDir = path.join(base, 'project-skills')

  writeSkill(userDir, 'pdf', [
    '---',
    'name: pdf',
    'description: PDF extraction toolkit. Second sentence here.',
    'summary: Short PDF summary',
    'category: documents',
    'triggers: [pdf, ".pdf"]',
    'aliases: [pdftool]',
    '---',
    'PDF BODY',
  ].join('\n'))
  writeSkill(projectDir, 'legacy-skill', [
    '---',
    'name: legacy-skill',
    'description: Legacy skill without optional metadata.',
    '---',
    'LEGACY BODY',
  ].join('\n'))
  writeSkill(projectDir, 'broken', [
    '---',
    'name: broken',
    '---',
    'missing description',
  ].join('\n'))

  const { SkillsManager } = await import('../src/services/skills/skillsManager')
  const manager = new SkillsManager({ userSkillsDir: userDir, projectSkillsDir: projectDir })
  const infos = await manager.getSkillsInfo(undefined, true)

  assert.ok(infos.some(info => info.name === 'pdf'))
  assert.ok(!infos.some(info => info.name === 'broken'), 'malformed skill is ignored')

  const registry = manager.getSkillRegistry()
  const pdf = registry.find(entry => entry.name === 'pdf')!
  assert.equal(pdf.summary, 'Short PDF summary')
  assert.equal(pdf.category, 'documents')
  assert.deepEqual(pdf.triggers, ['pdf', '.pdf'])
  assert.ok(pdf.aliases.includes('pdftool'))
  assert.ok(!JSON.stringify(registry).includes('PDF BODY'), 'registry must not contain the body')

  const legacy = registry.find(entry => entry.name === 'legacy-skill')!
  assert.equal(legacy.summary, 'Legacy skill without optional metadata.')
  assert.equal(legacy.category, 'general')
  assert.equal(legacy.loadMode, 'auto')
  assert.deepEqual(legacy.triggers, [])

  assert.equal(manager.resolveSkillName('pdftool'), 'pdf')
  assert.equal(manager.resolveSkillName('/PDF'), 'pdf')

  // 文件变更后显式加载重新解析，不沿用旧正文
  const file = path.join(userDir, 'pdf', 'SKILL.md')
  fs.writeFileSync(file, [
    '---',
    'name: pdf',
    'description: PDF extraction toolkit.',
    '---',
    'UPDATED PDF BODY',
  ].join('\n'), 'utf8')
  const future = new Date(Date.now() + 5000)
  fs.utimesSync(file, future, future)

  const fresh = await manager.getSkillConfigFresh('pdf')
  assert.ok(fresh?.prompt.includes('UPDATED PDF BODY'))

  manager.dispose()
})

test('project skill overrides user skill with the same name', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kuka-skills-'))
  const userDir = path.join(base, 'user-skills')
  const projectDir = path.join(base, 'project-skills')
  writeSkill(userDir, 'shared', '---\nname: shared\ndescription: user version\n---\nUSER\n')
  writeSkill(projectDir, 'shared', '---\nname: shared\ndescription: project version\n---\nPROJECT\n')

  const { SkillsManager } = await import('../src/services/skills/skillsManager')
  const manager = new SkillsManager({ userSkillsDir: userDir, projectSkillsDir: projectDir })
  await manager.getSkillsInfo(undefined, true)

  const config = manager.getSkillConfig('shared')
  assert.equal(config?.description, 'project version')
  assert.equal(config?.locate, 'project')
  manager.dispose()
})
