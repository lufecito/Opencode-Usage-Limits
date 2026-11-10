import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readGoUsage } from "../src/go.ts"
import { normalizeGoUsage } from "../src/normalize.ts"

const usagePayload = {
  usage: {
    rolling: { status: "ok", percent: 12, resetsAt: "2026-11-10T21:38:26.000Z" },
    weekly: { status: "ok", percent: 40, resetsAt: "2026-11-16T00:00:00.000Z" },
    monthly: { status: "rate-limited", percent: 100, resetsAt: "2026-12-10T16:32:44.000Z" },
  },
}

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }
}

describe("normalizeGoUsage", () => {
  it("maps rolling, weekly, and monthly windows with ISO reset times", () => {
    assert.deepEqual(normalizeGoUsage(usagePayload), {
      status: "ready",
      message: null,
      windows: [
        {
          id: "rolling",
          label: "5 hours",
          usedPercent: 12,
          limited: false,
          resetsAt: Date.parse("2026-11-10T21:38:26.000Z"),
        },
        {
          id: "weekly",
          label: "Weekly",
          usedPercent: 40,
          limited: false,
          resetsAt: Date.parse("2026-11-16T00:00:00.000Z"),
        },
        {
          id: "monthly",
          label: "Monthly",
          usedPercent: 100,
          limited: true,
          resetsAt: Date.parse("2026-12-10T16:32:44.000Z"),
        },
      ],
    })
  })

  it("rejects payloads without the usage windows", () => {
    for (const payload of [null, {}, { usage: null }, { usage: { rolling: null } }]) {
      const result = normalizeGoUsage(payload)
      assert.equal(result.status, "error")
      assert.equal(result.message, "OpenCode Go returned an unsupported usage response.")
      assert.deepEqual(result.windows, [])
    }
  })

  it("rejects out-of-range percentages and invalid reset times", () => {
    const invalidPercent = normalizeGoUsage({
      usage: { rolling: { status: "ok", percent: 101, resetsAt: "2026-11-10T21:38:26.000Z" } },
    })
    assert.equal(invalidPercent.status, "error")

    const invalidReset = normalizeGoUsage({
      usage: { rolling: { status: "ok", percent: 10, resetsAt: "not-a-date" } },
    })
    assert.equal(invalidReset.status, "error")
  })
})

describe("readGoUsage", () => {
  it("sends the Go API key only to the fixed usage endpoint", async () => {
    let request: { url: string; headers: Record<string, string> } | undefined
    const result = await readGoUsage({
      credential: { type: "key", key: "secret-go-key" },
      fetchImpl: async (url, init) => {
        request = { url, headers: init.headers }
        return response(usagePayload)
      },
    })

    assert.equal(request?.url, "https://opencode.ai/zen/go/v1/usage")
    assert.equal(request?.headers.authorization, "Bearer secret-go-key")
    assert.equal(result.status, "ready")
    assert.equal(JSON.stringify(result).includes("secret-go-key"), false)
  })

  it("rejects non-key credentials without fetching", async () => {
    for (const credential of [
      { type: "oauth", access: "secret-go-key" },
      { type: "key", key: "" },
      null,
    ]) {
      let called = false
      const result = await readGoUsage({
        credential,
        fetchImpl: async () => {
          called = true
          return response(usagePayload)
        },
      })
      assert.equal(called, false)
      assert.equal(JSON.stringify(result).includes("secret-go-key"), false)
    }
  })

  it("maps authentication, service, and network failures safely", async () => {
    const unauthorized = await readGoUsage({
      credential: { type: "key", key: "secret-go-key" },
      fetchImpl: async () => response({ error: "secret-go-key" }, 401),
    })
    assert.deepEqual(unauthorized, {
      status: "unavailable",
      message: "OpenCode Go authentication expired. Reconnect the API key.",
      windows: [],
    })

    const unavailable = await readGoUsage({
      credential: { type: "key", key: "secret-go-key" },
      fetchImpl: async () => response({ error: "private" }, 503),
    })
    assert.deepEqual(unavailable, {
      status: "error",
      message: "OpenCode Go usage is temporarily unavailable (HTTP 503).",
      windows: [],
    })

    const network = await readGoUsage({
      credential: { type: "key", key: "secret-go-key" },
      fetchImpl: async () => {
        throw new Error("request to secret-go-key failed")
      },
    })
    assert.deepEqual(network, {
      status: "error",
      message: "OpenCode Go usage is unreachable. Check your connection and retry.",
      windows: [],
    })
  })

  it("propagates cancellation, including during body parsing", async () => {
    const pre = new AbortController()
    pre.abort()
    await assert.rejects(
      readGoUsage({
        credential: { type: "key", key: "secret-go-key" },
        signal: pre.signal,
        fetchImpl: async () => {
          throw new DOMException("Aborted", "AbortError")
        },
      }),
      { name: "AbortError" },
    )

    const body = new AbortController()
    await assert.rejects(
      readGoUsage({
        credential: { type: "key", key: "secret-go-key" },
        signal: body.signal,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => {
            body.abort()
            throw new DOMException("Aborted", "AbortError")
          },
        }),
      }),
      { name: "AbortError" },
    )
  })
})
