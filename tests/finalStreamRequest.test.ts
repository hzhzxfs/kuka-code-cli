import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { updateInitialCwd } from '../src/util/cwd'
import { getModelManager } from '../src/manager/ModelManager'
import { getSkillsManager } from '../src/services/skills/skillsManager'
import { KukaCore } from '../src/core/KukaCore'
import type { KukaSession } from '../src/core/KukaSession'

function writeSkill(skillsDir: string, folder: string, meta: string[], body: string): void {
  const dir = path.join(skillsDir, folder)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), [...meta, '---', body].join('\n'), 'utf8')
}

function chunk(obj: any): string {
  return 'data: ' + JSON.stringify(obj) + '\n\n'
}

function toolCallResponse(name: string, args: Record<string, unknown>, preamble?: string): string {
  const id = 'chatcmpl-tool'
  return [
    chunk({ id, object: 'chat.completion.chunk', created: 0, model: 'mock', choices: [{ index: 0, delta: { role: 'assistant', ...(preamble ? { content: preamble } : {}), tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }] }),
    chunk({ id, object: 'chat.completion.chunk', created: 0, model: 'mock', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }),
    chunk({ id, object: 'chat.completion.chunk', created: 0, model: 'mock', choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
  ].join('') + 'data: [DONE]\n\n'
}

function textResponse(text: string): string {
  const id = 'chatcmpl-text'
  return [
    chunk({ id, object: 'chat.completion.chunk', created: 0, model: 'mock', choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] }),
    chunk({ id, object: 'chat.completion.chunk', created: 0, model: 'mock', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
    chunk({ id, object: 'chat.completion.chunk', created: 0, model: 'mock', choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
  ].join('') + 'data: [DONE]\n\n'
}

function startMock(script: string[]): Promise<{ server: http.Server; url: string; requests: any[] }> {
  const requests: any[] = []
  const server = http.createServer((req, res) => {
    const bufs: Buffer[] = []
    req.on('data', data => bufs.push(data as Buffer))
    req.on('end', () => {
      requests.push(JSON.parse(Buffer.concat(bufs).toString('utf8')))
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      res.write(script.shift() || textResponse('ok'))
      res.end()
    })
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    resolve({ server, url: 'http://127.0.0.1:' + (server.address() as AddressInfo).port, requests })
  }))
}

function runTurn(session: KukaSession, input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('turn timeout: ' + input)), 20000)
    let finalText = false
    const onComplete = (data: any) => { if (data && data.hasToolCalls === false) finalText = true }
    const onState = (data: any) => {
      if (finalText && data && data.state === 'idle') {
        clearTimeout(timer)
        session.off('message:complete', onComplete)
        session.off('state:update', onState)
        setTimeout(resolve, 20)
      }
    }
    session.on('message:complete', onComplete)
    session.on('state:update', onState)
    session.processUserInput(input)
  })
}

const toolNames = (body: any): string[] => (body.tools || []).map((tool: any) => tool.function?.name).filter(Boolean)
const messageJson = (body: any): string => JSON.stringify(body.messages || [])

test('final streaming request boundary is trimmed in adaptive mode for both stream modes', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kuka-boundary-'))
  const project = path.join(base, 'project')
  const skillsDir = path.join(project, '.kukacode', 'skills')
  fs.mkdirSync(skillsDir, { recursive: true })
  updateInitialCwd(project)

  writeSkill(skillsDir, 'pdf', ['---', 'name: pdf', 'description: PDF toolkit for extraction.'], 'PDF BODY ' + 'pdf line '.repeat(100))
  writeSkill(skillsDir, 'docx', ['---', 'name: docx', 'description: Word toolkit.'], 'DOCX BODY ' + 'docx line '.repeat(100))
  writeSkill(skillsDir, 'pptx', ['---', 'name: pptx', 'description: Slides toolkit.'], 'PPTX BODY')

  const script = [
    toolCallResponse('run_shell', { command: 'date' }, '让我帮你查一下。'), textResponse('12:00'),
    toolCallResponse('run_shell', { command: 'date' }), textResponse('12:00'),
    textResponse('已修复'),
    toolCallResponse('skill', { skill: 'pdf' }), textResponse('PDF 完成'),
    textResponse('12:01'),
  ]
  const mock = await startMock(script)

  const core = new KukaCore({
    workingDir: project,
    contextMode: 'adaptive',
    stream: true,
    thinking: false,
    disableTopicDetection: true,
  })
  await getModelManager().addNewModel({
    provider: 'openai', modelName: 'mock-model', baseURL: mock.url,
    apiKey: 'test-key', maxTokens: 512, contextLength: 128000, adapt: 'openai',
  }, true)
  await getSkillsManager().getSkillsInfo(undefined, true)

  const newSession = async (): Promise<KukaSession> => {
    const created = await core.createSession({ permissionLevel: 'Bypass', agentMode: 'Agent' })
    assert.equal(created.ok, true)
    const session = created.session!
    await new Promise<void>(resolve => session.once('session:ready', () => resolve()))
    return session
  }

  const runScenario = async (input: string, mark: () => void): Promise<any[]> => {
    const session = await newSession()
    const from = mock.requests.length
    await runTurn(session, input)
    const captured = mock.requests.slice(from)
    mark()
    session.dispose()
    return captured
  }

  try {
    // A. stream=true 时间查询：首轮仅 run_shell，第二轮无 tools、无 Available skills
    const streamTrue = await runScenario('现在的系统时间是？', () => {})
    assert.equal(streamTrue.length, 2)
    assert.equal(streamTrue[0].stream, true)
    assert.deepEqual(toolNames(streamTrue[0]), ['run_shell'])
    assert.ok(!messageJson(streamTrue[0]).includes('Available skills'))
    assert.ok(!messageJson(streamTrue[0]).includes('SKILL BODY'))
    assert.equal(toolNames(streamTrue[1]).length, 0)
    assert.ok(!('tools' in streamTrue[1]) || streamTrue[1].tools.length === 0)
    assert.ok(!messageJson(streamTrue[1]).includes('Available skills'))
    const toolMessages = (streamTrue[1].messages || []).filter((message: any) => message.role === 'tool')
    assert.equal(toolMessages.length, 1)
    assert.equal(toolMessages[0].tool_call_id, 'call_1')
    const assistantToolCalls = (streamTrue[1].messages || []).find((message: any) => message.role === 'assistant' && message.tool_calls)
    assert.equal(assistantToolCalls.tool_calls[0].id, 'call_1')
    assert.ok(!JSON.stringify(assistantToolCalls.content || '').includes('让我'), 'tool call turn must not persist preamble text')

    // B. stream=false：同样的裁剪规则
    core.updateCoreConfByKey('stream', false)
    const streamFalse = await runScenario('现在几点了？', () => {})
    assert.deepEqual(toolNames(streamFalse[0]), ['run_shell'])
    assert.ok(!messageJson(streamFalse[0]).includes('Available skills'))
    assert.equal(toolNames(streamFalse[1]).length, 0)
    assert.ok(!messageJson(streamFalse[1]).includes('Available skills'))
    core.updateCoreConfByKey('stream', true)

    // C. 普通代码修改：必要编辑工具在，cron/mcp/文档不在
    const codeEdit = await runScenario('修复 src/index.ts 并运行测试', () => {})
    const codeTools = toolNames(codeEdit[0])
    assert.ok(codeTools.includes('patch_file'))
    assert.ok(codeTools.includes('run_shell'))
    assert.ok(!codeTools.includes('create_cron'))
    assert.ok(!codeTools.some(name => name.startsWith('mcp__')))

    // D. 显式 /pdf：只加载 pdf Skill，且不发送全量 Skill 列表
    const pdf = await runScenario('/pdf 提取这个文件的文本', () => {})
    assert.equal(pdf.length, 2)
    assert.ok(!messageJson(pdf[0]).includes('Available skills'))
    assert.ok(messageJson(pdf[0]).includes('pdf'))
    assert.ok(toolNames(pdf[0]).includes('skill'))
    assert.ok(!toolNames(pdf[0]).includes('create_cron'))
    assert.ok(messageJson(pdf[1]).includes('PDF BODY'))
    assert.ok(!messageJson(pdf[1]).includes('DOCX BODY'))

    // E. legacy：保持旧行为
    core.updateCoreConfByKey('contextMode', 'legacy')
    const legacy = await runScenario('现在的系统时间是？', () => {})
    assert.equal(toolNames(legacy[0]).length, 21)
    assert.ok(messageJson(legacy[0]).includes('Available skills'))
    assert.ok(messageJson(legacy[0]).includes('PDF toolkit for extraction'))
  } finally {
    core.dispose()
    mock.server.close()
  }
})
