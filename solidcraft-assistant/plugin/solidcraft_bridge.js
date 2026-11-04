// Session-aware SolidCraft MCP bridge.
// Each DSH session's working directory becomes the SolidCraft --allow-path root.
import { spawn } from 'node:child_process'
import { realpathSync, statSync } from 'node:fs'

export const inject = ['tools', 'workingDirectory']

const SERVER = 'solidcraft'
const TIMEOUT_MS = 330000

class McpSession {
  constructor(root) {
    this.root = root
    this.proc = null
    this.seq = 0
    this.pending = new Map()
    this.buffer = ''
    this.ready = null
  }

  start() {
    if (this.ready) return this.ready
    this.proc = spawn('solidcraft-cli', ['mcp', '--param-check', 'warn', '--allow-path', this.root], {
      cwd: this.root,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.proc.stdout.setEncoding('utf8')
    this.proc.stdout.on('data', (chunk) => this.onData(chunk))
    this.proc.stderr.on('data', () => {})
    this.proc.on('error', (error) => this.failAll(error))
    this.proc.on('exit', (code) => this.failAll(new Error(`solidcraft mcp exited (${code})`)))
    this.ready = this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'dsh-solidcraft-assistant', version: '0.0.1' },
    }, 30000).then((init) => {
      this.send({ jsonrpc: '2.0', method: 'notifications/initialized' })
      return init
    })
    return this.ready
  }

  onData(chunk) {
    this.buffer += chunk
    for (;;) {
      const index = this.buffer.indexOf('\n')
      if (index < 0) return
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      if (!line) continue
      let message
      try { message = JSON.parse(line) } catch { continue }
      if (message.id !== undefined && this.pending.has(message.id)) {
        const entry = this.pending.get(message.id)
        this.pending.delete(message.id)
        clearTimeout(entry.timer)
        if (message.error) entry.reject(new Error(message.error.message || 'MCP error'))
        else entry.resolve(message.result)
      }
    }
  }

  send(message) {
    if (!this.proc || !this.proc.stdin.writable) throw new Error('solidcraft mcp is not running')
    this.proc.stdin.write(`${JSON.stringify(message)}\n`)
  }

  request(method, params, timeoutMs = TIMEOUT_MS) {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`solidcraft mcp timeout: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try { this.send({ jsonrpc: '2.0', id, method, params }) } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  async listTools() {
    await this.start()
    return (await this.request('tools/list', {})).tools || []
  }

  async callTool(name, args) {
    await this.start()
    return await this.request('tools/call', { name, arguments: args || {} })
  }

  failAll(error) {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    this.pending.clear()
  }

  close() {
    this.failAll(new Error('solidcraft mcp closed'))
    if (this.proc && !this.proc.killed) this.proc.kill()
  }
}

function resolveRoot(value) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('solidcraft: select a project workspace first')
  const root = realpathSync(value)
  if (!statSync(root).isDirectory()) throw new Error('solidcraft: workspace must be a directory')
  return root
}

function textResult(result) {
  const parts = (result?.content || []).filter((item) => item.type === 'text').map((item) => item.text)
  if (result?.isError) throw new Error(parts.join('\n') || 'SolidCraft tool failed')
  return result
}

export async function apply(ctx) {
  // Bootstrap only obtains the schema; tool calls use the session root.
  const bootstrap = new McpSession(process.cwd())
  const tools = await bootstrap.listTools()
  bootstrap.close()
  const clients = new Map()

  ctx.effect(() => () => {
    for (const client of clients.values()) client.close()
    clients.clear()
  })

  for (const tool of tools) {
    const publicName = `mcp__${SERVER}__${tool.name}`
    ctx.tools.register({
      name: publicName,
      description: tool.description || `SolidCraft ${tool.name}`,
      parameters: tool.inputSchema || { type: 'object', additionalProperties: true },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => (value?.content || [])
          .filter((item) => item.type === 'text')
          .map((item) => ({ type: 'text', text: item.text })),
      },
      async execute(args, exec) {
        const root = resolveRoot(ctx.workingDirectory.get(exec.agent?.session))
        let client = clients.get(root)
        if (!client) {
          client = new McpSession(root)
          clients.set(root, client)
        }
        return textResult(await client.callTool(tool.name, args))
      },
    })
  }
}
