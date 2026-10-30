import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getConfManager } from '../src/manager/ConfManager'
import { logFinalRequestBoundary } from '../src/services/api/payloadDiagnostics'

test('debug boundary log is derived from the final request body', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'kuka-log-'))
  await getConfManager().setCoreConfig({ workingDir: project, contextMode: 'adaptive', logLevel: 'debug' })

  const lines: string[] = []
  const original = console.log
  console.log = (...args: any[]) => { lines.push(args.join(' ')) }
  try {
    logFinalRequestBoundary({
      stream: true,
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'now' },
        { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'run_shell', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'call_1', content: 'date output' },
      ],
      tools: [],
    }, 'log-test-session')
  } finally {
    console.log = original
  }

  const entry = lines.find(line => line.includes('[llm-entry]'))
  assert.ok(entry, 'entry/build identifier logged once in debug mode')
  const boundary = lines.find(line => line.includes('[llm-boundary]'))
  assert.ok(boundary, 'boundary log emitted')

  const payload = JSON.parse(boundary!.slice(boundary!.indexOf('[llm-boundary]') + '[llm-boundary]'.length).trim())
  assert.equal(payload.requestPhase, 'tool_continuation')
  assert.equal(payload.stream, true)
  assert.equal(payload.loadingMode, 'adaptive')
  assert.deepEqual(payload.finalTools, [])
  assert.ok(typeof payload.finalMessageChars === 'number')
  assert.ok(typeof payload.finalToolSchemaChars === 'number')
  assert.equal(payload.fullSkillsReminderIncluded, false)
  assert.ok(!JSON.stringify(payload).includes('system prompt'), 'log must not contain message bodies')
})
