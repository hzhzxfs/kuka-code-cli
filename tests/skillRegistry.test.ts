import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSkillRegistry, collectSkillClosure, detectDocumentFormats, normalizeSkillName,
  resolveSkillRef, selectSkillsForTurn, toSkillSummary,
} from '../src/services/skills/skillRegistry'

const registry = buildSkillRegistry([
  { name: 'pdf', description: 'PDF toolkit for extraction. Extra detail.', prompt: 'PDF BODY', triggers: ['pdf'], category: 'documents' },
  { name: 'docx', description: 'Word documents', prompt: 'DOCX BODY', aliases: ['word'] },
  { name: 'code-review', description: 'Review code', prompt: 'REVIEW BODY', loadMode: 'manual', triggers: ['review'] },
  { name: 'plugin:helper', description: 'Helper skill', prompt: 'HELPER BODY', requires: ['pdf'] },
])

test('registry contains metadata only, never the skill body', () => {
  const serialized = JSON.stringify(registry)
  assert.ok(!serialized.includes('PDF BODY'))
  assert.ok(!serialized.includes('DOCX BODY'))
  assert.equal(registry[0].summary, 'PDF toolkit for extraction.')
  assert.equal(registry[0].category, 'documents')
  assert.equal(registry[0].sourcePath, undefined)
})

test('summary is shortened without cutting metadata', () => {
  assert.equal(toSkillSummary('first line\nsecond line'), 'first line second line')
  assert.ok(toSkillSummary('x'.repeat(400)).length <= 101)
})

test('name normalization and alias resolution are case/format insensitive', () => {
  assert.equal(normalizeSkillName(' PDF_Toolkit '), 'pdf-toolkit')
  assert.equal(resolveSkillRef(registry, 'word')?.name, 'docx')
  assert.equal(resolveSkillRef(registry, 'helper')?.name, 'plugin:helper')
  assert.equal(resolveSkillRef(registry, 'missing'), undefined)
})

test('explicit invocation wins over file-type matching', () => {
  const selection = selectSkillsForTurn(registry, 'convert report.pdf', { explicitRef: 'docx' })
  assert.deepEqual(selection.names, ['docx'])
  assert.equal(selection.basis, 'explicit')
})

test('unknown explicit skill loads nothing', () => {
  assert.deepEqual(selectSkillsForTurn(registry, '/nope', { explicitRef: 'nope' }).names, [])
})

test('file-type matching loads only the matching document skill', () => {
  assert.deepEqual(detectDocumentFormats('a.pdf and b.xlsx'), ['pdf', 'xlsx'])
  const pdf = selectSkillsForTurn(registry, 'extract report.pdf')
  assert.deepEqual(pdf.names, ['pdf'])
  // 未安装的格式不会加载任何 Skill（不加载全部文档能力）
  assert.deepEqual(selectSkillsForTurn(registry, 'read data.xlsx').names, [])
})

test('automatic loading is capped at one primary skill', () => {
  const selection = selectSkillsForTurn(registry, 'convert a.pdf and b.docx')
  assert.equal(selection.names.length, 1)
  assert.deepEqual(selection.names, ['pdf'])
})

test('manual skills never auto-load even when triggers match', () => {
  assert.deepEqual(selectSkillsForTurn(registry, 'please review this diff').names, [])
})

test('dependency closure handles depth and cycles', () => {
  const cyclic: Record<string, string[]> = { 'plugin:helper': ['pdf'], pdf: ['plugin:helper'] }
  const closure = collectSkillClosure(registry, ['plugin:helper'], {
    maxDepth: 2,
    requires: name => cyclic[name] ?? [],
  })
  assert.deepEqual(closure.names, ['plugin:helper', 'pdf'])
  assert.deepEqual(closure.cycles, ['plugin:helper -> pdf -> plugin:helper'])

  const deep: Record<string, string[]> = { 'plugin:helper': ['pdf'], pdf: ['docx'], docx: ['pdf'] }
  const limited = collectSkillClosure(registry, ['plugin:helper'], {
    maxDepth: 2,
    requires: name => deep[name] ?? [],
  })
  assert.deepEqual(limited.names, ['plugin:helper', 'pdf'])
  assert.deepEqual(limited.depthLimited, ['docx'])
})

test('missing dependency is reported instead of throwing', () => {
  const closure = collectSkillClosure(registry, ['pdf'], { requires: () => ['ghost'] })
  assert.deepEqual(closure.missing, ['ghost'])
  assert.deepEqual(closure.names, ['pdf'])
})
