import test from 'node:test'
import assert from 'node:assert/strict'
import { checkReport } from '../plugin/tools/verifier.js'

const good = `## 结论
体积 56935.17 mm³，误差 0.02%。
## 假设
材料 6061-T6，密度 2.70 g/cm³。
## 计算
V = 120 mm × 50 mm × 6 mm = 36000 mm³。
## 校核
实测 36000.1 mm³，偏差 2.8e-6。
## 未决
无。`

test('good report passes', () => {
  const result = checkReport(good)
  assert.equal(result.ok, true)
  assert.deepEqual(result.errors, [])
})

test('unverified standard citation fails', () => {
  const result = checkReport('## 结论\n符合 GB/T 1804-2000 表1 m 级。\n## 计算\n1 mm\n## 校核\n1 mm')
  assert.equal(result.ok, false)
  assert.equal(result.errors.some((error) => error.includes('not verified')), true)
})

test('colloquial and uncited compliance fail', () => {
  const result = checkReport('结论：大概。这个零件应该没问题，符合 ASTM F2921 标准。')
  assert.equal(result.ok, false)
  assert.equal(result.errors.includes('banned phrasing: 大概'), true)
  assert.equal(result.errors.includes('banned phrasing: 应该没问题'), true)
  assert.equal(result.errors.some((error) => error.startsWith('missing required section')), true)
})
