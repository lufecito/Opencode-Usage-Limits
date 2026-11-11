# OpenCode usage limits sidebar

Objective: add a global OpenCode TUI plugin for OpenCode Go and OpenAI ChatGPT usage limits.
Branch/delivery: `main` and `feat/usage-limits-sidebar` in `lufecito/Opencode-Usage-Limits`; user authorized the push on 2026-11-11. Test runner: Node.js built-in test runner with TypeScript type stripping; `sh` for the installer.

## Specs

- S1: "que me muestre los consumos cada 5hrs, semanal y mensual." Display OpenCode Go rolling, weekly, and monthly meters with used percentage, limited state, and reset time. Display the primary and secondary OpenAI ChatGPT windows supplied by the backend; do not invent a monthly OpenAI meter when none is supplied. Verify deterministic view models.
- S2: "Idealmente y si el proyecto lo permite, que se posicione en la barra lateral derecha." Append the plugin UI to OpenCode TUI's `sidebar.content` slot and verify that OpenCode loads the plugin.
- S3: "elimina OpenAI, no es necesario" (superseded by L7) Read OpenCode Go through `GET https://opencode.ai/zen/go/v1/usage` with the active `opencode-go` API key behind the server RPC. Read OpenAI ChatGPT usage through the active OpenAI OAuth credential and the fixed `https://chatgpt.com/backend-api/wham/usage` endpoint behind the same RPC. Only legacy Codex login tokens (`chatgpt-browser`/`chatgpt-headless`) report plan usage; token-sharing tokens are rejected by OpenAI with HTTP 401 `rejected_by_access_enforcement`. Never persist or log credentials. Verify parsing, authentication failures, malformed responses, cancellation, and plugin cleanup.
- S4: "adáptalo para que sea usable en un computador que no tiene privilegios de administrador". Install and run with no administrator privileges, no root, and no `npm install`: copy the plugin into the global plugin directory `${XDG_CONFIG_HOME:-$HOME/.config}/opencode/plugins/opencode-usage-limits` and let the existing discovery layout load it, or keep an explicit path entry. Ship an installer for both cases plus removal. Verify the plugin loads from the global directory with no config entry and the same `server`/`tui`/`rpc` features.

## Tasks

- [x] T1 (S1, S3) inline — shared normalization and view models with RED/GREEN tests; `normalize.ts` + `test/normalize.test.ts`, commit `93e7ce5`.
- [x] T2 (S3) inline — OpenAI credential adapter and server RPC with RED/GREEN tests; `chatgpt.ts`, `service.ts`, `rpc.ts`, `index.ts` and their tests, commits `26be314` and `bdde44c`.
- [x] T3 (S1-S3) inline — TUI sidebar, OpenCode Go client integration, lifecycle cleanup, documentation, and runtime load check; `tui.tsx`, `README.md`, commit `e11ce44` and this docs commit.
- [x] T4 (S3) inline — replace the Console-only native Go endpoint with the Go API-key usage endpoint; `go.ts`, `normalize.ts`, `service.ts`, `rpc.ts`, `index.ts`, `tui.tsx`, `test/go.test.ts`, commit `e6f15d7`.
- [x] T5 (S1, S3) inline — remove every OpenAI/ChatGPT provider path, leaving only OpenCode Go; deleted `chatgpt.ts`, `test/chatgpt.test.ts`, `test/normalize.test.ts`, trimmed `normalize.ts`, `service.ts`, `rpc.ts`, `index.ts`, `tui.tsx`, `test/service.test.ts`, `README.md`, `package.json`; commit `be99b8c`.
- [x] T6 (S1, S3) inline — restore OpenAI ChatGPT usage for the legacy Codex login and parse the current `rate_limit.primary_window`/`secondary_window` contract; `chatgpt.ts`, `normalize.ts`, `service.ts`, `rpc.ts`, `index.ts`, `tui.tsx`, `test/openai.test.ts`, `test/service.test.ts`, `README.md`, `package.json`; commit `fac706e`.
- [x] T7 (S4) inline — privilege-free installation: `install.sh` (copy into the global plugin directory, `--uninstall`, no sudo, no npm), README no-admin section, verified global discovery load.

## Log

- L1 (2026-11-10): "Planifiquemos una integración para Opencode que me muestre los consumos cada 5hrs, semanal y mensual. Idealmente y si el proyecto lo permite, que se posicione en la barra lateral derecha."
- L2 (2026-11-10): "Implementemos entonces en base a la planificación hecho por el agente Plan"
- L3 (2026-11-10): "Los límites de Opencode Go y los límites de OpenAI"
- L4 (2026-11-10): "https://github.com/lufecito/Opencode-Usage-Limits este es el repositorio Git" / "Prosigue". The implementation moved from global config scratch files into the authorized public repository. Remote push remains undecided.
- L5 (2026-11-10): "pero, me da este aviso Usage limits / OpenCode Go / Sign in to an OpenCode Console workspace to view Go limits." The native endpoint only serves Console workspaces, so T4 switches Go to the API-key usage endpoint.
- L6 (2026-11-10): "elimina OpenAI, no es necesario". S1 and S3 now cover OpenCode Go only; T2's OpenAI adapter is intentionally removed by T5.
- L7 (2026-11-10): "Necesito ver si obtienes los datos de uso de tokens de openai, me acabo de autenticar vía web" / "listo". The web login is token sharing and cannot read plan usage; after connecting "Codex browser (legacy)" the endpoint returned HTTP 200, so T6 restores the OpenAI section with the new response contract.
- Route: all tasks are dependent slices of one behavior and remain inline; no Writer trigger applies.
- Verified environment: repository cloned with an unborn `main`; working branch `feat/usage-limits-sidebar`. OpenCode v2.2.5; Node.js v24.22.1; RDD is globally off.
- Risk: item 2 (the server adapter resolves the active API-key credential, including the provider key). Missing/expired credentials must fail safely.
- Verified T1/T2 (RED then GREEN): missing modules failed with `ERR_MODULE_NOT_FOUND`; the `chatgpt.ts` abort-during-body fix had a dedicated failing test before the change (that adapter was removed later by T5).
- Verified T3 runtime: `GET /api/plugin` reports `usage-limits` active with `server`, `tui`, and `rpc`; `POST /api/rpc/usage-limits/chatgpt` returned the safe expired-credential result at the time, proving the fixed-URL path and active-connection resolution end to end (method removed by T5).
- Verified T3 UI contract against `@opencode/plugin` TUI types: `append: "sidebar.content"` is a valid `SlotClaim`, `data.on("session.usage.updated")`, `data.location.default()`, and `client.rpc(def).method(input, options)` all match the published signatures.
- Independent verification (read-only, fresh scratch copy): 10 of 11 probes passed; blocker B1 (abort during `response.json()`) was fixed with a regression test; advisory A1 (OpenAI-only) is no longer applicable after T5.
- Test evidence (T1-T3): `npm test` → 16 tests, 16 pass, 0 fail; the native Go path showed unavailable, which T4 replaced.
- T4 cause: `GET /api/experimental/usage/limits` returns `data: null` because `opencode-go` is a key-based integration without a Console OAuth workspace. The active Go key against `GET https://opencode.ai/zen/go/v1/usage` returned HTTP 200 with real windows.
- T4 evidence: `POST /api/rpc/usage-limits/go` returned rolling 100% limited, weekly 40%, monthly 20%; `npm test` → 23 tests, 23 pass, 0 fail.
- T5 RED: deleting `src/chatgpt.ts` first made `test/chatgpt.test.ts` and `test/service.test.ts` fail with `ERR_MODULE_NOT_FOUND`.
- T5 GREEN: `npm test` → 10 tests in 3 suites, 10 pass, 0 fail; no `openai`/`chatgpt` reference remains in `src/`, `test/`, or `package.json`.
- T5 runtime: after `POST /api/location/reload`, `usage-limits` is active and `POST /api/rpc/usage-limits/go` returns rolling 100% limited, weekly 40%, monthly 20%; `POST /api/rpc/usage-limits/chatgpt` now returns `rpc.method_not_found`.
- T6 cause: the `Sign in with ChatGPT` credential (`methodID: chatgpt-token-sharing`, scopes `chatgpt.tokens.use.direct`/`resource.invoke`) gets HTTP 401 `rejected_by_access_enforcement`/`no_matching_rule` from `wham/usage`; OpenAI documents the gap in `openai/codex#54219`. The legacy `chatgpt-browser` credential (`OpenAI 4`) returned HTTP 200 with `rate_limit.primary_window`/`secondary_window`.
- T6 contract change: the endpoint no longer returns `rate_limits.primary`/`secondary` with `window_duration_mins`; it returns `rate_limit.*_window` with `limit_window_seconds` and `reset_at` (epoch seconds). The parser accepts both shapes.
- T6 RED: `test/openai.test.ts` failed with `ERR_MODULE_NOT_FOUND` before the adapter and normalizer were restored.
- T6 GREEN: `npm test` → 21 tests, 21 pass, 0 fail.
- T6 runtime: `usage-limits` active with `server`, `tui`, `rpc`; `POST /api/rpc/usage-limits/chatgpt` returns primary 100% limited (5 hours) and weekly 53%; `POST /api/rpc/usage-limits/go` still returns rolling 100% limited, weekly 40%, monthly 20%.
- T6 independent verification (read-only, fresh scratch copy of `fac706e`): PASS. `npm test` 21/21; 15/15 spec probes; 14/14 candidate-vs-baseline Go scenarios identical; `src/go.ts` byte-identical to baseline; `src/chatgpt.ts` byte-identical to the previously runtime-verified `bdde44c` adapter; no `console.*`, fs, or env use in `src/`; output schema validated against real normalize output. No blockers.
- T6 advisories resolved: the stale "commit pending" line and the under-guiding 401 message were fixed (`834ea34`, message now points to the legacy Codex login). `reset_after_seconds`-only payloads, the extra TUI wrapper box, and the missing typecheck tooling were accepted as non-blocking; the documented contract always supplies `reset_at`.
- T6 follow-up test coverage added from the verifier probes: legacy `rate_limits_by_limit_id`, decoy metadata URLs, and the 0/99.9/100 limit boundary. `npm test` → 22 tests, 22 pass, 0 fail.
- Next: review the local branch. Pushing, opening a pull request, and merging remain the user's decision.
- L8 (2026-11-11): "Pushiemos ambas, eso sí, adáptalo para que sea usable en un computador que no tiene privilegios de administrador, se puede?" Push authorized for `main` and `feat/usage-limits-sidebar`; both pushed at `df7c4b2`.
- T7 cause: the working machine loads the plugin through an absolute `plugins` entry and `/usr/bin/opencode` is root-owned, so the previous instructions implied an elevated setup. `src/` uses no `fs`, `process.env`, or `child_process`, and the package has no installed runtime dependencies, so nothing in the plugin needs elevation.
- T7 mechanism: OpenCode discovers immediate plugin package directories under `${XDG_CONFIG_HOME:-$HOME/.config}/opencode/plugins` with no `opencode.json` entry (documented in the V2 Configure plugins guide). Verified empirically with a throwaway package directory that appeared in `GET /api/plugin`.
- T7 RED: the first scratch install only copied `package.json` and `README.md`; the verification `find` was bounded at depth 4 and hid `src/`. Re-run without the depth bound listed all eight `src/` files, so the installer was correct and the probe was wrong.
- T7 GREEN: `install.sh` on a scratch `XDG_CONFIG_HOME` copied `package.json`, `README.md`, and all eight `src` files, re-ran without error, and `--uninstall` removed the directory; `sh -n install.sh` clean.
- T7 runtime: temporary install into the real global plugin directory with the `plugins` entry removed produced `{"id":"usage-limits","source":{"path":".../.config/opencode/plugins/opencode-usage-limits"},"features":{"server":true,"tui":true,"rpc":true},"state":{"status":"active"}}`. The original config entry and directory layout were restored afterwards and re-verified as active from `/home/lufecito/Opencode-Usage-Limits`.
- Next: `npm test` suite, commit, and push both branches.
