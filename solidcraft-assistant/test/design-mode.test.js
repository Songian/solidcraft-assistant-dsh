import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../plugin/tools/brief.js'

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'design-mode-'))
  let tool
  apply({ tools: { register: (definition) => { tool = definition } }, workingDirectory: { get: () => dir } })
  return { dir, tool, exec: { agent: { session: {} } } }
}

test('design_mode defaults to null and accepts the two entry modes', async () => {
  const { dir, tool, exec } = setup()
  const init = await tool.execute({ op: 'init', project: 'modes' }, exec)
  assert.equal(init.brief.design_mode, null)
  const geometry = await tool.execute({ op: 'update', patch: { design_mode: 'geometry-first' } }, exec)
  assert.equal(geometry.brief.design_mode, 'geometry-first')
  const feature = await tool.execute({ op: 'update', patch: { design_mode: 'feature-first' } }, exec)
  assert.equal(feature.brief.design_mode, 'feature-first')
  assert.equal(feature.brief.design_mode_history.length, 2)
  await assert.rejects(() => tool.execute({ op: 'update', patch: { design_mode: 'auto' } }, exec), /design_mode/)
  const read = await tool.execute({ op: 'read' }, exec)
  assert.equal(read.brief.design_mode, 'feature-first')
  assert.equal(read.brief.design_mode_history.length, 2)
  rmSync(dir, { recursive: true, force: true })
})
