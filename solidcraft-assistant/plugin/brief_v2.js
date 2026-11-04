import { existsSync, readFileSync, renameSync, writeFileSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export const inject = ['tools', 'workingDirectory']

const SCHEMA = 'solidcraft-brief/2'
const TOP_KEYS = new Set([
  'schema', 'project', 'revision', 'intent', 'requirements', 'intent_parameters',
  'checkpoints', 'artifacts', 'standard_refs', 'actual', 'updated',
])
const DEEP_KEYS = new Set(['intent', 'artifacts', 'actual'])
const ARRAY_KEYS = new Set(['requirements', 'intent_parameters', 'checkpoints', 'standard_refs'])

function now() {
  return new Date().toISOString()
}

function defaultBrief(project) {
  return {
    schema: SCHEMA,
    project,
    revision: 1,
    intent: {
      summary: '',
      standard: 'GB',
      units: { length: 'mm', angle: 'deg' },
      assumptions: [],
      open_questions: [],
    },
    requirements: [],
    intent_parameters: [],
    checkpoints: [],
    artifacts: { design: '', renders: [] },
    standard_refs: [],
    actual: null,
    updated: now(),
  }
}

function readBrief(file) {
  if (!existsSync(file)) throw new Error('brief.json not found; run brief {"op":"init"} first')
  const data = JSON.parse(readFileSync(file, 'utf8'))
  if (data?.schema !== SCHEMA) {
    throw new Error(
      `unsupported brief schema: ${String(data?.schema)} (expected ${SCHEMA}); ` +
      'move the old file aside or run brief {"op":"reset","confirm":true}',
    )
  }
  return data
}

function writeBrief(file, data) {
  data.updated = now()
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  renameSync(tmp, file)
}

function realOrResolved(value) {
  try {
    return realpathSync(value)
  } catch {
    try {
      return join(realpathSync(dirname(value)), basename(value))
    } catch {
      return resolve(value)
    }
  }
}

function insideRoot(root, value) {
  if (typeof value !== 'string' || value.trim() === '') return { absolute: String(value), inside: false, invalid: true }
  if (process.platform === 'win32') {
    const tail = value.replace(/^[A-Za-z]:/, '')
    if (tail.includes(':')) return { absolute: value, inside: false, invalid: true }
  }
  const absolute = isAbsolute(value) ? value : resolve(root, value)
  const rel = relative(realOrResolved(root), realOrResolved(absolute))
  const inside = rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
  return { absolute, inside, invalid: false }
}

function measureVolume(measure) {
  if (!measure || typeof measure !== 'object') return null
  if (typeof measure.volume_mm3 === 'number') return measure.volume_mm3
  if (typeof measure.total?.volume_mm3 === 'number') return measure.total.volume_mm3
  return null
}

export function auditBrief(data, root, measure, topology) {
  const errors = []
  const warnings = []
  const requirements = Array.isArray(data.requirements) ? data.requirements : []
  const mapped = []
  const unmapped = []
  for (const requirement of requirements) {
    const verify = requirement?.verify
    if (verify && typeof verify === 'object' && typeof verify.tool === 'string' && typeof verify.predicate === 'string') {
      mapped.push(requirement.id)
    } else {
      unmapped.push(requirement?.id || '(no id)')
    }
  }
  if (unmapped.length > 0) warnings.push(`requirements without executable verify: ${unmapped.join(', ')}`)

  const checkpoints = Array.isArray(data.checkpoints) ? data.checkpoints : []
  const checkpoint = [...checkpoints].reverse().find((item) => item?.expected && typeof item.expected.volume_mm3 === 'number')
  const measured = measureVolume(measure)
  let volume = { status: 'unverifiable', reason: 'no checkpoint with expected volume_mm3' }
  if (checkpoint && measured !== null) {
    const expected = checkpoint.expected.volume_mm3
    const tol = checkpoint.tol || {}
    const abs = Math.abs(measured - expected)
    const rel = expected === 0 ? null : abs / Math.abs(expected)
    let pass = null
    if (typeof tol.abs === 'number') pass = abs <= tol.abs
    else if (typeof tol.rel === 'number') pass = rel !== null && rel <= tol.rel
    volume = {
      status: pass === null ? 'unverifiable' : pass ? 'pass' : 'fail',
      expected, measured, abs, rel, tol, checkpoint: checkpoint.after || null,
    }
    if (pass === false) errors.push(`volume outside tolerance: measured ${measured}, expected ${expected}`)
    if (pass === null) warnings.push('checkpoint has no numeric tolerance')
  } else if (!checkpoint) {
    warnings.push('no checkpoint with expected volume_mm3')
  } else if (measured === null) {
    warnings.push('measure input has no volume_mm3')
  }

  const paths = []
  const design = data.artifacts?.design
  const renders = Array.isArray(data.artifacts?.renders) ? data.artifacts.renders : []
  const entries = [['design', design], ...renders.map((item, index) => [`renders[${index}]`, item])]
  for (const [label, value] of entries) {
    if (typeof value !== 'string') {
      errors.push(`${label} must be a string path`)
      paths.push({ label, value: String(value), status: 'invalid' })
      continue
    }
    if (!value) {
      warnings.push(`${label} is empty`)
      continue
    }
    const check = insideRoot(root, value)
    if (!check.inside) {
      errors.push(`${label} is outside project root: ${value}`)
      paths.push({ label, value, status: 'outside' })
      continue
    }
    const exists = existsSync(check.absolute)
    paths.push({ label, value, status: exists ? 'exists' : 'missing' })
    if (!exists) warnings.push(`${label} file is missing: ${value}`)
  }

  let topo = null
  if (topology && typeof topology === 'object') {
    const bodies = Array.isArray(topology.bodies) ? topology.bodies : []
    const cylinders = bodies.reduce((sum, body) => sum + (Array.isArray(body?.cylinders) ? body.cylinders.length : 0), 0)
    topo = { bodies: bodies.length, cylinders }
  }

  const gate = {
    requirements: mapped.length > 0,
    checkpoint: checkpoint != null,
    volume: volume.status === 'pass',
    artifacts: paths.length > 0 && paths.every((item) => item.status === 'exists'),
    passed: mapped.length > 0 && volume.status === 'pass' && paths.length > 0 && paths.every((item) => item.status === 'exists') && errors.length === 0,
  }

  return {
    ok: errors.length === 0 && gate.passed,
    project: data.project,
    revision: data.revision,
    gate,
    volume,
    requirements: { total: requirements.length, mapped: mapped.length, unmapped },
    paths,
    topology: topo,
    errors,
    warnings,
  }
}

function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('brief update requires a patch object')
  for (const key of Object.keys(patch)) {
    if (!TOP_KEYS.has(key) || key === 'schema' || key === 'updated') throw new Error(`unknown or immutable brief field: ${key}`)
    if (ARRAY_KEYS.has(key) && !Array.isArray(patch[key])) throw new Error(`${key} must be an array`)
    if (DEEP_KEYS.has(key) && patch[key] !== null && (typeof patch[key] !== 'object' || Array.isArray(patch[key]))) {
      throw new Error(`${key} must be an object`)
    }
  }
}

export function apply(ctx) {
  ctx.tools.register({
    name: 'brief',
    description:
      'Read, create, update, audit, or reset the SolidCraft design brief (brief.json) for the current project. ' +
      'Ops: init, read, update, audit, reset. Audit accepts measure/topology JSON and reports volume deviation, ' +
      'unmapped requirements, path violations, and a gate summary.',
    parameters: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['init', 'read', 'update', 'audit', 'reset'] },
        project: { type: 'string', description: 'Project name for init; defaults to the working directory name.' },
        patch: { type: 'object', additionalProperties: true, description: 'Known top-level fields to merge for update.' },
        measure: { type: 'object', additionalProperties: true, description: 'measure tool JSON (total.volume_mm3).' },
        topology: { type: 'object', additionalProperties: true, description: 'body_topology JSON.' },
        confirm: { type: 'boolean', description: 'Required for reset: archive the existing brief and start a new one.' },
      },
      required: ['op'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const session = exec.agent?.session
      if (!session) throw new Error('brief: no agent session')
      const root = ctx.workingDirectory.get(session)
      if (typeof root !== 'string' || root.length === 0) {
        throw new Error('brief: cannot resolve working directory for session')
      }
      const file = join(root, 'brief.json')

      if (args.op === 'init') {
        if (existsSync(file)) return { ok: true, created: false, path: file, brief: readBrief(file) }
        const project = args.project || root.split(/[\\/]/).filter(Boolean).at(-1) || 'project'
        const data = defaultBrief(project)
        writeBrief(file, data)
        return { ok: true, created: true, path: file, brief: data }
      }

      if (args.op === 'read') return { ok: true, path: file, brief: readBrief(file) }

      if (args.op === 'update') {
        validatePatch(args.patch)
        const data = readBrief(file)
        const next = { ...data }
        for (const [key, value] of Object.entries(args.patch)) {
          next[key] = DEEP_KEYS.has(key) ? { ...(data[key] || {}), ...value } : value
        }
        const normalized = { ...next, updated: data.updated }
        if (JSON.stringify(normalized) === JSON.stringify(data)) {
          return { ok: true, path: file, changed: false, brief: data }
        }
        next.revision = Number(data.revision || 0) + 1
        writeBrief(file, next)
        return { ok: true, path: file, changed: true, brief: next }
      }

      if (args.op === 'audit') {
        return auditBrief(readBrief(file), root, args.measure || null, args.topology || null)
      }

      if (args.op === 'reset') {
        if (args.confirm !== true) throw new Error('brief reset requires confirm:true')
        const project = args.project || root.split(/[\\/]/).filter(Boolean).at(-1) || 'project'
        let archived = null
        if (existsSync(file)) {
          archived = `${file}.bak-${Date.now()}`
          renameSync(file, archived)
        }
        const data = defaultBrief(project)
        writeBrief(file, data)
        return { ok: true, path: file, archived, brief: data }
      }

      throw new Error(`unknown brief op: ${String(args.op)}`)
    },
  })
}
