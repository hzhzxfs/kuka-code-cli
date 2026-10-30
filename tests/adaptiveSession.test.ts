import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { updateInitialCwd } from '../src/util/cwd'
import { getConfManager } from '../src/manager/ConfManager'
import { getStateManager } from '../src/manager/StateManager'
import { getAvailableTools, buildTools, getContextMode } from '../src/tools/base/tools'

test('adaptive tool assembly keeps workflow tools across turns and lazy-loads others', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kuka-adaptive-'))
  const project = path.join(base, 'project')
  fs.mkdirSync(project, { recursive: true })
  updateInitialCwd(project)
  await getConfManager().setCoreConfig({ workingDir: project, contextMode: 'adaptive' })

  assert.equal(getContextMode(), 'adaptive')
  const sessionId = 'adaptive-session-test'
  const runtime = getStateManager().session(sessionId)

  runtime.beginTurn('修复这个函数并跑一下测试')
  const codeTools = getAvailableTools(undefined, { sessionId })
  const codeNames = codeTools.map(tool => tool.name)
  assert.ok(codeNames.includes('sub_agent'))
  assert.ok(codeNames.includes('patch_file'))
  assert.ok(!codeNames.includes('create_cron'))
  assert.ok(codeNames.includes('load_tools'), 'deferred tools stay discoverable')
  assert.ok(codeNames.length < 21)

  // load_tools 加载一个自动化工具：立即生效，且不影响已选中的 coding 工具
  const loadTools = codeTools.find(tool => tool.name === 'load_tools')!
  for await (const result of (loadTools.call as any)({ tool_names: ['create_cron'] }, { sessionId })) {
    assert.deepEqual(result.data.loaded, ['create_cron'])
  }
  const afterLoad = getAvailableTools(undefined, { sessionId }).map(tool => tool.name)
  assert.ok(afterLoad.includes('create_cron'))
  assert.ok(afterLoad.includes('sub_agent'))
  assert.ok(afterLoad.indexOf('create_cron') > afterLoad.indexOf('sub_agent'), 'loaded tools append at the end')

  // 上一轮实际使用的组在下一轮继续保留
  runtime.markToolGroupUsed('coding')
  runtime.markToolGroupUsed('automation')
  runtime.beginTurn('继续')
  const nextTools = getAvailableTools(undefined, { sessionId }).map(tool => tool.name)
  assert.ok(nextTools.includes('sub_agent'))
  assert.ok(nextTools.includes('create_cron'))

  // 简单请求只保留最小 core，不会重新附加全部无关工具
  runtime.beginTurn('现在的系统时间是？')
  const timeTools = getAvailableTools(undefined, { sessionId }).map(tool => tool.name)
  assert.ok(timeTools.includes('run_shell'))
  assert.ok(!timeTools.includes('sub_agent'), 'unrelated groups are not re-added')
  assert.ok(timeTools.length <= 6)

  const schemas = buildTools(getAvailableTools(undefined, { sessionId }))
  assert.ok(schemas.every(schema => typeof schema.description === 'string'))

  // legacy 模式恢复全量工具
  await getConfManager().setCoreConfig({ workingDir: project, contextMode: 'legacy' })
  const legacyTools = getAvailableTools(undefined, { sessionId })
  assert.equal(legacyTools.length, 21)

  getStateManager().removeSession(sessionId)
})
