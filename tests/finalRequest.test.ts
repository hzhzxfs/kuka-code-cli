import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { updateInitialCwd } from '../src/util/cwd'
import { getConfManager } from '../src/manager/ConfManager'
import { getModelManager } from '../src/manager/ModelManager'
import { getStateManager } from '../src/manager/StateManager'
import { getSkillsManager } from '../src/services/skills/skillsManager'
import { KukaCore } from '../src/core/KukaCore'
import type { KukaSession } from '../src/core/KukaSession'
import { buildPayloadDiagnostics } from '../src/services/api/payloadDiagnostics'

interface CapturedRequest {
  url: string
  body: any
}

function writeSkill(skillsDir: string, folder: string, meta: string[], body: string): void {
  const dir = path.join(skillsDir, folder)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), [...meta, '---', body].join('\n'), 'utf8')
}

function chunk(obj: any): string {
  return 'data: ' + JSON.stringify(obj) + '\n\n'
}

function toolCallResponse(name: string, args: Record<string, unknown>): string {
  const id = 'chatcmpl-tool'
  return [
    chunk({ id, object: 'chat.completion.chunk', created: 0, model: 'mock', choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }] }),
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

function startMockServer(script: string[]): Promise<{ server: http.Server; url: string; requests: CapturedRequest[] }> {
  const requests: CapturedRequest[] = []
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', data => chunks.push(data as Buffer))
    req.on('end', () => {
      requests.push({ url: req.url || '', body: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
      const next = script.shift()
      if (!next) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('no scripted response')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      res.write(next)
      res.end()
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port
      resolve({ server, url: 'http://127.0.0.1:' + port, requests })
    })
  })
}

function runTurn(session: KukaSession, input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('turn timeout: ' + input)), 20000)
    let finalTextSeen = false
    const onComplete = (data: any) => {
      if (data && data.hasToolCalls === false) finalTextSeen = true
    }
    const finish = () => {
      clearTimeout(timer)
      session.off('message:complete', onComplete)
      session.off('state:update', onState)
      // 让 finalizeMessages / 历史落盘完成后再进入下一轮
      setTimeout(resolve, 20)
    }
    const onState = (data: any) => {
      if (finalTextSeen && data && data.state === 'idle') finish()
    }
    session.on('message:complete', onComplete)
    session.on('state:update', onState)
    session.processUserInput(input)
  })
}

function toolNames(body: any): string[] {
  return (body.tools || []).map((tool: any) => tool.function?.name).filter(Boolean)
}

function messageText(body: any): string {
  return JSON.stringify(body.messages || [])
}

test('final provider payload is adaptively minimized and follow-up rounds do not restore full tools', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kuka-final-payload-'))
  const project = path.join(base, 'project')
  const skillsDir = path.join(project, '.kukacode', 'skills')
  fs.mkdirSync(skillsDir, { recursive: true })

  const pdfBody = 'PDF BODY ' + 'pdf detail line '.repeat(200)
  const docxBody = 'DOCX BODY ' + 'docx detail line '.repeat(200)
  writeSkill(skillsDir, 'pdf', ['---', 'name: pdf', 'description: PDF toolkit for extraction.', 'trigger: pdf'], pdfBody)
  writeSkill(skillsDir, 'docx', ['---', 'name: docx', 'description: Word toolkit.', 'aliases: [word]'], docxBody)
  writeSkill(skillsDir, 'pptx', ['---', 'name: pptx', 'description: Slides toolkit.'], 'PPTX BODY')

  const script = [
    toolCallResponse('run_shell', { command: 'date' }),
    textResponse('当前时间是 12:00。'),
    toolCallResponse('skill', { skill: 'pdf' }),
    textResponse('PDF 已处理。'),
    toolCallResponse('skill', { skill: 'docx' }),
    textResponse('DOCX 已处理。'),
    textResponse('当前时间是 12:01。'),
  ]
  const mock = await startMockServer(script)

  updateInitialCwd(project)
  const core = new KukaCore({
    workingDir: project,
    contextMode: 'adaptive',
    stream: false,
    thinking: false,
    disableTopicDetection: true,
  })
  await getModelManager().addNewModel({
    provider: 'openai',
    modelName: 'mock-model',
    baseURL: mock.url,
    apiKey: 'test-key',
    maxTokens: 512,
    contextLength: 128000,
    adapt: 'openai',
  }, true)
  await getSkillsManager().getSkillsInfo(undefined, true)

  const created = await core.createSession({ permissionLevel: 'Bypass', agentMode: 'Agent' })
  assert.equal(created.ok, true)
  const session = created.session!
  await new Promise<void>(resolve => session.once('session:ready', () => resolve()))

  try {
    // 1) 时间查询：首轮只发 run_shell；无 skill 列表；第二轮不恢复全量工具
    await runTurn(session, '现在的系统时间是？')
    assert.equal(mock.requests.length, 2, 'no extra routing LLM call')
    const first = mock.requests[0].body
    assert.deepEqual(toolNames(first), ['run_shell'])
    assert.ok(!messageText(first).includes('Available skills'))
    assert.ok(!messageText(first).includes('PDF BODY'))
    const second = mock.requests[1].body
    assert.deepEqual(toolNames(second), [], 'follow-up sends no tool schemas')
    assert.ok(!messageText(second).includes('Available skills'))
    assert.ok(messageText(second).includes('date'), 'tool result is preserved')
    const stableSystem = first.messages[0].content

    // 2) PDF 任务：只提示对应 Skill，工具不包含 cron/todo/sub-agent/mcp
    await runTurn(session, '把 report.pdf 转成文本')
    const pdfRequest = mock.requests[2].body
    assert.equal(pdfRequest.messages[0].content, stableSystem, 'system prefix stays stable')
    assert.ok(!messageText(pdfRequest).includes('Available skills'))
    const pdfNames = toolNames(pdfRequest)
    assert.ok(pdfNames.includes('skill'))
    for (const forbidden of ['create_cron', 'create_todo', 'sub_agent']) {
      assert.ok(!pdfNames.includes(forbidden), forbidden)
    }
    assert.ok(!pdfNames.some(name => name.startsWith('mcp__')))
    assert.ok(messageText(pdfRequest).includes('pdf'))

    const pdfResult = mock.requests[3].body
    assert.ok(messageText(pdfResult).includes('PDF BODY'), 'dispatched skill body is injected')
    assert.ok(!messageText(pdfResult).includes('DOCX BODY'))
    assert.ok(!toolNames(pdfResult).includes('create_cron'))

    // 3) 显式 /docx：只加载目标 Skill
    await runTurn(session, '/docx 处理这个文档')
    const docxRequest = mock.requests[4].body
    assert.ok(!messageText(docxRequest).includes('Available skills'))
    assert.ok(messageText(docxRequest).includes('docx'))
    const docxResult = mock.requests[5].body
    const lastMessages = JSON.stringify((docxResult.messages || []).slice(-2))
    assert.ok(lastMessages.includes('DOCX BODY'))

    // 诊断日志结构（不含正文/密钥）
    const diagnostics = buildPayloadDiagnostics(session.sessionId, [], getStateManager().session(session.sessionId).getTurnToolPolicy() === 'simple' ? [] : [])
    assert.deepEqual(Object.keys(diagnostics).sort(), [
      'fallbackReason', 'loadedSkillChars', 'matchedSkillNames', 'messageChars', 'mode',
      'selectedToolNames', 'skillRegistryChars', 'toolSchemaChars', 'toolsCount',
    ].sort())

    // 4) legacy 模式保持旧行为：全量工具 + 完整 Skill 列表
    core.updateCoreConfByKey('contextMode', 'legacy')
    const legacyCreated = await core.createSession({ permissionLevel: 'Bypass', agentMode: 'Agent' })
    assert.equal(legacyCreated.ok, true)
    const legacySession = legacyCreated.session!
    await new Promise<void>(resolve => legacySession.once('session:ready', () => resolve()))
    await runTurn(legacySession, '现在的系统时间是？')
    const legacyRequest = mock.requests[mock.requests.length - 1].body
    assert.equal(toolNames(legacyRequest).length, 21)
    assert.ok(messageText(legacyRequest).includes('Available skills'))
    assert.ok(messageText(legacyRequest).includes('PDF toolkit for extraction'))
    legacySession.dispose()
  } finally {
    session.dispose()
    core.dispose()
    mock.server.close()
  }
})
