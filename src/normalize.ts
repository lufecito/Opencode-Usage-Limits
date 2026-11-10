export type UsageStatus = "loading" | "ready" | "unavailable" | "error"

export type UsageWindow = {
  readonly id: string
  readonly label: string
  readonly usedPercent: number
  readonly limited: boolean
  readonly resetsAt: number | null
}

export type UsageResult = {
  readonly status: UsageStatus
  readonly message: string | null
  readonly windows: readonly UsageWindow[]
}

type UnknownRecord = Record<string, unknown>

const INVALID_GO = "OpenCode Go returned an unsupported usage response."
const INVALID_OPENAI = "OpenAI returned an unsupported usage response."

const GO_WINDOWS = [
  ["rolling", "5 hours"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
] as const

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function percent(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : undefined
}

function isoMilliseconds(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== "string") return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function errorUsage(message: string): UsageResult {
  return { status: "error", message, windows: [] }
}

export function unavailableUsage(message: string): UsageResult {
  return { status: "unavailable", message, windows: [] }
}

function goWindow(raw: unknown, id: string, label: string): UsageWindow | null {
  if (!isRecord(raw)) return null

  const usedPercent = percent(raw.percent)
  if (usedPercent === undefined) return null

  const resetsAt = isoMilliseconds(raw.resetsAt)
  if (resetsAt === undefined) return null

  return {
    id,
    label,
    usedPercent,
    limited: usedPercent >= 100 || raw.status === "rate-limited",
    resetsAt,
  }
}

export function normalizeGoUsage(payload: unknown): UsageResult {
  if (!isRecord(payload) || !isRecord(payload.usage)) return errorUsage(INVALID_GO)

  const windows: UsageWindow[] = []

  for (const [id, label] of GO_WINDOWS) {
    const raw = payload.usage[id]
    if (raw === undefined) continue
    const window = goWindow(raw, id, label)
    if (!window) return errorUsage(INVALID_GO)
    windows.push(window)
  }

  return windows.length > 0
    ? { status: "ready", message: null, windows }
    : errorUsage(INVALID_GO)
}

function durationLabel(seconds: unknown, fallback: string): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return fallback
  if (seconds % 604_800 === 0) {
    const weeks = seconds / 604_800
    return weeks === 1 ? "Weekly" : `${weeks} weeks`
  }
  if (seconds % 86_400 === 0) {
    const days = seconds / 86_400
    return days === 1 ? "1 day" : `${days} days`
  }
  if (seconds % 3_600 === 0) {
    const hours = seconds / 3_600
    return hours === 1 ? "1 hour" : `${hours} hours`
  }
  return `${Math.round(seconds / 60)} minutes`
}

function openAIWindow(
  raw: unknown,
  id: "primary" | "secondary",
): UsageWindow | null | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isRecord(raw)) return null

  const usedPercent = percent(raw.used_percent ?? raw.usedPercent)
  if (usedPercent === undefined) return null

  const seconds = raw.limit_window_seconds ?? raw.limitWindowSeconds
  const minutes = raw.window_duration_mins ?? raw.windowDurationMins
  const duration = typeof seconds === "number" ? seconds : typeof minutes === "number" ? minutes * 60 : undefined

  const reset = raw.reset_at ?? raw.resetAt ?? raw.resets_at ?? raw.resetsAt
  const resetsAt = typeof reset === "number" && Number.isFinite(reset) && reset > 0
    ? reset * 1_000
    : null

  return {
    id,
    label: durationLabel(duration, id === "primary" ? "Primary" : "Secondary"),
    usedPercent,
    limited: usedPercent >= 100,
    resetsAt,
  }
}

function openAIWindows(payload: UnknownRecord): UnknownRecord | undefined {
  const direct = payload.rate_limit
    ?? payload.rateLimit
    ?? payload.rate_limits
    ?? payload.rateLimits
  if (isRecord(direct)) return direct

  const byID = payload.rate_limits_by_limit_id ?? payload.rateLimitsByLimitId
  if (!isRecord(byID)) return undefined
  if (isRecord(byID.codex)) return byID.codex
  return Object.values(byID).find(isRecord)
}

function windowField(container: UnknownRecord, names: readonly string[]): unknown {
  for (const name of names) {
    if (name in container) return container[name]
  }
  return undefined
}

export function normalizeOpenAI(payload: unknown): UsageResult {
  if (!isRecord(payload)) return errorUsage(INVALID_OPENAI)
  const container = openAIWindows(payload)
  if (!container) return errorUsage(INVALID_OPENAI)

  const windows: UsageWindow[] = []
  const definitions = [
    ["primary", ["primary_window", "primaryWindow", "primary"]],
    ["secondary", ["secondary_window", "secondaryWindow", "secondary"]],
  ] as const

  for (const [id, names] of definitions) {
    const window = openAIWindow(windowField(container, names), id)
    if (window === null) return errorUsage(INVALID_OPENAI)
    if (window) windows.push(window)
  }

  return windows.length > 0
    ? { status: "ready", message: null, windows }
    : errorUsage(INVALID_OPENAI)
}
