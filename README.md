# OpenCode Usage Limits

OpenCode TUI plugin that shows OpenCode Go usage limits in the right sidebar.

## Displays

- **OpenCode Go**: rolling 5-hour, weekly, and monthly consumed percentage, limit state, and reset time.

The panel refreshes every 60 seconds and after a session usage event. Missing data is shown explicitly.

## Requirements

- OpenCode 2.2.5 or newer.
- An OpenCode Go API key. The plugin reads the active `opencode-go` credential; a Console workspace sign-in is not required.

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

- The OpenCode Go API key stays in the server part behind the local `usage-limits` RPC.
- The key is sent only to the fixed `https://opencode.ai/zen/go/v1/usage` endpoint.
- The key and response bodies are never persisted or logged.

## Notes

OpenCode Go limits come from `GET https://opencode.ai/zen/go/v1/usage` with the active Go API key. It is the endpoint the console uses, but it is not part of a documented public API. The native `GET /api/experimental/usage/limits` returns data only for OpenCode Console workspaces, so the plugin does not rely on it.

## Development

Tests use the Node.js built-in test runner and require no installed runtime dependencies:

```sh
npm test
```

The plugin behavior is split into deterministic modules:

- `src/normalize.ts`: response validation and view models.
- `src/go.ts`: fixed Go endpoint request and safe failure handling.
- `src/service.ts`: active OpenCode Go connection resolution.
- `src/rpc.ts`: typed server/TUI contract.
- `src/tui.tsx`: sidebar slot, refresh lifecycle, and rendering.
