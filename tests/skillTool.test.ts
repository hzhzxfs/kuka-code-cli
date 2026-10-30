import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { updateInitialCwd } from '../src/util/cwd'
import { getConfManager } from '../src/manager/ConfManager'
import { getSkillsManager } from '../src/services/skills/skillsManager'
import { getStateManager } from '../src/manager/StateManager'
import { Skill } from '../src/tools/Skill'

function writeSkill(dir: string, folder: string, frontmatter: string[], body: string): void {
  const skillDir = path.join(dir, folder)
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), [...frontmatter, '---', body].join('\n'), 'utf8')
}

async function collect(input: any, ctx: any) {
  const results: any[] = []
  for await (const item of Skill.call(input, ctx)) results.push(item)
  return results
}

test('skill tool loads one body per turn, resolves aliases, loads dependencies and stops cycles', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kuka-skill-tool-'))
  const project = path.join(base, 'project')
  const skillsDir = path.join(project, '.kukacode', 'skills')

  writeSkill(skillsDir, 'docx', ['---', 'name: docx', 'description: Word documents', 'aliases: [word]'], 'DOCX BODY')
  writeSkill(skillsDir, 'pdf', ['---', 'name: pdf', 'description: PDF documents'], 'PDF BODY')
  writeSkill(skillsDir, 'helper', ['---', 'name: helper', 'description: Helper', 'requires: [pdf]'], 'HELPER BODY')
  writeSkill(skillsDir, 'loop-a', ['---', 'name: loop-a', 'description: Loop A', 'requires: [loop-b]'], 'LOOP A BODY')
  writeSkill(skillsDir, 'loop-b', ['---', 'name: loop-b', 'description: Loop B', 'requires: [loop-a]'], 'LOOP B BODY')

  updateInitialCwd(project)
  await getConfManager().setCoreConfig({ workingDir: project, contextMode: 'adaptive' })
  await getSkillsManager().getSkillsInfo(undefined, true)

  const sessionId = 'skill-tool-test'
  const runtime = getStateManager().session(sessionId)
  const ctx = { sessionId, agentId: 'main' }

  runtime.beginTurn('/word')
  const first = await collect({ skill: 'word' }, ctx)
  assert.equal(first[0].data.name, 'docx')
  assert.equal(first[0].additionalBlocks.length, 1)
  assert.ok(first[0].additionalBlocks[0].text.includes('DOCX BODY'))

  // 同一轮重复调用：不重复注入正文，也不报错
  const second = await collect({ skill: 'docx' }, ctx)
  assert.equal(second[0].data.alreadyLoaded, true)
  assert.equal(second[0].additionalBlocks, undefined)

  // 新的一轮可以再次加载
  runtime.beginTurn('again')
  const third = await collect({ skill: 'docx' }, ctx)
  assert.ok(third[0].additionalBlocks[0].text.includes('DOCX BODY'))

  // 依赖正交 Skill：主 Skill + 依赖各注入一次
  runtime.beginTurn('helper')
  const helper = await collect({ skill: 'helper' }, ctx)
  assert.deepEqual(helper[0].data.dependencies, ['pdf'])
  assert.equal(helper[0].additionalBlocks.length, 2)
  assert.ok(helper[0].additionalBlocks[1].text.includes('PDF BODY'))

  // 循环依赖：检测并终止，不无限递归
  runtime.beginTurn('loop')
  const loop = await collect({ skill: 'loop-a' }, ctx)
  assert.equal(loop[0].data.dependencies.length, 1)
  assert.equal(loop[0].data.cycles.length, 1)

  // 未知 Skill：抛出清晰错误（由工具层转换为 is_error，不崩溃进程）
  await assert.rejects(() => collect({ skill: 'ghost' }, ctx), /No skill named "ghost"/)

  // legacy 模式保持原有行为：每次调用都注入正文
  await getConfManager().setCoreConfig({ workingDir: project, contextMode: 'legacy' })
  runtime.beginTurn('legacy')
  const legacyFirst = await collect({ skill: 'docx' }, ctx)
  const legacySecond = await collect({ skill: 'docx' }, ctx)
  assert.ok(legacyFirst[0].additionalBlocks[0].text.includes('DOCX BODY'))
  assert.ok(legacySecond[0].additionalBlocks[0].text.includes('DOCX BODY'))

  getStateManager().removeSession(sessionId)
})
