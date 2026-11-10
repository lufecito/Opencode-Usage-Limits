# OpenCode usage limits sidebar

Objective: add a global OpenCode TUI plugin for OpenCode Go and OpenAI/ChatGPT usage limits.
Branch/delivery: `feat/usage-limits-sidebar` in `lufecito/Opencode-Usage-Limits`; local work-unit commits only, no push. Test runner: Node.js built-in test runner with TypeScript type stripping.

## Specs

- S1: "que me muestre los consumos cada 5hrs, semanal y mensual." Display OpenCode Go rolling, weekly, and monthly meters with used percentage, limited state, and reset time. Display the primary and secondary OpenAI windows supplied by the backend; do not invent a monthly OpenAI meter when none is supplied. Verify deterministic view models.
- S2: "Idealmente y si el proyecto lo permite, que se posicione en la barra lateral derecha." Append the plugin UI to OpenCode TUI's `sidebar.content` slot and verify that OpenCode loads the plugin.
- S3: "Los límites de Opencode Go y los límites de OpenAI" Read OpenCode Go through `GET https://opencode.ai/zen/go/v1/usage` with the active `opencode-go` API key behind the server RPC. Read OpenAI/ChatGPT plan limits through the active OpenAI OAuth credential and a fixed Codex usage endpoint behind the same RPC. Assumption: OpenAI means ChatGPT/Codex subscription limits, not API-key per-minute rate limits. Never persist or log credentials. Verify parsing, authentication failures, malformed responses, cancellation, and plugin cleanup.

## Tasks

- [x] T1 (S1, S3) inline — shared normalization and view models with RED/GREEN tests; `normalize.ts` + `test/normalize.test.ts`, commit `93e7ce5`.
- [x] T2 (S3) inline — OpenAI credential adapter and server RPC with RED/GREEN tests; `chatgpt.ts`, `service.ts`, `rpc.ts`, `index.ts` and their tests, commits `26be314` and `bdde44c`.
- [x] T3 (S1-S3) inline — TUI sidebar, OpenCode Go client integration, lifecycle cleanup, documentation, and runtime load check; `tui.tsx`, `README.md`, commit `e11ce44` and this docs commit.
- [x] T4 (S3) inline — replace the Console-only native Go endpoint with the Go API-key usage endpoint; `go.ts`, `normalize.ts`, `service.ts`, `rpc.ts`, `index.ts`, `tui.tsx`, `test/go.test.ts`, commit `e6f15d7`.

## Log

- L1 (2026-11-10): "Planifiquemos una integración para Opencode que me muestre los consumos cada 5hrs, semanal y mensual. Idealmente y si el proyecto lo permite, que se posicione en la barra lateral derecha."
- L2 (2026-11-10): "Implementemos entonces en base a la planificación hecho por el agente Plan"
- L3 (2026-11-10): "Los límites de Opencode Go y los límites de OpenAI"
- L4 (2026-11-10): "https://github.com/lufecito/Opencode-Usage-Limits este es el repositorio Git" / "Prosigue". The implementation moved from global config scratch files into the authorized public repository. Remote push remains undecided.
- L5 (2026-11-10): "pero, me da este aviso Usage limits / OpenCode Go / Sign in to an OpenCode Console workspace to view Go limits." The native endpoint only serves Console workspaces, so T4 switches Go to the API-key usage endpoint.
- Route: all tasks are dependent slices of one behavior and remain inline; no Writer trigger applies.
- Verified environment: repository cloned with an unborn `main`; working branch `feat/usage-limits-sidebar`. OpenCode v2.2.5; Node.js v24.22.1; RDD is globally off. OpenCode Go limits currently return `data: null` at `/home/lufecito`.
- Risk: item 2 (the server adapter resolves the active OpenAI OAuth credential). Independent verification is required after implementation checks.
- Verified T1/T2 (RED then GREEN): missing modules failed with `ERR_MODULE_NOT_FOUND`; `chatgpt.ts:122-126` abort-during-body fix had a dedicated failing test before the change.
- Verified T3 runtime: `GET /api/plugin` reports `usage-limits` active with `server`, `tui`, and `rpc`; `POST /api/rpc/usage-limits/chatgpt` returned the safe expired-credential result, proving the fixed-URL path and active-connection resolution end to end.
- Verified T3 UI contract against `@opencode/plugin` TUI types: `append: "sidebar.content"` is a valid `SlotClaim`, `data.on("session.usage.updated")`, `data.location.default()`, and `client.rpc(def).method(input, options)` all match the published signatures.
- Independent verification (read-only, fresh scratch copy): 10 of 11 probes passed; blocker B1 (abort during `response.json()`) was fixed with a regression test; advisory A1 (a malformed primary window discards a valid secondary) was left unchanged as an out-of-scope malformed-backend edge case.
- Test evidence (T1-T3): `npm test` → 16 tests, 16 pass, 0 fail; the native Go path showed unavailable, which T4 replaced.
- T4 cause: `GET /api/experimental/usage/limits` returns `data: null` because `opencode-go` is a key-based integration without a Console OAuth workspace. The active Go key against `GET https://opencode.ai/zen/go/v1/usage` returned HTTP 200 with real windows.
- T4 evidence: `POST /api/rpc/usage-limits/go` returned rolling 100% limited, weekly 40%, monthly 20%; `npm test` → 23 tests, 23 pass, 0 fail.
- Next: review the local branch. Pushing, opening a pull request, and merging remain the user's decision; the OpenAI credential currently reports expired, so signing in to ChatGPT again is required for live OpenAI meters.
