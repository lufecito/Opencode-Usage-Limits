import {
  errorUsage,
  normalizeGoUsage,
  unavailableUsage,
  type UsageResult,
} from "./normalize.ts"

export const GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage"

type UnknownRecord = Record<string, unknown>

type UsageResponse = {
  readonly ok: boolean
  readonly status: number
  readonly json: () => Promise<unknown>
}

type FetchImpl = (
  url: string,
  init: {
    readonly headers: Record<string, string>
    readonly signal?: AbortSignal
  },
) => Promise<UsageResponse>

type ReadGoUsageInput = {
  readonly credential: unknown
  readonly fetchImpl?: FetchImpl
  readonly signal?: AbortSignal
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true
    || (error instanceof DOMException && error.name === "AbortError")
}

export async function readGoUsage({
  credential,
  fetchImpl = fetch,
  signal,
}: ReadGoUsageInput): Promise<UsageResult> {
  if (
    !isRecord(credential)
    || credential.type !== "key"
    || typeof credential.key !== "string"
    || credential.key.length === 0
  ) {
    return unavailableUsage("Connect OpenCode Go with an API key to view usage limits.")
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${credential.key}`,
    "user-agent": "opencode-usage-limits",
  }

  let response: UsageResponse
  try {
    response = await fetchImpl(GO_USAGE_URL, { headers, signal })
  } catch (error) {
    if (isAbort(error, signal)) throw error
    return errorUsage("OpenCode Go usage is unreachable. Check your connection and retry.")
  }

  if (response.status === 401 || response.status === 403) {
    return unavailableUsage("OpenCode Go authentication expired. Reconnect the API key.")
  }
  if (response.status === 429 || response.status >= 500) {
    return errorUsage(`OpenCode Go usage is temporarily unavailable (HTTP ${response.status}).`)
  }
  if (!response.ok) {
    return errorUsage(`OpenCode Go usage request failed (HTTP ${response.status}).`)
  }

  try {
    return normalizeGoUsage(await response.json())
  } catch (error) {
    if (isAbort(error, signal)) throw error
    return errorUsage("OpenCode Go returned an unsupported usage response.")
  }
}
