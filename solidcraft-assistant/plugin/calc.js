// P1 engineering calculator: whitelisted parser + length/angle/mass/time units.
// No eval/new Function; dimensions are tracked as L, A, M, T.

export const inject = ['tools']

const UNITS = {
  mm: { dims: { L: 1 }, factor: 1, label: 'mm' },
  cm: { dims: { L: 1 }, factor: 10, label: 'cm' },
  m: { dims: { L: 1 }, factor: 1000, label: 'm' },
  in: { dims: { L: 1 }, factor: 25.4, label: 'in' },
  ft: { dims: { L: 1 }, factor: 304.8, label: 'ft' },
  deg: { dims: { A: 1 }, factor: 1, label: 'deg' },
  rad: { dims: { A: 1 }, factor: 180 / Math.PI, label: 'rad' },
  g: { dims: { M: 1 }, factor: 1, label: 'g' },
  kg: { dims: { M: 1 }, factor: 1000, label: 'kg' },
  s: { dims: { T: 1 }, factor: 1, label: 's' },
}

const FUNCTIONS = new Set(['sqrt', 'abs', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'min', 'max'])

function cleanDims(dims) {
  const out = {}
  for (const [key, value] of Object.entries(dims)) {
    if (value !== 0) out[key] = value
  }
  return out
}

function sameDims(a, b) {
  const ka = Object.keys(cleanDims(a)).sort()
  const kb = Object.keys(cleanDims(b)).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k])
}

function addDims(a, b, sign) {
  const out = { ...a }
  for (const [key, value] of Object.entries(b)) {
    out[key] = (out[key] || 0) + sign * value
    if (out[key] === 0) delete out[key]
  }
  return out
}

function dimsToLabel(dims) {
  const d = cleanDims(dims)
  const keys = Object.keys(d)
  if (keys.length === 0) return ''
  if (keys.length === 1) {
    const k = keys[0]
    const n = d[k]
    if (k === 'L') return n === 1 ? 'mm' : `mm^${n}`
    if (k === 'A') return n === 1 ? 'deg' : `deg^${n}`
    if (k === 'M') return n === 1 ? 'g' : `g^${n}`
    if (k === 'T') return n === 1 ? 's' : `s^${n}`
  }
  return keys.map((k) => `${k}^${d[k]}`).join('*')
}

function quantity(value, dims) {
  return { v: value, d: cleanDims(dims) }
}

function parseTargetUnit(text) {
  if (!text) return null
  const parts = String(text).split('/')
  let dims = {}
  let factor = 1
  for (let i = 0; i < parts.length; i += 1) {
    const raw = parts[i].trim()
    const match = /^([A-Za-z]+)(?:\^(-?\d+))?$/.exec(raw)
    if (!match) throw new Error(`unsupported target unit: ${text}`)
    const unit = UNITS[match[1]]
    if (!unit) throw new Error(`unknown unit: ${match[1]}`)
    const power = match[2] === undefined ? 1 : Number(match[2])
    const sign = i === 0 ? 1 : -1
    dims = addDims(dims, unit.dims, sign * power)
    factor *= Math.pow(unit.factor, sign * power)
  }
  return { dims, factor, label: String(text) }
}

function tokenize(text) {
  const tokens = []
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (/\s/.test(c)) { i += 1; continue }
    if (/[0-9.]/.test(c)) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(i))
      if (!match) throw new Error(`invalid number at ${i}`)
      tokens.push({ type: 'number', value: Number(match[0]) })
      i += match[0].length
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i))
      tokens.push({ type: 'ident', value: match[0] })
      i += match[0].length
      continue
    }
    if ('+-*/^(),'.includes(c)) {
      tokens.push({ type: c })
      i += 1
      continue
    }
    throw new Error(`unexpected character: ${c}`)
  }
  return tokens
}

class Parser {
  constructor(tokens, variables) {
    this.tokens = tokens
    this.pos = 0
    this.variables = variables || {}
  }
  peek() { return this.tokens[this.pos] }
  next() { return this.tokens[this.pos++] }
  expect(type) {
    const token = this.next()
    if (!token || token.type !== type) throw new Error(`expected ${type}`)
    return token
  }
  parse() {
    const value = this.expr()
    if (this.pos !== this.tokens.length) throw new Error('unexpected trailing tokens')
    return value
  }
  expr() {
    let left = this.term()
    while (this.peek() && (this.peek().type === '+' || this.peek().type === '-')) {
      const op = this.next().type
      const right = this.term()
      if (!sameDims(left.d, right.d)) throw new Error('addition requires the same dimension')
      left = quantity(op === '+' ? left.v + right.v : left.v - right.v, left.d)
    }
    return left
  }
  term() {
    let left = this.factor()
    for (;;) {
      const token = this.peek()
      if (!token) break
      if (token.type === '*' || token.type === '/') {
        this.next()
        const right = this.factor()
        if (token.type === '*') {
          left = quantity(left.v * right.v, addDims(left.d, right.d, 1))
        } else {
          if (right.v === 0) throw new Error('division by zero')
          left = quantity(left.v / right.v, addDims(left.d, right.d, -1))
        }
        continue
      }
      if (token.type === 'number' || token.type === 'ident' || token.type === '(') {
        const right = this.factor()
        left = quantity(left.v * right.v, addDims(left.d, right.d, 1))
        continue
      }
      break
    }
    return left
  }
  factor() {
    let value = this.unary()
    if (this.peek() && this.peek().type === '^') {
      this.next()
      const exp = this.next()
      if (!exp || exp.type !== 'number' || !Number.isInteger(exp.value)) {
        throw new Error('exponent must be an integer number')
      }
      if (Object.keys(value.d).length > 0 && !Number.isInteger(exp.value)) {
        throw new Error('dimensional exponent must be an integer')
      }
      value = quantity(Math.pow(value.v, exp.value), addDims({}, value.d, exp.value))
    }
    return value
  }
  unary() {
    if (this.peek() && this.peek().type === '-') { this.next(); const q = this.unary(); return quantity(-q.v, q.d) }
    if (this.peek() && this.peek().type === '+') { this.next(); return this.unary() }
    return this.primary()
  }
  primary() {
    const token = this.next()
    if (!token) throw new Error('unexpected end of expression')
    if (token.type === 'number') return quantity(token.value, {})
    if (token.type === '(') {
      const value = this.expr()
      this.expect(')')
      return value
    }
    if (token.type !== 'ident') throw new Error(`unexpected token: ${token.type}`)
    const name = token.value
    if (this.peek() && this.peek().type === '(') {
      if (!FUNCTIONS.has(name)) throw new Error(`unknown function: ${name}`)
      this.next()
      const args = []
      if (this.peek() && this.peek().type !== ')') {
        args.push(this.expr())
        while (this.peek() && this.peek().type === ',') { this.next(); args.push(this.expr()) }
      }
      this.expect(')')
      return this.callFunction(name, args)
    }
    if (Object.prototype.hasOwnProperty.call(this.variables, name)) {
      const raw = this.variables[name]
      if (typeof raw === 'number') return quantity(raw, {})
      if (typeof raw === 'string') return parseExpression(raw, {}, null)
      throw new Error(`variable ${name} must be a number or a unit string`)
    }
    if (name === 'pi') return quantity(Math.PI, {})
    if (UNITS[name]) return quantity(UNITS[name].factor, UNITS[name].dims)
    throw new Error(`unknown identifier: ${name}`)
  }
  callFunction(name, args) {
    const one = () => {
      if (args.length !== 1) throw new Error(`${name} expects one argument`)
      return args[0]
    }
    if (name === 'sqrt') {
      const q = one()
      if (q.v < 0) throw new Error('sqrt of a negative value')
      const dims = {}
      for (const [key, value] of Object.entries(q.d)) {
        if (value % 2 !== 0) throw new Error('sqrt requires even dimension exponents')
        dims[key] = value / 2
      }
      return quantity(Math.sqrt(q.v), dims)
    }
    if (name === 'abs') { const q = one(); return quantity(Math.abs(q.v), q.d) }
    if (name === 'sin' || name === 'cos' || name === 'tan') {
      const q = one()
      if (!sameDims(q.d, { A: 1 })) throw new Error(`${name} requires an angle`)
      const rad = (q.v * Math.PI) / 180
      return quantity(Math[name](rad), {})
    }
    if (name === 'asin' || name === 'acos' || name === 'atan') {
      const q = one()
      if (Object.keys(q.d).length !== 0) throw new Error(`${name} requires a dimensionless value`)
      return quantity((Math[name](q.v) * 180) / Math.PI, { A: 1 })
    }
    if (name === 'min' || name === 'max') {
      if (args.length !== 2) throw new Error(`${name} expects two arguments`)
      if (!sameDims(args[0].d, args[1].d)) throw new Error(`${name} requires the same dimension`)
      return quantity(Math[name](args[0].v, args[1].v), args[0].d)
    }
    throw new Error(`unknown function: ${name}`)
  }
}

function parseExpression(text, variables, targetUnit) {
  const value = new Parser(tokenize(String(text)), variables).parse()
  if (targetUnit) {
    const target = parseTargetUnit(targetUnit)
    if (!sameDims(value.d, target.dims)) {
      throw new Error(`target unit ${targetUnit} does not match ${dimsToLabel(value.d) || 'dimensionless'}`)
    }
    return { ...value, displayValue: value.v / target.factor, displayUnit: target.label }
  }
  return { ...value, displayValue: value.v, displayUnit: dimsToLabel(value.d) }
}

export function evaluateCalc(expression, variables = {}, targetUnit = null) {
  if (!expression || typeof expression !== 'string') throw new Error('expression is required')
  const result = parseExpression(expression, variables, targetUnit)
  const rounded = Number(result.displayValue.toPrecision(12))
  return {
    ok: true,
    expression,
    value: rounded,
    unit: result.displayUnit,
    dims: result.d,
    display: result.displayUnit ? `${rounded} ${result.displayUnit}` : String(rounded),
  }
}

export function apply(ctx) {
  ctx.tools.register({
    name: 'calc',
    description:
      'Evaluate an engineering expression with units. Supports numbers, + - * / ^, sqrt/abs/sin/cos/tan/asin/acos/atan/min/max, pi, ' +
      'variables, and units mm/cm/m/in/ft/deg/rad/g/kg/s. Returns value, unit, dimensions and display text.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Expression, e.g. "2 * 3 in + 10 mm" or "sin(30 deg)".' },
        variables: {
          type: 'object',
          additionalProperties: { oneOf: [{ type: 'number' }, { type: 'string' }] },
          description: 'Optional variables: numbers or unit strings, e.g. {"L":"120 mm"}.',
        },
        unit: { type: 'string', description: 'Optional target unit, e.g. "mm", "in", "g/cm^3".' },
      },
      required: ['expression'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      return evaluateCalc(args.expression, args.variables || {}, args.unit || null)
    },
  })
}
