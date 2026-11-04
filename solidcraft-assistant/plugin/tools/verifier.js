// P1 report checker: structure, banned phrasing, units, standard citations.
// Heuristic lint; errors block, warnings advise.
import { readFileSync } from 'node:fs'

export const inject = ['tools']

const SECTIONS = [
  { key: '结论', aliases: ['结论', 'conclusion', 'summary'], required: true },
  { key: '假设', aliases: ['假设', 'assumption', 'assumptions'], required: false },
  { key: '计算', aliases: ['计算', 'calculation', 'calculations', 'formula'], required: true },
  { key: '校核', aliases: ['校核', '验证', 'verification', 'check'], required: true },
  { key: '未决', aliases: ['未决', 'open question', 'open questions', 'risk'], required: false },
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
]

const UNIT_RE = /(kN·m|N·m|GPa|MPa|kPa|kW|mL|µm|um|mm|cm|kg|Hz|rpm|min|mm|in|ft|deg|rad|Pa|N|V|A|W|K|L|g|s|h|%|°)(?![A-Za-z])/i
const NUMBER_RE = /(?:^|[\s(（,，;；=])[-+]?\d+(?:\.\d+)?(?![\d.eE])/g
const STANDARD_RE = /\b([A-Z]{2,}(?:\/[A-Z])?)(?:\s[A-Z])?\s?[0-9]+(?:[.-][0-9]+)*/g

function loadStandards() {
  const rules = []
  for (const name of ['GB', 'ISO']) {
    for (const relative of [`../knowledge/standards/${name}.json`, `../../knowledge/standards/${name}.json`]) {
      try {
        const doc = JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))
        for (const rule of doc.rules || []) rules.push({ ...rule, profile: doc.id })
        break
      } catch {
        // try the other package layout
      }
    }
  }
  return rules
}

const STANDARDS = loadStandards()

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
    else if (section.required) errors.push(`missing required section: ${section.key}`)
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
  let standardsWithEdition = 0
  const citations = []
  for (const standard of standards) {
    const index = text.indexOf(standard)
    const withEdition = /(?:-|:)\s?\d{4}\b/.test(text.slice(index, index + 48))
    if (withEdition) standardsWithEdition += 1
    else warnings.push(`standard citation without an edition year: ${standard}`)
    const rule = STANDARDS.find((item) => standard.startsWith(item.standard) && item.edition && standard.includes(item.edition))
    if (rule) {
      citations.push({ standard, profile: rule.profile, status: rule.verification?.status || 'unknown' })
      if (rule.verification?.status !== 'verified') {
        errors.push(`standard citation is not verified: ${standard}`)
      }
    } else if (/^(GB|ISO)/i.test(standard)) {
      errors.push(`standard citation not found in the knowledge subset: ${standard}`)
    } else {
      citations.push({ standard, profile: 'external', status: 'unknown' })
    }
  }
  if (/符合[^\n]{0,12}标准/.test(text) && standardsWithEdition === 0) {
    errors.push('compliance claim without a standard citation with an edition year')
  }
  if (/⟨calc:[^⟩]+⟩/.test(text) && !/=/.test(text)) {
    warnings.push('calc marker present but no formula/substitution found')
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: { chars: text.length, sections: present, standards, citations },
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
