import test from 'node:test'
import assert from 'node:assert/strict'
import { detectToolGroups, selectToolsForTurn, isSimpleRequest, getToolGroup } from '../src/tools/base/toolGroups'

const available = [
  'run_shell', 'search_files', 'search_content', 'view_file', 'write_file', 'patch_file',
  'fetch_url', 'skill', 'ask_form',
  'sub_agent', 'plan_to_agent', 'peek_bg_job', 'stop_bg_job', 'edit_notebook',
  'create_todo', 'get_todo', 'list_todos', 'update_todo',
  'create_cron', 'del_cron', 'list_crons',
  'mcp__figma__get_file',
]

const select = (input: string, extra: Partial<Parameters<typeof selectToolsForTurn>[0]> = {}) =>
  selectToolsForTurn({ input, availableNames: available, mcpServerNames: ['figma'], mode: 'adaptive', ...extra })

test('time query loads minimal core tools only', () => {
  const result = select('现在的系统时间是？')
  assert.equal(result.basis, 'simple')
  assert.deepEqual(result.names, ['run_shell', 'search_files', 'search_content', 'view_file'])
  assert.ok(!result.names.includes('skill'))
  assert.ok(!result.names.includes('mcp__figma__get_file'))
})

test('time query works in English too', () => {
  assert.equal(isSimpleRequest('what is the current time?'), true)
  assert.equal(select('What is the current time?').basis, 'simple')
})

test('plain code question gets core + coding but no docs/cron/mcp', () => {
  const result = select('这段代码为什么报错？')
  assert.deepEqual(result.groups, ['core', 'coding'])
  assert.ok(result.names.includes('run_shell'))
  assert.ok(result.names.includes('sub_agent'))
  for (const name of ['create_cron', 'del_cron', 'list_crons', 'mcp__figma__get_file']) {
    assert.ok(!result.names.includes(name), name)
  }
})

test('code modification keeps verification tools available', () => {
  const result = select('修复这个函数的单元测试，然后跑一下构建')
  assert.ok(result.names.includes('patch_file'))
  assert.ok(result.names.includes('run_shell'))
  assert.ok(result.names.includes('sub_agent'))
})

test('document task selects documents group only', () => {
  const result = select('把 report.pdf 转成文本')
  assert.deepEqual(result.groups, ['core', 'documents'])
  for (const name of ['create_cron', 'sub_agent', 'mcp__figma__get_file']) {
    assert.ok(!result.names.includes(name), name)
  }
})

test('cron task loads automation tools and keeps schema-driven validation', () => {
  const result = select('每天9点提醒我开会')
  assert.deepEqual(result.groups, ['core', 'automation'])
  assert.ok(result.names.includes('create_cron'))
  assert.ok(!result.names.includes('sub_agent'))
})

test('mcp task discovers target mcp tool', () => {
  const result = select('用 figma 拉取设计稿')
  assert.ok(result.groups.includes('mcp'))
  assert.ok(result.names.includes('mcp__figma__get_file'))
  assert.ok(!result.names.includes('create_cron'))
})

test('low confidence falls back to core + one related group', () => {
  const detection = detectToolGroups('帮我看看这个项目', ['figma'])
  assert.equal(detection.confidence, 'low')
  assert.deepEqual(detection.groups, ['core', 'coding'])
})

test('previous turn groups stay active for workflow continuity', () => {
  const result = select('继续', { carriedGroups: ['coding'] })
  assert.ok(result.names.includes('sub_agent'))
})

test('legacy mode keeps every available tool', () => {
  const result = selectToolsForTurn({ input: '现在的系统时间是？', availableNames: available, mode: 'legacy' })
  assert.equal(result.names.length, available.length)
  assert.deepEqual(result.names, available)
})

test('mcp tools are classified into the mcp group', () => {
  assert.equal(getToolGroup('mcp__github__search'), 'mcp')
  assert.equal(getToolGroup('create_cron'), 'automation')
  assert.equal(getToolGroup('view_file'), 'core')
  assert.equal(getToolGroup('sub_agent'), 'coding')
})
