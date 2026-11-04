// Controlled SolidCraft GUI preview. Fixed executable, no shell, paths inside project root.
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { connect } from 'node:net'
import { spawn, execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

export const inject = ['tools', 'workingDirectory']

const UNIT = 'solidcraft-preview'
const DATA = join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'solidcraft', 'control')

function port() {
  try { return Number(readFileSync(join(DATA, 'current.port'), 'utf8').trim()) } catch { return null }
}

function token(p) {
  return readFileSync(join(DATA, `${p}.token`), 'utf8').trim()
}

function request(p, method, params = {}, timeoutMs = 30000) {
  return new Promise((resolvePromise, reject) => {
    const body = JSON.stringify({ id: 1, method, params, token: token(p) })
    const socket = connect({ host: '127.0.0.1', port: p })
    let data = ''
    const timer = setTimeout(() => { socket.destroy(); reject(new Error(`control request timed out: ${method}`)) }, timeoutMs)
    socket.setEncoding('utf8')
    socket.on('connect', () => socket.write(`${body}\n`))
    socket.on('data', (chunk) => {
      data += chunk
      if (!data.includes('\n')) return
      clearTimeout(timer)
      socket.destroy()
      try {
        const reply = JSON.parse(data.split('\n')[0])
        if (!reply.ok) reject(new Error(reply.error || 'control request failed'))
        else resolvePromise(reply.result)
      } catch (error) { reject(error) }
    })
    socket.on('error', (error) => { clearTimeout(timer); reject(error) })
  })
}

function processRunning() {
  try { execFileSync('pgrep', ['-x', 'solidcraft'], { stdio: 'ignore' }); return true } catch { return false }
}

function unitActive() {
  try { return execFileSync('systemctl', ['--user', 'is-active', UNIT], { encoding: 'utf8' }).trim() === 'active' } catch { return false }
}

async function listening(p) {
  if (!p) return false
  try { await request(p, 'control.capabilities', {}, 2000); return true } catch { return false }
}

async function status() {
  const p = port()
  const result = { running: false, process: processRunning(), unit: unitActive(), portFile: join(DATA, 'current.port') }
  if (!(await listening(p))) return result
  result.running = true
  result.port = p
  try { result.design = await request(p, 'document.revision', {}, 3000) } catch (error) { result.designError = String(error) }
  try { result.documents = (await request(p, 'ui.documents', {}, 10000)).documents } catch { /* busy */ }
  return result
}

function waitForPort(seconds = 30) {
  return new Promise((resolvePromise) => {
    const deadline = Date.now() + seconds * 1000
    const tick = async () => {
      const p = port()
      if (await listening(p)) return resolvePromise(p)
      if (Date.now() >= deadline) return resolvePromise(null)
      setTimeout(tick, 250)
    }
    tick()
  })
}

function launch(design) {
  const args = ['--user', '--collect', `--unit=${UNIT}`, '--description=SolidCraft preview']
  for (const name of ['DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS']) {
    if (process.env[name]) args.push(`--setenv=${name}=${process.env[name]}`)
  }
  args.push('solidcraft')
  if (design) args.push(design)
  const child = spawn('systemd-run', args, { detached: true, stdio: 'ignore' })
  child.unref()
  return waitForPort(30).then((p) => ({ port: p, mode: 'systemd' }))
}

function rootFor(ctx, exec) {
  const root = ctx.workingDirectory.get(exec.agent?.session)
  if (typeof root !== 'string' || root.length === 0) throw new Error('preview: cannot resolve working directory')
  return root
}

function realOrResolved(value) {
  try { return realpathSync(value) } catch {
    try { return join(realpathSync(dirname(value)), basename(value)) } catch { return resolve(value) }
  }
}

function inside(root, value) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('preview: design path is required')
  const absolute = isAbsolute(value) ? value : resolve(root, value)
  const rel = relative(realOrResolved(root), realOrResolved(absolute))
  if (rel === '' || rel === '..' || rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(rel)) {
    throw new Error(`preview: path is outside project root: ${value}`)
  }
  return absolute
}

async function push(p, design, view = 'iso', reframe = false) {
  if (!existsSync(design)) throw new Error(`preview: design not found: ${design}`)
  const info = await request(p, 'ui.documents', {}, 10000)
  const target = basename(design).replace(/\.[^.]+$/, '').toLowerCase()
  const matches = []
  ;(info.documents || []).forEach((item, index) => { if (String(item.name || '').toLowerCase() === target) matches.push(index) })
  for (const index of matches) {
    if (info.documents[index].dirty) throw new Error(`the open '${target}' tab has unsaved changes; save it in SolidCraft first`)
  }
  let closed = []
  if (!reframe) {
    for (const index of [...matches].reverse()) {
      await request(p, 'ui.documents', { action: 'close', index, force: true }, 30000)
      closed.push(index)
    }
    await request(p, 'engine.execute', { command: 'doc.open', params: { path: design } }, 120000)
  }
  const viewResult = await request(p, 'engine.execute', { command: 'view.apply', params: { view } }, 30000)
  return { design, closedTabs: closed.sort(), updated: closed.length > 0, newTab: !reframe && closed.length === 0, view: viewResult }
}

export function apply(ctx) {
  ctx.tools.register({
    name: 'preview',
    description:
      'Open or refresh the SolidCraft desktop preview. Ops: status, open, push, screenshot. ' +
      'Never restarts an existing instance; a model already open is updated in its tab. Paths must stay inside the project root.',
    parameters: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['status', 'open', 'push', 'screenshot'] },
        design: { type: 'string', description: 'Design path relative to the project root (open/push/screenshot target).' },
        view: { type: 'string', enum: ['iso', 'top', 'front', 'right'], description: 'View for open/push; default iso.' },
        reframe: { type: 'boolean', description: 'Only apply the view; do not close/reopen the tab.' },
      },
      required: ['op'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    async execute(args, exec) {
      const root = rootFor(ctx, exec)
      if (args.op === 'status') return status()
      if (args.op === 'open') {
        const current = await status()
        const design = args.design ? inside(root, args.design) : null
        if (current.running) {
          const result = { launched: false, ...current }
          if (design) result.push = await push(current.port, design, args.view || 'iso', Boolean(args.reframe))
          return result
        }
        if (current.process) {
          return { launched: false, running: false, process: true, error: 'SolidCraft is running but its control channel is unreachable; do not start a second instance' }
        }
        const launched = await launch(design)
        if (!launched.port) return { launched: true, running: false, mode: launched.mode, error: 'SolidCraft did not open its control channel' }
        return { launched: true, running: true, mode: launched.mode, port: launched.port, design }
      }
      if (args.op === 'push') {
        if (!args.design) throw new Error('preview push requires design')
        const current = await status()
        if (!current.running) return { running: false, hint: 'run preview open first' }
        return push(current.port, inside(root, args.design), args.view || 'iso', Boolean(args.reframe))
      }
      if (args.op === 'screenshot') {
        const current = await status()
        if (!current.running) return { running: false, hint: 'run preview open first' }
        const target = args.design ? inside(root, args.design) : join(root, 'renders', 'gui_window.png')
        mkdirSync(dirname(target), { recursive: true })
        const shot = await request(current.port, 'ui.screenshot', { path: target }, 60000)
        return { path: target, ...shot }
      }
      throw new Error(`unknown preview op: ${String(args.op)}`)
    },
  })
}
