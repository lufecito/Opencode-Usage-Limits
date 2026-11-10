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

function durationLabel(minutes: unknown, fallback: "Primary" | "Secondary"): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return fallback
  if (minutes % 10_080 === 0) {
    const weeks = minutes / 10_080
    return weeks === 1 ? "Weekly" : `${weeks} weeks`
  }
  if (minutes % 1_440 === 0) {
    const days = minutes / 1_440
    return days === 1 ? "1 day" : `${days} days`
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return hours === 1 ? "1 hour" : `${hours} hours`
  }
  return `${minutes} minutes`
}

function openAIWindow(
  raw: unknown,
  id: "primary" | "secondary",
): UsageWindow | null | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isRecord(raw)) return null

  const usedPercent = percent(raw.used_percent ?? raw.usedPercent)
  if (usedPercent === undefined) return null

  const duration = raw.window_duration_mins
    ?? raw.windowDurationMins
    ?? raw.window_minutes
    ?? raw.windowMinutes
  const reset = raw.resets_at ?? raw.resetsAt
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

function snapshot(value: unknown): UnknownRecord | undefined {
  if (isRecord(value)) return value
  if (!Array.isArray(value)) return undefined

  const records = value.filter(isRecord)
  return records.find((entry) => entry.limit_id === "codex" || entry.limitId === "codex")
    ?? records[0]
}

function selectSnapshot(payload: UnknownRecord): UnknownRecord | undefined {
  const direct = snapshot(payload.rate_limits ?? payload.rateLimits)
  if (direct) return direct

  const byID = payload.rate_limits_by_limit_id ?? payload.rateLimitsByLimitId
  if (!isRecord(byID)) return undefined
  return snapshot(byID.codex) ?? snapshot(Object.values(byID)[0])
}

export function normalizeOpenAI(payload: unknown): UsageResult {
  if (!isRecord(payload)) return errorUsage(INVALID_OPENAI)
  const selected = selectSnapshot(payload)
  if (!selected) return errorUsage(INVALID_OPENAI)

  const windows: UsageWindow[] = []
  for (const id of ["primary", "secondary"] as const) {
    const window = openAIWindow(selected[id], id)
    if (window === null) return errorUsage(INVALID_OPENAI)
    if (window) windows.push(window)
  }

  return windows.length > 0
    ? { status: "ready", message: null, windows }
    : errorUsage(INVALID_OPENAI)
}
