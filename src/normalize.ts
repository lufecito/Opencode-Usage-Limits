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
