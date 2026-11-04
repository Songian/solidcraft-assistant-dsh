import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const gb = JSON.parse(readFileSync(new URL('../knowledge/standards/GB.json', import.meta.url), 'utf8'))
const iso = JSON.parse(readFileSync(new URL('../knowledge/standards/ISO.json', import.meta.url), 'utf8'))
const materials = JSON.parse(readFileSync(new URL('../knowledge/materials/materials.json', import.meta.url), 'utf8'))
const schema = JSON.parse(readFileSync(new URL('../knowledge/schema/knowledge.schema.json', import.meta.url), 'utf8'))
const lock = readFileSync(new URL('../knowledge.lock', import.meta.url), 'utf8')

function linear(rule, value) {
  const hit = rule.ranges.find(([lo, hi]) => value > lo && value <= hi)
  return hit ? hit[2] : null
}

test('GB/ISO linear m class agree at 58 mm', () => {
  const gbRule = gb.rules.find((rule) => rule.id === 'GB.TOL.LINEAR.M')
  const isoRule = iso.rules.find((rule) => rule.id === 'ISO.TOL.LINEAR.M')
  assert.equal(linear(gbRule, 58), 0.3)
  assert.equal(linear(isoRule, 58), 0.3)
})

test('rules carry provenance and unverified status', () => {
  for (const doc of [gb, iso]) {
    assert.equal(doc.schema, 'solidcraft-standard/1')
    for (const rule of doc.rules) {
      assert.ok(rule.standard)
      assert.ok(rule.verification)
      assert.equal(rule.verification.status, 'unverified')
    }
  }
})

test('knowledge schema and lock are present', () => {
  assert.ok(schema.$defs.standard)
  assert.ok(schema.$defs.material)
  for (const line of lock.trim().split('\n')) {
    const [hash, file] = line.trim().split(/\s+/)
    const content = readFileSync(new URL(`../${file}`, import.meta.url))
    assert.equal(createHash('sha256').update(content).digest('hex'), hash, file)
  }
})

test('materials carry density and unverified status', () => {
  assert.equal(materials.kind, 'material')
  for (const entry of materials.entries) {
    assert.ok(entry.density_g_cm3 > 0)
    assert.equal(entry.verification.status, 'unverified')
  }
})
