import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../plugin/tools/brief.js'

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'focus-'))
  let tool
  apply({ tools: { register: (definition) => { tool = definition } }, workingDirectory: { get: () => dir } })
  return { dir, tool, exec: { agent: { session: {} } } }
}

test('focus anchor persists across updates and reads', async () => {
  const { dir, tool, exec } = setup()
  const init = await tool.execute({ op: 'init', project: 'focus' }, exec)
  assert.equal(init.brief.focus.stage, 'intake')
  await tool.execute({ op: 'update', patch: { focus: { goal: '安装板', turn_goal: '确认参考面', turn_result: 'partial', next_action: '问起点', stage: 'geometry-first:G2', current_question: '起点', decisions: [{ at: 'now', decision: 'XZ Y=15', reason: '用户' }], open_questions: ['孔径'] } } }, exec)
  const read = await tool.execute({ op: 'read' }, exec)
  assert.equal(read.brief.focus.goal, '安装板')
  assert.equal(read.brief.focus.turn_goal, '确认参考面')
  assert.equal(read.brief.focus.turn_result, 'partial')
  assert.equal(read.brief.focus.next_action, '问起点')
  assert.equal(read.brief.focus.decisions.length, 1)
  assert.equal(read.brief.focus.open_questions[0], '孔径')
  await assert.rejects(() => tool.execute({ op: 'update', patch: { focus: 'lost' } }, exec), /focus/)
  rmSync(dir, { recursive: true, force: true })
})
