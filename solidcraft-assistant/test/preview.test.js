import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inside } from '../plugin/tools/preview.js'

function root() {
  const dir = mkdtempSync(join(tmpdir(), 'preview-'))
  mkdirSync(join(dir, 'designs'), { recursive: true })
  mkdirSync(join(dir, 'renders'), { recursive: true })
  writeFileSync(join(dir, 'designs', 'a.sc'), 'x')
  return dir
}

test('design and screenshot paths are restricted', () => {
  const dir = root()
  assert.equal(inside(dir, 'designs/a.sc', 'design').endsWith('a.sc'), true)
  assert.throws(() => inside(dir, 'designs/a.txt', 'design'), /\.sc/)
  assert.throws(() => inside(dir, '/etc/passwd', 'design'), /outside/)
  assert.equal(inside(dir, 'renders/a.png', 'screenshot').endsWith('a.png'), true)
  assert.throws(() => inside(dir, 'designs/a.png', 'screenshot'), /renders/)
  assert.throws(() => inside(dir, 'renders/.env.png', 'screenshot'), /denied/)
  rmSync(dir, { recursive: true, force: true })
})

test('sensitive path components are denied', () => {
  const dir = root()
  assert.throws(() => inside(dir, '.scdata/a.sc', 'design'), /denied/)
  assert.throws(() => inside(dir, 'designs/id_rsa.sc', 'design'), /denied/)
  assert.throws(() => inside(dir, 'renders/x.token.png', 'screenshot'), /denied/)
  rmSync(dir, { recursive: true, force: true })
})
