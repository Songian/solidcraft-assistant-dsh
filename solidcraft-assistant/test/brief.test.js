import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auditBrief } from '../plugin/tools/brief.js'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'brief-'))
  mkdirSync(join(root, 'designs'), { recursive: true })
  writeFileSync(join(root, 'designs', 'plate.sc'), 'x')
  return root
}

const base = {
  schema: 'solidcraft-brief/2',
  project: 'p',
  design_mode: 'geometry-first',
  design_mode_reason: 'fixed profile',
  design_mode_history: [{ mode: 'geometry-first', reason: 'fixed profile' }],
  revision: 1,
  sketch: { plane: { type: 'XY' }, start: [0, 0], pattern: 'rectangle', method: 'two_point', closed: true, command: 'sketch.rectangle.two_point' },
  requirements: [{ id: 'R1', verify: { tool: 'measure', predicate: 'bbox' } }],
  checkpoints: [{ after: 'base', expected: { volume_mm3: 12000 }, tol: { abs: 1 }, minFeatureMm3: 32.19 }],
  artifacts: { design: 'designs/plate.sc', renders: [] },
}

test('empty brief is unverifiable, not ok', () => {
  const root = fixture()
  const result = auditBrief({ ...base, requirements: [], checkpoints: [], artifacts: { design: '', renders: [] } }, root, null, null)
  assert.equal(result.ok, false)
  assert.equal(result.verdict, 'unverifiable')
  rmSync(root, { recursive: true, force: true })
})

test('volume pass and fail', () => {
  const root = fixture()
  assert.equal(auditBrief(base, root, { total: { volume_mm3: 12000.5 } }).verdict, 'verified')
  const failed = auditBrief(base, root, { total: { volume_mm3: 12100 } })
  assert.equal(failed.verdict, 'failed')
  assert.equal(failed.volume.status, 'fail')
  rmSync(root, { recursive: true, force: true })
})

test('outside and symlink escape are rejected', () => {
  const root = fixture()
  const outside = auditBrief({ ...base, artifacts: { design: '/etc/passwd', renders: [] } }, root, { total: { volume_mm3: 12000 } })
  assert.equal(outside.verdict, 'failed')
  if (process.platform !== 'win32') {
    symlinkSync('/etc/passwd', join(root, 'designs', 'escape.sc'))
    const linked = auditBrief({ ...base, artifacts: { design: 'designs/escape.sc', renders: [] } }, root, { total: { volume_mm3: 12000 } })
    assert.equal(linked.errors.some((error) => error.includes('outside project root')), true)
  }
  rmSync(root, { recursive: true, force: true })
})

test('invalid artifact types are errors, not crashes', () => {
  const root = fixture()
  const result = auditBrief({ ...base, artifacts: { design: 123, renders: [{}] } }, root, { total: { volume_mm3: 12000 } })
  assert.equal(result.ok, false)
  assert.equal(result.paths.every((item) => item.status === 'invalid'), true)
  rmSync(root, { recursive: true, force: true })
})

test('audit requires design_mode and a valid sketch', () => {
  const root = fixture()
  writeFileSync(join(root, 'renders'), '')
  const plan = { ...base, artifacts: { design: 'designs/plate.sc', renders: [] } }
  const missing = auditBrief({ ...plan, design_mode: null, sketch: null }, root, { total: { volume_mm3: 12000.5 } })
  assert.equal(missing.verdict, 'unverifiable')
  assert.equal(missing.gate.designMode, false)
  assert.equal(missing.gate.sketch, false)
  const incomplete = auditBrief({ ...plan, sketch: { plane: { type: 'XY' }, pattern: 'line' } }, root, { total: { volume_mm3: 12000.5 } })
  assert.equal(incomplete.verdict, 'unverifiable')
  rmSync(root, { recursive: true, force: true })
})

test('declared relative tolerance alone is unverifiable', () => {
  const root = fixture()
  const result = auditBrief({ ...base, checkpoints: [{ after: 'base', expected: { volume_mm3: 12000 }, tol: { rel: 0.5 } }] }, root, { total: { volume_mm3: 12000.5 } })
  assert.equal(result.volume.status, 'unverifiable')
  assert.equal(result.verdict, 'unverifiable')
  rmSync(root, { recursive: true, force: true })
})
