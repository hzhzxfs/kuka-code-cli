import test from 'node:test'
import assert from 'node:assert/strict'
import { getStateManager } from '../src/manager/StateManager'

test('turn boundary resets skill dedupe and carries used tool groups', () => {
  const manager = getStateManager()
  const sessionId = 'state-test-' + Date.now()
  const runtime = manager.session(sessionId)

  runtime.beginTurn('first')
  assert.equal(runtime.getTurnSeq(), 1)
  assert.equal(runtime.markSkillLoaded('pdf'), true)
  assert.equal(runtime.markSkillLoaded('pdf'), false, 'same turn dedupes normalized names')
  assert.equal(runtime.isSkillLoadedThisTurn('pdf'), true)

  runtime.markToolGroupUsed('coding')
  runtime.markToolGroupUsed('core')

  runtime.beginTurn('second')
  assert.equal(runtime.getTurnSeq(), 2)
  assert.equal(runtime.isSkillLoadedThisTurn('pdf'), false, 'new turn allows reloading')
  assert.deepEqual(runtime.getPrevTurnToolGroups(), ['coding', 'core'])
  assert.equal(runtime.getTurnInput(), 'second')

  // 本轮未使用的组不会继续沿用
  runtime.beginTurn('third')
  assert.deepEqual(runtime.getPrevTurnToolGroups(), [])

  runtime.clearAllState()
  assert.equal(runtime.getTurnSeq(), 0)
  manager.removeSession(sessionId)
})
