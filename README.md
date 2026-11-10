# OpenCode Usage Limits

OpenCode TUI plugin that shows OpenCode Go and OpenAI/ChatGPT usage limits in the right sidebar.

## Displays

- **OpenCode Go**: rolling 5-hour, weekly, and monthly consumed percentage, limit state, and reset time.
- **OpenAI**: the primary and secondary ChatGPT/Codex usage windows returned by OpenAI, with consumed percentage and reset time.

The panel refreshes every 60 seconds and after a session usage event. Missing data is shown explicitly; the plugin never fabricates a monthly OpenAI window when OpenAI does not return one.

## Requirements

- OpenCode 2.2.5 or newer.
- OpenCode Console sign-in for OpenCode Go limits. Without it, the Go section explains that the workspace is unavailable.
- OpenAI sign-in with ChatGPT for ChatGPT/Codex subscription limits. An OpenAI API key does not expose ChatGPT subscription limits.

## Install

Add the repository path to the global `~/.config/opencode/opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/Opencode-Usage-Limits"]
}
```

The package exports all three plugin parts:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./tui": "./src/tui.tsx",
    "./rpc": "./src/rpc.ts"
  }
}
```

OpenCode loads the server and TUI parts from the single entry. No separate `cli.json` entry is needed.

## Security

- The OpenAI OAuth access token stays in the server part behind the local `usage-limits` RPC.
- The token is sent only to the fixed `https://chatgpt.com/backend-api/wham/usage` endpoint.
- Tokens and response bodies are never persisted or logged.
- API-key credentials are rejected for subscription usage instead of being sent to the ChatGPT endpoint.

## Notes

OpenAI's ChatGPT/Codex usage endpoint is used by the official Codex client but is not a documented public OpenAI API. Its response contract may change. The parser accepts the known snake-case and camel-case snapshot forms and reports unsupported responses safely.

OpenCode Go limits come from OpenCode's `GET /api/experimental/usage/limits` endpoint.

## Development

Tests use the Node.js built-in test runner and require no installed runtime dependencies:

```sh
npm test
```

The plugin behavior is split into deterministic modules:

- `src/normalize.ts`: response validation and view models.
- `src/chatgpt.ts`: fixed endpoint request and safe failure handling.
- `src/service.ts`: active OpenAI connection resolution.
- `src/rpc.ts`: typed server/TUI contract.
- `src/tui.tsx`: sidebar slot, refresh lifecycle, and rendering.
