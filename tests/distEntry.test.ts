import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { updateInitialCwd } from '../dist/util/cwd'
import { getConfManager } from '../dist/manager/ConfManager'
import { getStateManager } from '../dist/manager/StateManager'
import { getAvailableTools } from '../dist/tools/base/tools'

test('CLI entry and dist build use the adaptive request pipeline', async () => {
  const bin = fs.readFileSync(path.resolve('bin/cc.js'), 'utf8')
  assert.ok(bin.includes("require('../dist/cli/cc.js')"), 'CLI bin must load the built dist entry')

  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kuka-dist-entry-'))
  const project = path.join(base, 'project')
  fs.mkdirSync(project, { recursive: true })
  updateInitialCwd(project)
  await getConfManager().setCoreConfig({ workingDir: project, contextMode: 'adaptive' })

  const sessionId = 'dist-entry-test'
  const runtime = getStateManager().session(sessionId)
  runtime.beginTurn('现在的系统时间是？')
  const names = getAvailableTools(undefined, { sessionId }).map(tool => tool.name)
  assert.deepEqual(names, ['run_shell'], 'built CLI output must not ship full tool schemas for a time query')
  getStateManager().removeSession(sessionId)
})
