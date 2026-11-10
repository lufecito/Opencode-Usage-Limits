import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readActiveOpenAIUsage } from "../src/service.ts"

const payload = {
  rate_limits: {
    primary: { used_percent: 10, window_duration_mins: 300, resets_at: 1_800_000_000 },
  },
}

describe("readActiveOpenAIUsage", () => {
  it("resolves only the active OpenAI connection", async () => {
    const calls: string[] = []
    const result = await readActiveOpenAIUsage({
      integration: {
        connection: {
          active: async (id) => {
            calls.push(`active:${id}`)
            return { id: "connection", integrationID: "openai" }
          },
          resolve: async (connection) => {
            calls.push(`resolve:${connection.integrationID}`)
            return { type: "oauth", access: "secret-access-token" }
          },
        },
      },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => payload,
      }),
    })

    assert.deepEqual(calls, ["active:openai", "resolve:openai"])
    assert.equal(result.status, "ready")
  })

  it("does not resolve or fetch when OpenAI is disconnected", async () => {
    let resolved = false
    let fetched = false
    const result = await readActiveOpenAIUsage({
      integration: {
        connection: {
          active: async () => undefined,
          resolve: async () => {
            resolved = true
            return undefined
          },
        },
      },
      fetchImpl: async () => {
        fetched = true
        return { ok: true, status: 200, json: async () => payload }
      },
    })

    assert.equal(resolved, false)
    assert.equal(fetched, false)
    assert.deepEqual(result, {
      status: "unavailable",
      message: "Connect OpenAI with ChatGPT to view subscription limits.",
      windows: [],
    })
  })

  it("fails safely when an active connection cannot resolve credentials", async () => {
    const result = await readActiveOpenAIUsage({
      integration: {
        connection: {
          active: async () => ({ id: "connection", integrationID: "openai" }),
          resolve: async () => undefined,
        },
      },
    })

    assert.deepEqual(result, {
      status: "unavailable",
      message: "OpenAI credentials are unavailable. Sign in again.",
      windows: [],
    })
  })
})
