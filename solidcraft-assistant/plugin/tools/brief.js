import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { validatePlan } from './sketch.js'

export const inject = ['tools', 'workingDirectory']

const SCHEMA = 'solidcraft-brief/2'

function readHash(candidates) {
  for (const relative of candidates) {
    try { return createHash('sha256').update(readFileSync(new URL(relative, import.meta.url))).digest('hex') } catch { /* next layout */ }
  }
  return null
}

const KNOWLEDGE_HASH = readHash(['../../knowledge.lock', '../knowledge.lock'])
const REGISTRY_HASH = readHash(['../../knowledge/constraints/registry.json', '../knowledge/constraints/registry.json'])
const SKILL_VERSION = '0.0.1'
const TOP_KEYS = new Set([
  'schema', 'project', 'design_mode', 'design_mode_reason', 'revision', 'intent', 'requirements', 'intent_parameters',
  'checkpoints', 'sketch', 'focus', 'artifacts', 'standard_refs', 'actual', 'updated',
])
const DEEP_KEYS = new Set(['intent', 'artifacts', 'actual', 'sketch', 'focus'])
const ARRAY_KEYS = new Set(['requirements', 'intent_parameters', 'checkpoints', 'standard_refs'])

function now() {
  return new Date().toISOString()
}

function defaultBrief(project) {
  return {
    schema: SCHEMA,
    project,
    design_mode: null,
    design_mode_reason: null,
    design_mode_history: [],
    revision: 1,
    intent: {
      summary: '',
      standard: 'GB',
      units: { length: 'mm', angle: 'deg' },
      assumptions: [],
      open_questions: [],
      sketch_required: true,
      no_sketch_reason: null,
    },
    requirements: [],
    intent_parameters: [],
    checkpoints: [],
    sketch: null,
    focus: {
      goal: '',
      turn_goal: '',
      turn_result: null,
      next_action: null,
      stage: 'intake',
      current_question: '',
      decisions: [],
      open_questions: [],
      last_anchor: null,
    },
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
  const parts = rel.split(sep).map((part) => part.toLowerCase())
  const denied = parts.some((part) => part === '.scdata' || part === '.git' || part === 'node_modules' || part.startsWith('.env') || part.includes('.token') || part.includes('.pem') || part.startsWith('id_'))
  return { absolute, inside, invalid: denied }
}

function measureVolume(measure) {
  if (!measure || typeof measure !== 'object') return null
  if (typeof measure.volume_mm3 === 'number') return measure.volume_mm3
  if (typeof measure.total?.volume_mm3 === 'number') return measure.total.volume_mm3
  return null
}

// Shared sketch validation: reuse sketch.js so method/args/command stay in sync
// with the sketch tool. `complete` additionally requires every required args key;
// both the brief write path and audits require the full sketch object.
function sketchIssues(sketch, { complete = false } = {}) {
  if (!sketch || typeof sketch !== 'object' || Array.isArray(sketch)) return ['sketch must be a single object']
  const plan = validatePlan(sketch)
  const issues = [...plan.errors]
  if (!sketch.plane || typeof sketch.plane !== 'object' || Array.isArray(sketch.plane)) {
    issues.push('plane is required and must be an object')
  }
  if (sketch.start === undefined) issues.push('start must be an array of two finite numbers')
  if (complete && plan.missing.length > 0) issues.push(`missing ${plan.missing.join(', ')}`)
  if (typeof sketch.closed !== 'boolean') issues.push('closed must be a boolean')
  if (typeof sketch.command !== 'string' || !sketch.command) {
    issues.push('command must be a non-empty string')
  } else if (plan.ok && sketch.command !== plan.plan.command) {
    issues.push(`command for ${sketch.pattern}/${sketch.method} must be ${plan.plan.command} (got ${sketch.command})`)
  }
  return issues
}

function sketchIssue(sketch, options) {
  const issues = sketchIssues(sketch, options)
  return issues.length > 0 ? issues.join('; ') : null
}

function validSketch(sketch) {
  return sketchIssue(sketch, { complete: true }) === null
}

export function auditBrief(data, root, measure, topology, stage = null) {
  const errors = []
  const warnings = []
  const requirements = Array.isArray(data.requirements) ? data.requirements : []
  const mapped = []
  const unmapped = []
  for (const requirement of requirements) {
    const verify = requirement?.verify
    if (verify && typeof verify === 'object' && ['measure', 'body_topology'].includes(verify.tool) && typeof verify.predicate === 'string' && verify.predicate.trim() !== '') {
      mapped.push(requirement.id)
    } else {
      unmapped.push(requirement?.id || '(no id)')
    }
  }
  if (unmapped.length > 0) warnings.push(`requirements without executable verify: ${unmapped.join(', ')}`)

  const checkpoints = Array.isArray(data.checkpoints) ? data.checkpoints : []
  const checkpoint = stage
    ? checkpoints.find((item) => item?.after === stage && item?.expected && typeof item.expected.volume_mm3 === 'number')
    : [...checkpoints].reverse().find((item) => item?.expected && typeof item.expected.volume_mm3 === 'number')
  const measured = measureVolume(measure)
  let volume = { status: 'unverifiable', reason: 'no checkpoint with expected volume_mm3' }
  if (checkpoint && measured !== null) {
    const expected = checkpoint.expected.volume_mm3
    const tol = checkpoint.tol || {}
    const minFeature = checkpoint.minFeatureMm3
    const abs = Math.abs(measured - expected)
    const rel = expected === 0 ? null : abs / Math.abs(expected)
    const declaredAbs = typeof tol.abs === 'number' ? tol.abs : null
    let allowedAbs = null
    let allowedRel = null
    if (typeof minFeature === 'number' && Number.isFinite(minFeature) && minFeature > 0) {
      allowedAbs = Math.min(declaredAbs ?? Infinity, minFeature / 2)
      allowedRel = allowedAbs / Math.abs(expected)
      if (declaredAbs !== null && declaredAbs > allowedAbs) {
        warnings.push(`declared tol.abs ${declaredAbs} exceeds minFeature/2 ${allowedAbs}; capped`)
      }
    } else {
      warnings.push('checkpoint missing minFeatureMm3; tolerance cannot be bounded')
    }
    const pass = allowedAbs === null ? null : abs <= allowedAbs
    volume = {
      status: pass === null ? 'unverifiable' : pass ? 'pass' : 'fail',
      expected, measured, abs, rel,
      tol,
      tolResolved: allowedAbs !== null ? { abs: allowedAbs, rel: allowedRel, source: 'minFeature/2' } : null,
      checkpoint: checkpoint.after || null,
    }
    if (pass === false) errors.push(`volume outside tolerance: measured ${measured}, expected ${expected}`)
    if (pass === null) warnings.push('checkpoint has no bounded numeric tolerance')
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
    if (!check.inside || check.invalid) {
      errors.push(`${label} is outside project root or denied: ${value}`)
      paths.push({ label, value, status: check.invalid ? 'denied' : 'outside' })
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

  const designMode = ['feature-first', 'geometry-first'].includes(data.design_mode)
  const sketchRequired = data.intent?.sketch_required !== false
  const sketch = validSketch(data.sketch) || (!sketchRequired && typeof data.intent?.no_sketch_reason === 'string' && data.intent.no_sketch_reason.trim() !== '')
  if (!designMode) warnings.push('design_mode is not set (feature-first or geometry-first)')
  if (!sketch) warnings.push('sketch plan is missing or incomplete; run sketch validate and write brief.sketch')
  if (!sketchRequired && !sketch) warnings.push('sketch_required=false requires intent.no_sketch_reason')
  const gate = {
    designMode,
    sketch,
    requirements: mapped.length > 0,
    checkpoint: checkpoint != null,
    volume: volume.status === 'pass',
    artifacts: paths.length > 0 && paths.every((item) => item.status === 'exists'),
    passed: designMode && sketch && mapped.length > 0 && volume.status === 'pass' && paths.length > 0 && paths.every((item) => item.status === 'exists') && errors.length === 0,
  }

  const verdict = gate.passed ? 'verified' : (errors.length > 0 ? 'failed' : 'unverifiable')
  return {
    ok: verdict === 'verified',
    verdict,
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

// Closed patterns (circle/rectangle) have no meaningful open/closed choice, so an
// omitted `closed` is defaulted to true before validation/storage. Explicit values
// (false, 'false', 0, null, ...) are passed through untouched and rejected by
// validation instead of being silently rewritten. Other patterns still require an
// explicit boolean.
function normalizeSketchClosed(sketch) {
  if (!sketch || typeof sketch !== 'object' || Array.isArray(sketch)) return sketch
  if (!['circle', 'rectangle'].includes(sketch.pattern)) return sketch
  if (sketch.closed !== undefined) return sketch
  return { ...sketch, closed: true }
}

function normalizePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch
  if (patch.sketch === undefined) return patch
  return { ...patch, sketch: normalizeSketchClosed(patch.sketch) }
}

function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('brief update requires a patch object')
  for (const key of Object.keys(patch)) {
    if (key === 'sketches') throw new Error('brief.sketches is not supported in 0.0.1; write the single sketch object to brief.sketch')
    if (!TOP_KEYS.has(key) || key === 'schema' || key === 'updated') throw new Error(`unknown or immutable brief field: ${key}`)
    if (key === 'sketch' && Array.isArray(patch[key])) throw new Error('brief.sketch must be a single object, not an array; 0.0.1 supports one sketch per design')
    if (key === 'sketch' && patch[key] !== null) {
      const issue = sketchIssue(patch[key], { complete: true })
      if (issue) throw new Error(`brief.sketch is invalid: ${issue}; write the full single sketch object`)
    }
    if (key === 'design_mode' && patch[key] !== null && !['feature-first', 'geometry-first'].includes(patch[key])) throw new Error('design_mode must be feature-first, geometry-first, or null')
    if (key === 'design_mode_reason' && patch[key] !== null && typeof patch[key] !== 'string') throw new Error('design_mode_reason must be a string or null')
    if (key === 'design_mode_history' && !Array.isArray(patch[key])) throw new Error('design_mode_history must be an array')
    if (ARRAY_KEYS.has(key) && !Array.isArray(patch[key])) throw new Error(`${key} must be an array`)
    if (key === 'focus' && patch[key] !== null && (typeof patch[key] !== 'object' || Array.isArray(patch[key]))) throw new Error('focus must be an object or null')
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
        stage: { type: 'string', description: 'Optional checkpoint stage (checkpoint.after) to audit.' },
        revision: { type: 'integer', description: 'Optional expected brief revision; a mismatch fails the audit (CAS).' },
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
        const patch = normalizePatch(args.patch)
        validatePatch(patch)
        const data = readBrief(file)
        const nextMode = patch.design_mode === undefined ? data.design_mode : patch.design_mode
        const nextReason = patch.design_mode_reason === undefined ? data.design_mode_reason : patch.design_mode_reason
        if (nextMode !== null && (typeof nextReason !== 'string' || nextReason.trim() === '')) {
          throw new Error('design_mode requires design_mode_reason')
        }
        if (patch.sketch !== undefined) {
          if (patch.sketch === null && data.sketch !== null && data.sketch !== undefined) {
            throw new Error(
              'brief.sketch cannot be cleared with null while a sketch exists; ' +
              '0.0.1 keeps one sketch per design. Run brief {"op":"reset","confirm":true} to clear it.',
            )
          }
        }
        const next = { ...data }
        if (patch.design_mode_history !== undefined) throw new Error('design_mode_history is managed by the tool')
        if (patch.design_mode && patch.design_mode !== data.design_mode) {
          next.design_mode_history = [
            ...(Array.isArray(data.design_mode_history) ? data.design_mode_history : []),
            { mode: patch.design_mode, reason: patch.design_mode_reason ?? null, at: now() },
          ]
        }
        for (const [key, value] of Object.entries(patch)) {
          next[key] = key === 'sketch' ? value : DEEP_KEYS.has(key) ? { ...(data[key] || {}), ...value } : value
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
        const data = readBrief(file)
        const measure = args.measure || null
        const topology = args.topology || null
        if (args.revision !== undefined && args.revision !== data.revision) {
          return { ok: false, verdict: 'failed', error: `stale brief: expected revision ${args.revision}, found ${data.revision}` }
        }
        const result = auditBrief(data, root, measure, topology, args.stage || null)
        const inputHash = createHash('sha256')
          .update(JSON.stringify({ measure, topology }))
          .digest('hex')
        const reports = join(root, 'reports')
        mkdirSync(reports, { recursive: true })
        appendFileSync(
          join(reports, 'audit.jsonl'),
          `${JSON.stringify({
            time: now(),
            revision: data.revision,
            verdict: result.verdict,
            skillVersion: SKILL_VERSION,
            knowledgeHash: KNOWLEDGE_HASH,
            registryHash: REGISTRY_HASH,
            volume: result.volume,
            inputHash,
            errors: result.errors,
            warnings: result.warnings,
          })}\n`,
          'utf8',
        )
        return result
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
