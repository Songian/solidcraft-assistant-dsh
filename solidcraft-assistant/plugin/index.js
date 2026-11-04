import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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

function result(value) {
  return value
}

export function apply(ctx) {
  ctx.tools.register({
    name: 'brief',
    description:
      'Read, create, or update the SolidCraft design brief (brief.json) for the current project. ' +
      'Use before modeling; ops: init, read, update. Update merges top-level fields and increments revision.',
    parameters: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['init', 'read', 'update'] },
        project: { type: 'string', description: 'Project name for init; defaults to the working directory name.' },
        patch: {
          type: 'object',
          additionalProperties: true,
          description: 'Top-level fields to merge for update.',
        },
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
          return result({ ok: true, created: false, path: file, brief: readBrief(file) })
        }
        const project = args.project || root.split(/[\\/]/).filter(Boolean).at(-1) || 'project'
        const data = defaultBrief(project)
        writeBrief(file, data)
        return result({ ok: true, created: true, path: file, brief: data })
      }

      if (args.op === 'read') {
        return result({ ok: true, path: file, brief: readBrief(file) })
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
        return result({ ok: true, path: file, brief: next })
      }

      throw new Error(`unknown brief op: ${String(args.op)}`)
    },
  })
}
