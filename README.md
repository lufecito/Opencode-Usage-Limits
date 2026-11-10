# OpenCode Usage Limits

OpenCode TUI plugin that shows OpenCode Go and OpenAI ChatGPT usage limits in the right sidebar.

## Displays

- **OpenCode Go**: rolling 5-hour, weekly, and monthly consumed percentage, limit state, and reset time.
- **OpenAI**: the primary and secondary ChatGPT usage windows with consumed percentage and reset time.

The panel refreshes every 60 seconds and after a session usage event. Missing data is shown explicitly; the plugin never fabricates a monthly OpenAI window when OpenAI does not return one.

## Requirements

- OpenCode 2.2.5 or newer.
- An OpenCode Go API key. The plugin reads the active `opencode-go` credential; a Console workspace sign-in is not required.
- OpenAI ChatGPT sign-in through the **legacy Codex login** (`Codex browser` or `Codex device code`). The newer `Sign in with ChatGPT` token-sharing login is not accepted by OpenAI's usage endpoint.

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

- The OpenAI OAuth access token and the OpenCode Go API key stay in the server part behind the local `usage-limits` RPC.
- The OpenAI token is sent only to the fixed `https://chatgpt.com/backend-api/wham/usage` endpoint.
- The Go key is sent only to the fixed `https://opencode.ai/zen/go/v1/usage` endpoint.
- Tokens and response bodies are never persisted or logged.
- API-key credentials are rejected for OpenAI subscription usage instead of being sent to the ChatGPT endpoint.

## Notes

OpenAI's ChatGPT usage endpoint is used by the Codex client but is not a documented public API. Its response contract may change. The parser accepts the current `rate_limit.primary_window`/`secondary_window` shape as well as the legacy `rate_limits` and `rate_limits_by_limit_id` shapes, and reports unsupported responses safely.

Token-sharing OAuth tokens (`chatgpt.tokens.use.direct`) are rejected by that endpoint with HTTP 401 `rejected_by_access_enforcement`. Only legacy Codex login tokens report ChatGPT plan usage; OpenAI tracks this gap in `openai/codex#54219`.

OpenCode Go limits come from `GET https://opencode.ai/zen/go/v1/usage` with the active Go API key. It is the endpoint the console uses, but it is not part of a documented public API. The native `GET /api/experimental/usage/limits` returns data only for OpenCode Console workspaces, so the plugin does not rely on it.

## Development

Tests use the Node.js built-in test runner and require no installed runtime dependencies:

```sh
npm test
```

The plugin behavior is split into deterministic modules:

- `src/normalize.ts`: response validation and view models.
- `src/go.ts`: fixed Go endpoint request and safe failure handling.
- `src/chatgpt.ts`: fixed OpenAI endpoint request and safe failure handling.
- `src/service.ts`: active OpenAI and OpenCode Go connection resolution.
- `src/rpc.ts`: typed server/TUI contract.
- `src/tui.tsx`: sidebar slot, refresh lifecycle, and rendering.
