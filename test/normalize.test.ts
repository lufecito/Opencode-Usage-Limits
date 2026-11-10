import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { normalizeGo, normalizeOpenAI } from "../src/normalize.ts"

describe("normalizeGo", () => {
  it("maps rolling, weekly, and monthly consumption and reset times", () => {
    const result = normalizeGo({
      workspace: { id: "workspace", usageURL: "https://example.invalid" },
      go: {
        rolling: { percent: 25, limited: false, resetsAt: 1_800_000_000_000 },
        weekly: { percent: 50, limited: false, resetsAt: 1_800_100_000_000 },
        monthly: { percent: 100, limited: true, resetsAt: 1_800_200_000_000 },
      },
      budgets: [],
    })

    assert.deepEqual(result, {
      status: "ready",
      message: null,
      windows: [
        { id: "rolling", label: "5 hours", usedPercent: 25, limited: false, resetsAt: 1_800_000_000_000 },
        { id: "weekly", label: "Weekly", usedPercent: 50, limited: false, resetsAt: 1_800_100_000_000 },
        { id: "monthly", label: "Monthly", usedPercent: 100, limited: true, resetsAt: 1_800_200_000_000 },
      ],
    })
  })

  it("explains when no Console workspace is signed in", () => {
    assert.deepEqual(normalizeGo(null), {
      status: "unavailable",
      message: "Sign in to an OpenCode Console workspace to view Go limits.",
      windows: [],
    })
  })

  it("does not invent meters when Go is absent or malformed", () => {
    const missing = normalizeGo({ workspace: { id: "workspace", usageURL: "" }, budgets: [] })
    assert.equal(missing.status, "unavailable")
    assert.deepEqual(missing.windows, [])

    const malformed = normalizeGo({
      workspace: { id: "workspace", usageURL: "" },
      go: { rolling: { percent: "25", limited: false, resetsAt: 1_800_000_000_000 } },
      budgets: [],
    })
    assert.equal(malformed.status, "error")
    assert.deepEqual(malformed.windows, [])
  })
})

describe("normalizeOpenAI", () => {
  it("maps primary and secondary Codex snapshots without adding a monthly meter", () => {
    const result = normalizeOpenAI({
      rate_limits: {
        limit_id: "codex",
        primary: { used_percent: 42, window_duration_mins: 300, resets_at: 1_800_000_000 },
        secondary: { used_percent: 100, window_duration_mins: 10_080, resets_at: 1_800_600_000 },
        plan_type: "plus",
      },
    })

    assert.deepEqual(result, {
      status: "ready",
      message: null,
      windows: [
        { id: "primary", label: "5 hours", usedPercent: 42, limited: false, resetsAt: 1_800_000_000_000 },
        { id: "secondary", label: "Weekly", usedPercent: 100, limited: true, resetsAt: 1_800_600_000_000 },
      ],
    })
  })

  it("accepts camel-case bucket responses and preserves available windows only", () => {
    const result = normalizeOpenAI({
      rateLimitsByLimitId: {
        codex: {
          primary: { usedPercent: 12.5, windowDurationMins: 300, resetsAt: null },
          secondary: null,
        },
      },
    })

    assert.deepEqual(result, {
      status: "ready",
      message: null,
      windows: [
        { id: "primary", label: "5 hours", usedPercent: 12.5, limited: false, resetsAt: null },
      ],
    })
  })

  it("rejects unsupported payloads and out-of-range percentages", () => {
    for (const payload of [null, {}, { rate_limits: { primary: { used_percent: 101 } } }]) {
      const result = normalizeOpenAI(payload)
      assert.equal(result.status, "error")
      assert.equal(result.message, "OpenAI returned an unsupported usage response.")
      assert.deepEqual(result.windows, [])
    }
  })
})
