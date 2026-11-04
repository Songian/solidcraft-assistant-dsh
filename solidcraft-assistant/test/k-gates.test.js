import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { linearTolerance } from '../knowledge/lookup.mjs'
import { checkReport } from '../plugin/tools/verifier.js'

const gb = JSON.parse(readFileSync(new URL('../knowledge/standards/GB.json', import.meta.url), 'utf8'))
const iso = JSON.parse(readFileSync(new URL('../knowledge/standards/ISO.json', import.meta.url), 'utf8'))
const materials = JSON.parse(readFileSync(new URL('../knowledge/materials/materials.json', import.meta.url), 'utf8'))
const registry = JSON.parse(readFileSync(new URL('../knowledge/constraints/registry.json', import.meta.url), 'utf8'))

test('K0: standard/material/registry subset validate', () => {
  for (const doc of [gb, iso]) {
    assert.equal(doc.schema, 'solidcraft-standard/1')
    for (const rule of doc.rules) {
      assert.ok(rule.id && rule.topic && rule.standard && rule.edition)
      assert.ok(rule.verification?.status)
    }
  }
  assert.equal(materials.kind, 'material')
  for (const entry of materials.entries) assert.ok(entry.density_g_cm3 > 0)
  assert.equal(registry.schema, 'solidcraft-registry/1')
  assert.ok(registry.rules.length >= 3)
})

test('K2: lookup returns unverified or unverifiable, never a verified value', () => {
  assert.equal(linearTolerance('GB', 58).valueMm, 0.3)
  assert.equal(linearTolerance('ISO', 58).valueMm, 0.3)
  assert.equal(linearTolerance('GB', 58).status, 'unverified')
  assert.equal(linearTolerance('GB', 58, 'additive').status, 'unverifiable')
  assert.equal(linearTolerance('GB', 5000).status, 'unverifiable')
})

test('K5: report check is deterministic and records hashes', () => {
  const text = '## 结论\nv 1 mm\n## 计算\n1 mm\n## 校核\n1 mm'
  const a = checkReport(text)
  const b = checkReport(text)
  assert.deepEqual(a, b)
  assert.equal(a.stats.skillVersion, '0.0.1')
  assert.equal(typeof a.stats.knowledgeHash, 'string')
  assert.equal(a.stats.knowledgeHash.length, 64)
  assert.equal(typeof a.stats.registryHash, 'string')
})

test('K1: skill knowledgeHash matches knowledge.lock', () => {
  const skill = readFileSync(new URL('../skills/solidcraft-assistant/SKILL.md', import.meta.url), 'utf8')
  const match = /^knowledgeHash:\s*([0-9a-f]{64})$/m.exec(skill)
  assert.ok(match)
  const lock = readFileSync(new URL('../knowledge.lock', import.meta.url))
  assert.equal(match[1], createHash('sha256').update(lock).digest('hex'))
})
