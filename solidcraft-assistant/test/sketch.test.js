import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../plugin/tools/sketch.js'

let tool
apply({ tools: { register: (definition) => { tool = definition } } })

test('guide asks plane, start, pattern, method and closure', () => {
  return tool.execute({ op: 'guide' }).then((result) => {
    const ids = result.steps.map((step) => step.id)
    assert.deepEqual(ids, ['plane', 'start', 'pattern', 'method', 'closed'])
    assert.deepEqual(result.steps[1].default, [0, 0])
  })
})

test('open line requires a closure choice', async () => {
  const result = await tool.execute({ op: 'validate', plane: { type: 'XZ', offset: 15 }, pattern: 'line', method: 'two_point', args: { end: [50, 20] } })
  assert.equal(result.ok, false)
  assert.equal(result.next, 'closed')
})

test('validated plan maps to the SolidCraft command', async () => {
  const result = await tool.execute({ op: 'validate', plane: { type: 'XZ', offset: 15 }, start: [0, 0], pattern: 'line', method: 'two_point', closed: true, args: { end: [50, 20] } })
  assert.equal(result.ok, true)
  assert.equal(result.plan.plane.offset, 15)
  assert.equal(result.plan.command, 'sketch.line')
})

test('closed profiles do not require closure and invalid methods fail', async () => {
  const circle = await tool.execute({ op: 'validate', plane: { type: 'XY' }, pattern: 'circle', method: 'center_radius', args: { radius: 10 } })
  assert.equal(circle.ok, true)
  assert.equal(circle.plan.closed, true)
  const bad = await tool.execute({ op: 'validate', plane: { type: 'XY' }, pattern: 'rectangle', method: 'center_radius' })
  assert.equal(bad.ok, false)
  assert.ok(bad.errors.some((error) => error.includes('method')))
})
