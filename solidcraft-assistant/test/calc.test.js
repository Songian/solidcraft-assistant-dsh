import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateCalc } from '../plugin/tools/calc.js'

test('length conversion and addition', () => {
  assert.equal(evaluateCalc('120 mm + 3 cm').display, '150 mm')
  assert.equal(evaluateCalc('2 * 3 in', {}, 'mm').value, 152.4)
})

test('division binds implicit unit product', () => {
  assert.equal(evaluateCalc('1 m / 2 s').display, '500 mm/s')
  assert.equal(evaluateCalc('1 m / (2 s)').value, 500)
})

test('precedence and exponent grammar', () => {
  assert.equal(evaluateCalc('-2^2').value, -4)
  assert.equal(evaluateCalc('(-2)^2').value, 4)
  assert.equal(evaluateCalc('10^-3').value, 0.001)
  assert.equal(evaluateCalc('2^0.5').value, 1.41421356237)
})

test('errors are explicit', () => {
  assert.throws(() => evaluateCalc('asin(2)'), /\[-1, 1\]/)
  assert.throws(() => evaluateCalc('2^1024'), /magnitude exceeds 64/)
  assert.throws(() => evaluateCalc('1 / 0'), /division by zero/)
})

test('decimal rounding half-even', () => {
  assert.equal(evaluateCalc('1.005', {}, null, 2).value, 1)
  assert.equal(evaluateCalc('2.675', {}, null, 2).value, 2.68)
})

test('percent and density', () => {
  assert.equal(evaluateCalc('0.2 %').value, 0.002)
  assert.equal(evaluateCalc('2.7 g/cm^3 * 20 cm^3', {}, 'g').value, 54)
})
