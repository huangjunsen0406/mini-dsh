/**
 * External Cordis / DSH plugin entries.
 *
 * The learning host does not ship a plugin marketplace. It only
 * hands npm Cordis/DSH packages to ctx.plugin(). Context7 comes in
 * through the official dsh-mcp-client.
 */
const headers = {}
if (process.env.CONTEXT7_API_KEY) {
    headers.Authorization = `Bearer ${process.env.CONTEXT7_API_KEY}`
}

export default [
    {
        package: '@deepseek-ai/dsh-mcp-client',
        required: false,
        config: {
            serverName: 'context7',
            transport: 'streamable-http',
            url: 'https://mcp.context7.com/mcp',
            headers,
            failOnStartupError: false,
            toolCallTimeoutMs: 60_000,
        },
    },
]
