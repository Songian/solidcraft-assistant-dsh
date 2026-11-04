export const inject = ['tools', 'agentPresets']
export function apply(ctx) {
  ctx.tools.register({
    name: 'preset_debug',
    description: 'List agent presets with broken diagnostics.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute() { return { presets: await ctx.agentPresets.list() } },
  })
}
