// P1 report checker: structure, banned phrasing, units, standard citations.
// Heuristic lint; errors block, warnings advise.

export const inject = ['tools']

const SECTIONS = [
  { key: '结论', aliases: ['结论', 'conclusion', 'summary'] },
  { key: '假设', aliases: ['假设', 'assumption', 'assumptions'] },
  { key: '计算', aliases: ['计算', 'calculation', 'calculations', 'formula'] },
  { key: '校核', aliases: ['校核', '验证', 'verification', 'check'] },
  { key: '未决', aliases: ['未决', 'open question', 'open questions', 'risk'] },
]

const BANNED = [
  { phrase: '大概', level: 'error' },
  { phrase: '差不多', level: 'error' },
  { phrase: '应该没问题', level: 'error' },
  { phrase: '弄一下', level: 'error' },
  { phrase: '搞一个', level: 'error' },
  { phrase: '专业级', level: 'error' },
  { phrase: '高精度', level: 'warning' },
  { phrase: '优化设计', level: 'warning' },
  { phrase: '保证', level: 'warning' },
  { phrase: '绝对', level: 'warning' },
]

const UNIT_RE = /(mm|cm|m|in|ft|deg|rad|g|kg|s|%|°|MPa|Pa|N|rpm|min|h)(?![A-Za-z])/i
const NUMBER_RE = /(?:^|[\s(（,，;；=])[-+]?\d+(?:\.\d+)?(?![\d.eE])/g
const STANDARD_RE = /(GB\/T|GB|ISO|DIN|JIS|ASME)\s?[0-9]+(?:[.-][0-9]+)*/gi

function hasSection(text, aliases) {
  return aliases.some((alias) => new RegExp(`(^|\\n)\\s*#{0,3}\\s*${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text))
}

export function checkReport(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('report text is required')
  const errors = []
  const warnings = []
  const present = []
  for (const section of SECTIONS) {
    if (hasSection(text, section.aliases)) present.push(section.key)
    else warnings.push(`missing section: ${section.key}`)
  }
  for (const item of BANNED) {
    if (text.includes(item.phrase)) {
      const message = `banned phrasing: ${item.phrase}`
      if (item.level === 'error') errors.push(message)
      else warnings.push(message)
    }
  }
  // A number followed by a unit on the same line is fine; flag bare numbers only
  // when they are not identifiers/section numbers/standard numbers.
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^\s*#{1,6}\s/.test(line)) continue
    if (/^\s*\|/.test(line)) continue
    if (/\b(?:GB\/T|ISO|DIN|JIS|ASME)\b/i.test(line)) continue
    if (/材料|material|grade|alloy|密度|density/i.test(line)) continue
    let match
    NUMBER_RE.lastIndex = 0
    while ((match = NUMBER_RE.exec(line)) !== null) {
      const tail = line.slice(match.index + match[0].length, match.index + match[0].length + 12)
      if (!UNIT_RE.test(tail) && !/^[.):]/.test(tail)) {
        warnings.push(`bare number without a unit: ${match[0].trim()} (line ${i + 1})`)
        break
      }
    }
  }
  const standards = [...new Set((text.match(STANDARD_RE) || []).map((s) => s.replace(/\s+/g, ' ').trim()))]
  for (const standard of standards) {
    if (!/(?:-|:)\s?\d{4}\b/.test(text.slice(text.indexOf(standard), text.indexOf(standard) + 40))) {
      warnings.push(`standard citation without an edition year: ${standard}`)
    }
  }
  if (/符合[^\n]{0,12}标准/.test(text) && standards.length === 0) {
    errors.push('compliance claim without a standard citation')
  }
  if (/⟨calc:[^⟩]+⟩/.test(text) && !/=/.test(text)) {
    warnings.push('calc marker present but no formula/substitution found')
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: { chars: text.length, sections: present, standards },
  }
}

export function apply(ctx) {
  ctx.tools.register({
    name: 'report_check',
    description:
      'Lint an engineering report: required sections (结论/假设/计算/校核/未决), banned colloquial/pseudo-professional phrasing, ' +
      'bare numbers without units, standard citations without an edition year, and compliance claims without citations. ' +
      'Returns errors (blocking) and warnings.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Report text (Markdown or plain).' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      return checkReport(args.text)
    },
  })
}
