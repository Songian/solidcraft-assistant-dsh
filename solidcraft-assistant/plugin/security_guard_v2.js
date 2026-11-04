// Host guard: deny sensitive files before any fs tool executes.
export const inject = ['tools']

const DENY_PARTS = ['.scdata', '.git', 'node_modules']
const DENY_SUFFIXES = ['.token', '.pem', '.key']
const DENY_NAMES = ['.env', 'id_rsa', 'id_ed25519', 'credentials.json']

export function apply(ctx) {
  ctx.tools.guard((exec) => {
    if (!['read', 'read_image', 'write', 'edit', 'glob', 'grep'].includes(exec.name)) return undefined
    const value = exec.args?.file_path ?? exec.args?.path
    if (typeof value !== 'string' || value === '') return undefined
    const parts = value.split(/[\\/]+/).map((part) => part.toLowerCase())
    if (parts.some((part) => DENY_PARTS.includes(part))) return `security guard: denied path component in ${value}`
    const name = parts.at(-1) || ''
    if (DENY_NAMES.includes(name) || DENY_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
      return `security guard: denied sensitive file ${value}`
    }
    if (name.startsWith('.env')) return `security guard: denied environment file ${value}`
    return undefined
  })
}
