import {
  errorUsage,
  normalizeOpenAI,
  unavailableUsage,
  type UsageResult,
} from "./normalize.ts"

export const OPENAI_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"

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

type ReadOpenAIUsageInput = {
  readonly credential: unknown
  readonly fetchImpl?: FetchImpl
  readonly signal?: AbortSignal
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringField(record: UnknownRecord, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = record[name]
    if (typeof value === "string" && value.length > 0) return value
  }
  return undefined
}

function accountFromJWT(access: string): string | undefined {
  const segments = access.split(".")
  if (segments.length !== 3) return undefined

  try {
    const payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"))
    if (!isRecord(payload)) return undefined
    const auth = payload["https://api.openai.com/auth"]
    return isRecord(auth)
      ? stringField(auth, ["chatgpt_account_id", "chatgptAccountId"])
      : undefined
  } catch {
    return undefined
  }
}

export function openAIAccountID(credential: UnknownRecord): string | undefined {
  if (isRecord(credential.metadata)) {
    const account = stringField(credential.metadata, [
      "accountId",
      "accountID",
      "chatgptAccountId",
      "chatgpt_account_id",
      "account_id",
    ])
    if (account) return account
  }

  return typeof credential.access === "string"
    ? accountFromJWT(credential.access)
    : undefined
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true
    || (error instanceof DOMException && error.name === "AbortError")
}

export async function readOpenAIUsage({
  credential,
  fetchImpl = fetch,
  signal,
}: ReadOpenAIUsageInput): Promise<UsageResult> {
  if (
    !isRecord(credential)
    || credential.type !== "oauth"
    || typeof credential.access !== "string"
    || credential.access.length === 0
  ) {
    return unavailableUsage("Sign in to OpenAI with ChatGPT to view subscription limits.")
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${credential.access}`,
    "user-agent": "opencode-usage-limits",
  }
  const accountID = openAIAccountID(credential)
  if (accountID) headers["chatgpt-account-id"] = accountID

  let response: UsageResponse
  try {
    response = await fetchImpl(OPENAI_USAGE_URL, { headers, signal })
  } catch (error) {
    if (isAbort(error, signal)) throw error
    return errorUsage("OpenAI usage is unreachable. Check your connection and retry.")
  }

  if (response.status === 401 || response.status === 403) {
    return unavailableUsage("ChatGPT authentication expired. Sign in to OpenAI again.")
  }
  if (response.status === 429 || response.status >= 500) {
    return errorUsage(`OpenAI usage is temporarily unavailable (HTTP ${response.status}).`)
  }
  if (!response.ok) {
    return errorUsage(`OpenAI usage request failed (HTTP ${response.status}).`)
  }

  try {
    return normalizeOpenAI(await response.json())
  } catch (error) {
    if (isAbort(error, signal)) throw error
    return errorUsage("OpenAI returned an unsupported usage response.")
  }
}
