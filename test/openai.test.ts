import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { normalizeOpenAI } from "../src/normalize.ts"
import { openAIAccountID, readOpenAIUsage } from "../src/chatgpt.ts"

const usagePayload = {
  user_id: "user-1",
  account_id: "account-1",
  plan_type: "plus",
  rate_limit: {
    allowed: false,
    limit_reached: true,
    primary_window: {
      used_percent: 100,
      limit_window_seconds: 18_000,
      reset_after_seconds: 1_538,
      reset_at: 1_794_336_560,
    },
    secondary_window: {
      used_percent: 53,
      limit_window_seconds: 604_800,
      reset_after_seconds: 498_605,
      reset_at: 1_794_833_628,
    },
  },
}

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }
}

describe("normalizeOpenAI", () => {
  it("maps primary and secondary windows with reset times and no monthly meter", () => {
    assert.deepEqual(normalizeOpenAI(usagePayload), {
      status: "ready",
      message: null,
      windows: [
        {
          id: "primary",
          label: "5 hours",
          usedPercent: 100,
          limited: true,
          resetsAt: 1_794_336_560_000,
        },
        {
          id: "secondary",
          label: "Weekly",
          usedPercent: 53,
          limited: false,
          resetsAt: 1_794_833_628_000,
        },
      ],
    })
  })

  it("accepts camel-case fields and legacy bucket shapes", () => {
    const camel = normalizeOpenAI({
      rateLimit: {
        primaryWindow: { usedPercent: 12.5, limitWindowSeconds: 18_000, resetAt: 1_800_000_000 },
        secondaryWindow: null,
      },
    })
    assert.deepEqual(camel, {
      status: "ready",
      message: null,
      windows: [
        { id: "primary", label: "5 hours", usedPercent: 12.5, limited: false, resetsAt: 1_800_000_000_000 },
      ],
    })

    const legacy = normalizeOpenAI({
      rate_limits: {
        primary: { used_percent: 42, window_duration_mins: 300, resets_at: 1_800_000_000 },
        secondary: { used_percent: 7, window_duration_mins: 10_080, resets_at: 1_800_600_000 },
      },
    })
    assert.deepEqual(legacy, {
      status: "ready",
      message: null,
      windows: [
        { id: "primary", label: "5 hours", usedPercent: 42, limited: false, resetsAt: 1_800_000_000_000 },
        { id: "secondary", label: "Weekly", usedPercent: 7, limited: false, resetsAt: 1_800_600_000_000 },
      ],
    })
  })

  it("rejects payloads without windows and out-of-range percentages", () => {
    for (const payload of [null, {}, { rate_limit: null }, { rate_limit: { primary_window: null } }]) {
      const result = normalizeOpenAI(payload)
      assert.equal(result.status, "error")
      assert.equal(result.message, "OpenAI returned an unsupported usage response.")
      assert.deepEqual(result.windows, [])
    }

    const invalid = normalizeOpenAI({
      rate_limit: {
        primary_window: { used_percent: 101, limit_window_seconds: 18_000, reset_at: 1_800_000_000 },
      },
    })
    assert.equal(invalid.status, "error")
  })
})

describe("openAIAccountID", () => {
  const account = "4c723658-bf25-4034-b1ed-3000729fa5e2"
  const payload = Buffer.from(
    JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: account } }),
  ).toString("base64url")

  it("reads the account from metadata or the access token claims", () => {
    assert.equal(openAIAccountID({ metadata: { accountId: "meta-account" } }), "meta-account")
    assert.equal(openAIAccountID({ access: `header.${payload}.signature` }), account)
    assert.equal(openAIAccountID({ access: "not-a-jwt" }), undefined)
    assert.equal(openAIAccountID({}), undefined)
  })
})

describe("readOpenAIUsage", () => {
  const access = `header.${Buffer.from(
    JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "account-1" } }),
  ).toString("base64url")}.signature`

  it("sends the OAuth token only to the fixed usage endpoint with the account id", async () => {
    let request: { url: string; headers: Record<string, string> } | undefined
    const result = await readOpenAIUsage({
      credential: { type: "oauth", access },
      fetchImpl: async (url, init) => {
        request = { url, headers: init.headers }
        return response(usagePayload)
      },
    })

    assert.equal(request?.url, "https://chatgpt.com/backend-api/wham/usage")
    assert.equal(request?.headers.authorization, `Bearer ${access}`)
    assert.equal(request?.headers["chatgpt-account-id"], "account-1")
    assert.equal(result.status, "ready")
    assert.equal(JSON.stringify(result).includes(access), false)
  })

  it("rejects API keys and empty tokens without fetching", async () => {
    for (const credential of [
      { type: "key", key: "secret-api-key" },
      { type: "oauth", access: "" },
      null,
    ]) {
      let called = false
      const result = await readOpenAIUsage({
        credential,
        fetchImpl: async () => {
          called = true
          return response(usagePayload)
        },
      })
      assert.equal(called, false)
      assert.equal(result.status, "unavailable")
      assert.equal(JSON.stringify(result).includes("secret-api-key"), false)
    }
  })

  it("maps authentication, service, and network failures safely", async () => {
    const unauthorized = await readOpenAIUsage({
      credential: { type: "oauth", access },
      fetchImpl: async () => response({ error: "private" }, 401),
    })
    assert.deepEqual(unauthorized, {
      status: "unavailable",
      message: "ChatGPT authentication expired. Sign in to OpenAI again.",
      windows: [],
    })

    const unavailable = await readOpenAIUsage({
      credential: { type: "oauth", access },
      fetchImpl: async () => response({ error: "private" }, 503),
    })
    assert.deepEqual(unavailable, {
      status: "error",
      message: "OpenAI usage is temporarily unavailable (HTTP 503).",
      windows: [],
    })

    const network = await readOpenAIUsage({
      credential: { type: "oauth", access },
      fetchImpl: async () => {
        throw new Error(`request to ${access} failed`)
      },
    })
    assert.deepEqual(network, {
      status: "error",
      message: "OpenAI usage is unreachable. Check your connection and retry.",
      windows: [],
    })
  })

  it("propagates cancellation, including during body parsing", async () => {
    const pre = new AbortController()
    pre.abort()
    await assert.rejects(
      readOpenAIUsage({
        credential: { type: "oauth", access },
        signal: pre.signal,
        fetchImpl: async () => {
          throw new DOMException("Aborted", "AbortError")
        },
      }),
      { name: "AbortError" },
    )

    const body = new AbortController()
    await assert.rejects(
      readOpenAIUsage({
        credential: { type: "oauth", access },
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
