// Standard sketch-input protocol. This tool validates/normalizes input; it never executes CAD.
export const inject = ['tools']

const PLANES = ['XY', 'XZ', 'YZ', 'construction', 'face']
const PATTERNS = {
  line: {
    open: true,
    methods: {
      two_point: { command: 'sketch.line', requires: ['end'] },
      point_angle_length: { command: 'sketch.line', requires: ['length', 'angle'] },
    },
  },
  circle: {
    open: false,
    methods: {
      center_radius: { command: 'sketch.circle.center', requires: ['radius'] },
      two_point: { command: 'sketch.circle.two_point', requires: ['end'] },
      three_point: { command: 'sketch.circle.three_point', requires: ['end', 'through'] },
    },
  },
  arc: {
    open: true,
    methods: {
      three_point: { command: 'sketch.arc.three_point', requires: ['through', 'end'] },
      center_start_end: { command: 'sketch.arc.center_point', requires: ['end'] },
    },
  },
  rectangle: {
    open: false,
    methods: {
      two_point: { command: 'sketch.rectangle.two_point', requires: ['end'] },
      three_point: { command: 'sketch.rectangle.three_point', requires: ['end', 'through'] },
      rounded: { command: 'sketch.rectangle.rounded', requires: ['end', 'radius'] },
    },
  },
}

function finiteTriple(value) {
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number' && Number.isFinite(item))
}

function finitePair(value) {
  return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === 'number' && Number.isFinite(item))
}

function validatePlan(input = {}) {
  const errors = []
  const missing = []
  const plane = input.plane || { type: 'XY', offset: 0 }
  if (!PLANES.includes(plane.type)) errors.push(`plane.type must be one of ${PLANES.join(', ')}`)
  if (plane.type === 'construction' && !plane.name) errors.push('construction plane requires name')
  if (plane.type === 'face' && !finiteTriple(plane.point) && !(Array.isArray(plane.face) && plane.face.length > 0)) errors.push('face plane requires a face point [x,y,z] or face reference')
  if (plane.offset !== undefined && (typeof plane.offset !== 'number' || !Number.isFinite(plane.offset))) errors.push('plane.offset must be a finite number')
  const start = input.start === undefined ? [0, 0] : input.start
  if (!finitePair(start)) errors.push('start must be [u, v] with finite numbers')
  if (!PATTERNS[input.pattern]) errors.push(`pattern must be one of ${Object.keys(PATTERNS).join(', ')}`)
  const pattern = PATTERNS[input.pattern]
  if (!pattern) return { ok: false, errors, missing }
  const method = pattern.methods[input.method]
  if (!method) errors.push(`method for ${input.pattern} must be one of ${Object.keys(pattern.methods).join(', ')}`)
  if (pattern.open) {
    if (typeof input.closed !== 'boolean') missing.push('closed')
  } else if (input.closed !== undefined && input.closed !== true) {
    errors.push(`${input.pattern} is a closed profile; closed must be true or omitted`)
  }
  if (method) {
    for (const key of method.requires) {
      if (input.args?.[key] === undefined) missing.push(`args.${key}`)
    }
  }
  const ok = errors.length === 0 && missing.length === 0
  return {
    ok,
    errors,
    missing,
    next: missing[0] || null,
    plan: ok ? {
      plane: { type: plane.type, offset: plane.offset ?? 0, ...(plane.name ? { name: plane.name } : {}), ...(plane.point ? { point: plane.point } : {}), ...(plane.face ? { face: plane.face } : {}) },
      start,
      pattern: input.pattern,
      method: input.method,
      closed: pattern.open ? input.closed : true,
      args: input.args || {},
      command: method?.command,
    } : null,
  }
}

function guide() {
  return {
    steps: [
      { id: 'plane', question: '选择草图参考面', options: [
        { value: 'XY', label: 'XY 面，Z=0' },
        { value: 'XZ', label: 'XZ 面，Y=0' },
        { value: 'YZ', label: 'YZ 面，X=0' },
        { value: 'construction', label: '已有构造面' },
        { value: 'face', label: '已有实体的平面' },
      ], note: '偏移量用 plane.offset 表达，例如 XZ 面 Y=15 → {type:"XZ", offset:15}' },
      { id: 'start', question: '选择起点（草图平面坐标）', default: [0, 0] },
      { id: 'pattern', question: '选择草图图样', options: Object.keys(PATTERNS) },
      { id: 'method', question: '选择绘制方法', byPattern: Object.fromEntries(Object.entries(PATTERNS).map(([key, value]) => [key, Object.keys(value.methods)])) },
      { id: 'closed', question: '开口图样是否闭合？', appliesTo: ['line', 'arc'], options: [true, false] },
    ],
  }
}

export function apply(ctx) {
  ctx.tools.register({
    name: 'sketch',
    description:
      'Normalize and validate the sketch-input protocol before the first CAD batch: reference plane, start point (default [0,0]), pattern (line/circle/arc/rectangle), drawing method, and closure for open patterns. ' +
      'Ops: guide (questions/options) and validate (returns normalized plan, missing fields, next question and SolidCraft command suggestion). This tool never executes CAD.',
    parameters: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['guide', 'validate'] },
        plane: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: PLANES },
            offset: { type: 'number' },
            name: { type: 'string' },
            point: { type: 'array', items: { type: 'number' } },
          },
          required: ['type'],
          additionalProperties: true,
        },
        start: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
        pattern: { type: 'string', enum: Object.keys(PATTERNS) },
        method: { type: 'string' },
        closed: { type: 'boolean' },
        args: { type: 'object', additionalProperties: true },
      },
      required: ['op'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    async execute(args) {
      if (args.op === 'guide') return guide()
      return validatePlan(args)
    },
  })
}
