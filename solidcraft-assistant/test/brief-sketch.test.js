import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../plugin/tools/brief.js'

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'brief-sketch-'))
  let tool
  apply({ tools: { register: (definition) => { tool = definition } }, workingDirectory: { get: () => dir } })
  return { dir, tool, exec: { agent: { session: {} } } }
}

const sketch = {
  flow: 'parametric',
  plane: { type: 'XY', offset: 0 },
  start: [0, 0],
  pattern: 'circle',
  method: 'center_radius',
  closed: true,
  command: 'sketch.circle.center',
  args: { radius: 5 },
}

function assertUnchanged(before, after) {
  assert.equal(after.revision, before.revision)
  assert.deepEqual(after.sketch, before.sketch)
  assert.deepEqual(after.focus, before.focus)
  assert.equal(after.updated, before.updated)
}

test('single sketch: an existing sketch can be replaced by a new single object', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch' }, exec)
  const firstSketch = { ...sketch, plane: { type: 'XY', offset: 0, name: 'top-face' } }
  const first = await tool.execute({ op: 'update', patch: { sketch: firstSketch, focus: { goal: 'keep me' } } }, exec)
  assert.equal(first.changed, true)
  assert.deepEqual(first.brief.sketch, firstSketch)

  const revised = { ...sketch, plane: { type: 'XZ' }, args: { radius: 9 } }
  const second = await tool.execute({ op: 'update', patch: { sketch: revised } }, exec)
  assert.equal(second.changed, true)
  assert.equal(second.brief.sketch.plane.name, undefined)
  assert.deepEqual(second.brief.sketch, revised)
  assert.equal(second.brief.revision, first.brief.revision + 1)
  assert.deepEqual(second.brief.focus, first.brief.focus)
  assert.equal(second.brief.project, first.brief.project)

  const read = await tool.execute({ op: 'read' }, exec)
  assert.deepEqual(read.brief.sketch, revised)
  rmSync(dir, { recursive: true, force: true })
})

test('single sketch: an invalid sketch object is rejected without side effects', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch-invalid' }, exec)
  const first = await tool.execute({ op: 'update', patch: { sketch, focus: { goal: 'keep me' } } }, exec)

  await assert.rejects(
    () => tool.execute({ op: 'update', patch: { sketch: {} } }, exec),
    (error) => {
      assert.match(error.message, /brief\.sketch is invalid/)
      assert.match(error.message, /flow/)
      return true
    },
  )
  const read = await tool.execute({ op: 'read' }, exec)
  assertUnchanged(first.brief, read.brief)
  assert.deepEqual(read.brief.sketch, sketch)
  assert.equal(read.brief.project, first.brief.project)
  rmSync(dir, { recursive: true, force: true })
})

test('single sketch: clearing with null while a sketch exists is rejected without side effects', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch-null' }, exec)
  const first = await tool.execute({ op: 'update', patch: { sketch, focus: { goal: 'keep me' } } }, exec)

  await assert.rejects(
    () => tool.execute({ op: 'update', patch: { sketch: null } }, exec),
    /sketch.*null|reset/i,
  )
  const read = await tool.execute({ op: 'read' }, exec)
  assertUnchanged(first.brief, read.brief)
  rmSync(dir, { recursive: true, force: true })
})

test('single sketch: null is a no-op when no sketch exists', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch-null-empty' }, exec)
  const result = await tool.execute({ op: 'update', patch: { sketch: null } }, exec)
  assert.equal(result.changed, false)
  assert.equal(result.brief.sketch, null)
  rmSync(dir, { recursive: true, force: true })
})

test('single sketch: sketch arrays and the sketches field are rejected with a clear message', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch-array' }, exec)

  await assert.rejects(
    () => tool.execute({ op: 'update', patch: { sketch: [sketch] } }, exec),
    /single object.*not an array|one sketch/i,
  )
  await assert.rejects(
    () => tool.execute({ op: 'update', patch: { sketches: [sketch] } }, exec),
    /sketches.*not supported|brief\.sketch/i,
  )
  const read = await tool.execute({ op: 'read' }, exec)
  assert.equal(read.brief.sketch, null)
  assert.equal(read.brief.revision, 1)
  rmSync(dir, { recursive: true, force: true })
})

test('single sketch: writing the same object again is idempotent', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch-idempotent' }, exec)
  await tool.execute({ op: 'update', patch: { sketch } }, exec)
  const same = structuredClone(sketch)
  const again = await tool.execute({ op: 'update', patch: { sketch: same } }, exec)
  assert.equal(again.changed, false)
  assert.deepEqual(again.brief.sketch, sketch)
  rmSync(dir, { recursive: true, force: true })
})

test('single sketch: reset still clears the sketch with confirm:true', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch-reset' }, exec)
  await tool.execute({ op: 'update', patch: { sketch } }, exec)
  await assert.rejects(() => tool.execute({ op: 'reset' }, exec), /confirm/i)
  const reset = await tool.execute({ op: 'reset', confirm: true }, exec)
  assert.equal(reset.brief.sketch, null)
  assert.equal(reset.brief.revision, 1)
  assert.ok(reset.archived)
  rmSync(dir, { recursive: true, force: true })
})

test('single sketch: missing method args are rejected with a specific reason', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch-args' }, exec)
  const line = {
    flow: 'parametric',
    plane: { type: 'XY', offset: 0 },
    start: [0, 0],
    pattern: 'line',
    method: 'two_point',
    closed: false,
    command: 'sketch.line',
    args: { length: 10 },
  }
  await assert.rejects(
    () => tool.execute({ op: 'update', patch: { sketch: line } }, exec),
    (error) => {
      assert.match(error.message, /brief\.sketch is invalid/)
      assert.match(error.message, /args\.end/)
      return true
    },
  )
  const read = await tool.execute({ op: 'read' }, exec)
  assert.equal(read.brief.sketch, null)
  assert.equal(read.brief.revision, 1)
  rmSync(dir, { recursive: true, force: true })
})

test('single sketch: a sketch without start is rejected (start default is not silently applied)', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch-start' }, exec)
  const noStart = { ...sketch }
  delete noStart.start
  await assert.rejects(
    () => tool.execute({ op: 'update', patch: { sketch: noStart } }, exec),
    (error) => {
      assert.match(error.message, /brief\.sketch is invalid/)
      assert.match(error.message, /start/)
      return true
    },
  )
  const read = await tool.execute({ op: 'read' }, exec)
  assert.equal(read.brief.sketch, null)
  assert.equal(read.brief.revision, 1)
  rmSync(dir, { recursive: true, force: true })
})

test('single sketch: a method that does not belong to the pattern is rejected', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch-method' }, exec)
  const wrong = { ...sketch, pattern: 'rectangle', method: 'center_radius', command: 'sketch.rectangle.center' }
  await assert.rejects(
    () => tool.execute({ op: 'update', patch: { sketch: wrong } }, exec),
    (error) => {
      assert.match(error.message, /brief\.sketch is invalid/)
      assert.match(error.message, /method for rectangle must be one of/)
      return true
    },
  )
  const read = await tool.execute({ op: 'read' }, exec)
  assert.equal(read.brief.sketch, null)
  rmSync(dir, { recursive: true, force: true })
})

test('single sketch: a construction plane without a name is rejected', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch-construction' }, exec)
  const construction = { ...sketch, plane: { type: 'construction', offset: 0 } }
  await assert.rejects(
    () => tool.execute({ op: 'update', patch: { sketch: construction } }, exec),
    (error) => {
      assert.match(error.message, /brief\.sketch is invalid/)
      assert.match(error.message, /construction plane requires name/)
      return true
    },
  )
  const read = await tool.execute({ op: 'read' }, exec)
  assert.equal(read.brief.sketch, null)
  rmSync(dir, { recursive: true, force: true })
})

test('single sketch: a command that does not match pattern/method is rejected', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch-command' }, exec)
  const wrong = { ...sketch, command: 'sketch.circle.two_point' }
  await assert.rejects(
    () => tool.execute({ op: 'update', patch: { sketch: wrong } }, exec),
    (error) => {
      assert.match(error.message, /brief\.sketch is invalid/)
      assert.match(error.message, /command for circle\/center_radius must be sketch\.circle\.center/)
      return true
    },
  )
  const read = await tool.execute({ op: 'read' }, exec)
  assert.equal(read.brief.sketch, null)
  rmSync(dir, { recursive: true, force: true })
})

test('single sketch: a rectangle without closed is normalized to closed=true on write', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch-closed-default' }, exec)
  const rectangle = {
    flow: 'parametric',
    plane: { type: 'XY', offset: 0 },
    start: [0, 0],
    pattern: 'rectangle',
    method: 'two_point',
    command: 'sketch.rectangle.two_point',
    args: { end: [40, 20] },
  }
  const written = await tool.execute({ op: 'update', patch: { sketch: rectangle } }, exec)
  assert.equal(written.changed, true)
  assert.equal(written.brief.sketch.closed, true)
  const read = await tool.execute({ op: 'read' }, exec)
  assert.equal(read.brief.sketch.closed, true)
  assert.deepEqual(read.brief.sketch.args, { end: [40, 20] })
  rmSync(dir, { recursive: true, force: true })
})

test('single sketch: a circle without closed is normalized to closed=true on write', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch-circle-closed-default' }, exec)
  const circle = {
    flow: 'parametric',
    plane: { type: 'XY', offset: 0 },
    start: [0, 0],
    pattern: 'circle',
    method: 'center_radius',
    command: 'sketch.circle.center',
    args: { radius: 5 },
  }
  const written = await tool.execute({ op: 'update', patch: { sketch: circle } }, exec)
  assert.equal(written.changed, true)
  assert.equal(written.brief.sketch.closed, true)
  const read = await tool.execute({ op: 'read' }, exec)
  assert.equal(read.brief.sketch.closed, true)
  assert.deepEqual(read.brief.sketch.args, { radius: 5 })
  rmSync(dir, { recursive: true, force: true })
})

const closedPatterns = [
  { pattern: 'rectangle', method: 'two_point', command: 'sketch.rectangle.two_point', args: { end: [40, 20] } },
  { pattern: 'circle', method: 'center_radius', command: 'sketch.circle.center', args: { radius: 5 } },
]

for (const shape of closedPatterns) {
  for (const value of [false, 'false', 0, null]) {
    test(`single sketch: an explicit ${JSON.stringify(value)} closure on a ${shape.pattern} is rejected`, async () => {
      const { dir, tool, exec } = setup()
      await tool.execute({ op: 'init', project: `single-sketch-${shape.pattern}-closed-invalid` }, exec)
      const before = await tool.execute({ op: 'read' }, exec)
      const invalid = {
        flow: 'parametric',
        plane: { type: 'XY', offset: 0 },
        start: [0, 0],
        pattern: shape.pattern,
        method: shape.method,
        closed: value,
        command: shape.command,
        args: shape.args,
      }
      await assert.rejects(
        () => tool.execute({ op: 'update', patch: { sketch: invalid } }, exec),
        /closed/,
      )
      const after = await tool.execute({ op: 'read' }, exec)
      assertUnchanged(before.brief, after.brief)
      rmSync(dir, { recursive: true, force: true })
    })
  }
}

test('single sketch: a line still requires an explicit boolean closed', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch-line-no-closed' }, exec)
  const line = {
    flow: 'parametric',
    plane: { type: 'XY', offset: 0 },
    start: [0, 0],
    pattern: 'line',
    method: 'two_point',
    command: 'sketch.line',
    args: { end: [10, 0] },
  }
  await assert.rejects(
    () => tool.execute({ op: 'update', patch: { sketch: line } }, exec),
    /closed/,
  )
  const read = await tool.execute({ op: 'read' }, exec)
  assert.equal(read.brief.sketch, null)
  rmSync(dir, { recursive: true, force: true })
})

test('single sketch: a line accepts an explicit false closure', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch-line-closed-false' }, exec)
  const line = {
    flow: 'parametric',
    plane: { type: 'XY', offset: 0 },
    start: [0, 0],
    pattern: 'line',
    method: 'two_point',
    closed: false,
    command: 'sketch.line',
    args: { end: [10, 0] },
  }
  const written = await tool.execute({ op: 'update', patch: { sketch: line } }, exec)
  assert.equal(written.changed, true)
  assert.equal(written.brief.sketch.closed, false)
  const read = await tool.execute({ op: 'read' }, exec)
  assert.equal(read.brief.sketch.closed, false)
  rmSync(dir, { recursive: true, force: true })
})

test('single sketch: a complete parametric sketch is accepted and replaced', async () => {
  const { dir, tool, exec } = setup()
  await tool.execute({ op: 'init', project: 'single-sketch-parametric' }, exec)
  const parametrized = {
    flow: 'parametric',
    plane: { type: 'construction', offset: 0, name: 'mid-plane' },
    start: [0, 0],
    pattern: 'rectangle',
    method: 'two_point',
    closed: true,
    command: 'sketch.rectangle.two_point',
    args: { end: [40, 20] },
  }
  const first = await tool.execute({ op: 'update', patch: { sketch: parametrized } }, exec)
  assert.equal(first.changed, true)
  assert.deepEqual(first.brief.sketch, parametrized)
  const replacement = { ...parametrized, args: { end: [60, 30] } }
  const second = await tool.execute({ op: 'update', patch: { sketch: replacement } }, exec)
  assert.equal(second.changed, true)
  assert.deepEqual(second.brief.sketch, replacement)
  assert.equal(second.brief.revision, first.brief.revision + 1)
  rmSync(dir, { recursive: true, force: true })
})
