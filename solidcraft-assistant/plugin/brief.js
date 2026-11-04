import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

export const inject = ['tools']

const SCHEMA = 'solidcraft-brief/2'

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
  if (!existsSync(file)) {
    throw new Error('brief.json not found; run brief {"op":"init"} first')
  }
  const data = JSON.parse(readFileSync(file, 'utf8'))
  if (data?.schema !== SCHEMA) {
    throw new Error(`unsupported brief schema: ${String(data?.schema)} (expected ${SCHEMA})`)
  }
  return data
}

function writeBrief(file, data) {
  data.updated = now()
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  renameSync(tmp, file)
}

function insideRoot(root, value) {
  const absolute = isAbsolute(value) ? value : resolve(root, value)
  const rel = relative(resolve(root), resolve(absolute))
  return { absolute, inside: rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) }
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
    if (verify && typeof verify === 'object' && verify.tool && verify.predicate) mapped.push(requirement.id)
    else unmapped.push(requirement?.id || '(no id)')
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
      expected,
      measured,
      abs,
      rel,
      tol,
      checkpoint: checkpoint.after || null,
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
  for (const [label, value] of [['design', design], ...renders.map((item, index) => [`renders[${index}]`, item])]) {
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
    paths.push({ label, value, status: existsSync(check.absolute) ? 'exists' : 'missing' })
    if (!existsSync(check.absolute)) warnings.push(`${label} file is missing: ${value}`)
  }

  let topo = null
  if (topology && typeof topology === 'object') {
    const bodies = Array.isArray(topology.bodies) ? topology.bodies : []
    const cylinders = bodies.reduce((sum, body) => sum + (Array.isArray(body?.cylinders) ? body.cylinders.length : 0), 0)
    topo = { bodies: bodies.length, cylinders }
  }

  return {
    ok: errors.length === 0,
    project: data.project,
    revision: data.revision,
    volume,
    requirements: { total: requirements.length, mapped: mapped.length, unmapped },
    paths,
    topology: topo,
    errors,
    warnings,
  }
}

export function apply(ctx) {
  ctx.tools.register({
    name: 'brief',
    description:
      'Read, create, update, or audit the SolidCraft design brief (brief.json) for the current project. ' +
      'Ops: init, read, update, audit. Audit accepts the measure/topology JSON and reports volume deviation, ' +
      'unmapped requirements and path violations.',
    parameters: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['init', 'read', 'update', 'audit'] },
        project: { type: 'string', description: 'Project name for init; defaults to the working directory name.' },
        patch: { type: 'object', additionalProperties: true, description: 'Top-level fields to merge for update.' },
        measure: { type: 'object', additionalProperties: true, description: 'measure tool JSON (total.volume_mm3).' },
        topology: { type: 'object', additionalProperties: true, description: 'body_topology JSON.' },
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
      const wd = ctx.get('workingDirectory')
      const root = wd ? wd.get(session) : process.cwd()
      const file = join(root, 'brief.json')

      if (args.op === 'init') {
        if (existsSync(file)) {
          return { ok: true, created: false, path: file, brief: readBrief(file) }
        }
        const project = args.project || root.split(/[\\/]/).filter(Boolean).at(-1) || 'project'
        const data = defaultBrief(project)
        writeBrief(file, data)
        return { ok: true, created: true, path: file, brief: data }
      }

      if (args.op === 'read') {
        return { ok: true, path: file, brief: readBrief(file) }
      }

      if (args.op === 'update') {
        if (!args.patch || typeof args.patch !== 'object' || Array.isArray(args.patch)) {
          throw new Error('brief update requires a patch object')
        }
        const data = readBrief(file)
        if (args.patch.schema !== undefined && args.patch.schema !== SCHEMA) {
          throw new Error(`cannot change brief schema to ${String(args.patch.schema)}`)
        }
        const next = { ...data, ...args.patch, revision: Number(data.revision || 0) + 1 }
        writeBrief(file, next)
        return { ok: true, path: file, brief: next }
      }

      if (args.op === 'audit') {
        return auditBrief(readBrief(file), root, args.measure || null, args.topology || null)
      }

      throw new Error(`unknown brief op: ${String(args.op)}`)
    },
  })
}
