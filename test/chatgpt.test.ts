import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readOpenAIUsage } from "../src/chatgpt.ts"

const usagePayload = {
  rate_limits: {
    primary: { used_percent: 10, window_duration_mins: 300, resets_at: 1_800_000_000 },
    secondary: { used_percent: 20, window_duration_mins: 10_080, resets_at: 1_800_600_000 },
  },
}

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }
}

describe("readOpenAIUsage", () => {
  it("uses the active ChatGPT OAuth token only for the fixed usage request", async () => {
    let request: { url: string; headers: Record<string, string> } | undefined
    const result = await readOpenAIUsage({
      credential: {
        type: "oauth",
        access: "secret-access-token",
        metadata: { accountId: "account-123" },
      },
      fetchImpl: async (url, init) => {
        request = { url, headers: init.headers }
        return response(usagePayload)
      },
    })

    assert.equal(request?.url, "https://chatgpt.com/backend-api/wham/usage")
    assert.equal(request?.headers.authorization, "Bearer secret-access-token")
    assert.equal(request?.headers["chatgpt-account-id"], "account-123")
    assert.equal(result.status, "ready")
    assert.equal(result.windows.length, 2)
    assert.equal(JSON.stringify(result).includes("secret-access-token"), false)
  })

  it("derives the account header from the OAuth JWT when metadata has none", async () => {
    const payload = Buffer.from(JSON.stringify({
      "https://api.openai.com/auth": { chatgpt_account_id: "jwt-account-456" },
    })).toString("base64url")
    let accountHeader: string | undefined

    const result = await readOpenAIUsage({
      credential: { type: "oauth", access: `header.${payload}.signature` },
      fetchImpl: async (_url, init) => {
        accountHeader = init.headers["chatgpt-account-id"]
        return response(usagePayload)
      },
    })

    assert.equal(accountHeader, "jwt-account-456")
    assert.equal(result.status, "ready")
  })

  it("requires ChatGPT OAuth instead of sending an API key", async () => {
    let called = false
    const result = await readOpenAIUsage({
      credential: { type: "key", key: "secret-api-key" },
      fetchImpl: async () => {
        called = true
        return response(usagePayload)
      },
    })

    assert.equal(called, false)
    assert.deepEqual(result, {
      status: "unavailable",
      message: "Sign in to OpenAI with ChatGPT to view subscription limits.",
      windows: [],
    })
  })

  it("maps authentication and service failures without leaking response data", async () => {
    const unauthorized = await readOpenAIUsage({
      credential: { type: "oauth", access: "secret-access-token" },
      fetchImpl: async () => response({ error: "secret-access-token" }, 401),
    })
    assert.equal(unauthorized.status, "unavailable")
    assert.equal(JSON.stringify(unauthorized).includes("secret-access-token"), false)

    const unavailable = await readOpenAIUsage({
      credential: { type: "oauth", access: "secret-access-token" },
      fetchImpl: async () => response({ error: "private details" }, 503),
    })
    assert.deepEqual(unavailable, {
      status: "error",
      message: "OpenAI usage is temporarily unavailable (HTTP 503).",
      windows: [],
    })
  })

  it("handles malformed responses and network failures safely", async () => {
    const malformed = await readOpenAIUsage({
      credential: { type: "oauth", access: "secret-access-token" },
      fetchImpl: async () => response({ unexpected: true }),
    })
    assert.equal(malformed.status, "error")
    assert.equal(malformed.message, "OpenAI returned an unsupported usage response.")

    const network = await readOpenAIUsage({
      credential: { type: "oauth", access: "secret-access-token" },
      fetchImpl: async () => {
        throw new Error("request to secret-access-token failed")
      },
    })
    assert.deepEqual(network, {
      status: "error",
      message: "OpenAI usage is unreachable. Check your connection and retry.",
      windows: [],
    })
  })

  it("propagates cancellation instead of converting it into an error result", async () => {
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      readOpenAIUsage({
        credential: { type: "oauth", access: "secret-access-token" },
        signal: controller.signal,
        fetchImpl: async (_url, init) => {
          assert.equal(init.signal?.aborted, true)
          throw new DOMException("Aborted", "AbortError")
        },
      }),
      { name: "AbortError" },
    )
  })

  it("propagates cancellation that lands while the response body is parsed", async () => {
    const controller = new AbortController()

    await assert.rejects(
      readOpenAIUsage({
        credential: { type: "oauth", access: "secret-access-token" },
        signal: controller.signal,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => {
            controller.abort()
            throw new DOMException("Aborted", "AbortError")
          },
        }),
      }),
      { name: "AbortError" },
    )
  })
})
