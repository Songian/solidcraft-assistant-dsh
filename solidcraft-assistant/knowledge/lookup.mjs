import { readFileSync } from 'node:fs'

const DOCS = {
  GB: JSON.parse(readFileSync(new URL('./standards/GB.json', import.meta.url), 'utf8')),
  ISO: JSON.parse(readFileSync(new URL('./standards/ISO.json', import.meta.url), 'utf8')),
}

export function linearTolerance(standard, valueMm, process = 'machining') {
  if (['sheet-metal', 'additive', 'casting'].includes(process)) {
    return { status: 'unverifiable', reason: `general tolerance not applicable to ${process}` }
  }
  if (!Number.isFinite(valueMm) || valueMm <= 0) return { status: 'unverifiable', reason: 'value must be positive' }
  const doc = DOCS[standard]
  if (!doc) return { status: 'unverifiable', reason: `unknown standard ${standard}` }
  const rule = doc.rules.find((item) => item.id.endsWith('TOL.LINEAR.M'))
  if (!rule) return { status: 'unverifiable', reason: `no linear rule for ${standard}` }
  const hit = rule.ranges.find(([lo, hi]) => valueMm >= lo && valueMm <= hi)
  if (!hit) return { status: 'unverifiable', reason: 'outside table range' }
  return { status: 'unverified', valueMm: hit[2], edition: rule.edition, locator: rule.verification.locator }
}
