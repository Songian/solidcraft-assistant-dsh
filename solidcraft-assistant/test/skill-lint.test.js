import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FILES = [
  '../skills/solidcraft-assistant/SKILL.md',
  '../skills/solidcraft-assistant/references/bug-report.md',
  '../skills/solidcraft-assistant/references/gui-preview.md',
  '../skills/solidcraft-assistant/references/report-template.md',
  '../skills/solidcraft-assistant/references/sketch-input.md',
  '../skills/solidcraft-assistant/references/standards/GB.md',
  '../skills/solidcraft-assistant/references/standards/ISO.md',
]

const FORBIDDEN = /\b(bash|pwsh|python3?|solidcraft-cli|web_search|web_fetch|timeout)\b/
const EXEMPT = /(不要|不得|禁止|无需|不需要|no shell)/

test('K3: skill/references have no live shell/web commands', () => {
  const hits = []
  for (const file of FILES) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8')
    text.split(/\r?\n/).forEach((line, index) => {
      if (FORBIDDEN.test(line) && !EXEMPT.test(line)) hits.push(`${file}:${index + 1}: ${line.trim()}`)
    })
  }
  assert.deepEqual(hits, [])
})

test('K4: skill and reference budgets', () => {
  const skill = readFileSync(new URL(FILES[0], import.meta.url), 'utf8')
  assert.ok(Buffer.byteLength(skill) <= 6144)
  for (const file of FILES.slice(1)) {
    assert.ok(Buffer.byteLength(readFileSync(new URL(file, import.meta.url), 'utf8')) <= 4096, file)
  }
})
