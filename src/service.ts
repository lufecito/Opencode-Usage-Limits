import { readGoUsage } from "./go.ts"
import { readOpenAIUsage } from "./chatgpt.ts"
import { unavailableUsage, type UsageResult } from "./normalize.ts"

type UnknownRecord = Record<string, unknown>

type IntegrationReader = {
  readonly connection: {
    readonly active: (integrationID: string) => Promise<unknown>
    readonly resolve: (connection: unknown) => Promise<unknown>
  }
}

type FetchImpl = Parameters<typeof readOpenAIUsage>[0]["fetchImpl"]

type ReadActiveOpenAIUsageInput = {
  readonly integration: IntegrationReader
  readonly fetchImpl?: FetchImpl
  readonly signal?: AbortSignal
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export async function readActiveOpenAIUsage({
  integration,
  fetchImpl,
  signal,
}: ReadActiveOpenAIUsageInput): Promise<UsageResult> {
  const connection = await integration.connection.active("openai")
  if (connection === undefined || connection === null) {
    return unavailableUsage("Connect OpenAI with ChatGPT to view subscription limits.")
  }

  const credential = isRecord(connection)
    ? await integration.connection.resolve(connection)
    : undefined
  if (credential === undefined || credential === null) {
    return unavailableUsage("OpenAI credentials are unavailable. Sign in again.")
  }

  return readOpenAIUsage({ credential, fetchImpl, signal })
}

export async function readActiveGoUsage({
  integration,
  fetchImpl,
  signal,
}: ReadActiveOpenAIUsageInput): Promise<UsageResult> {
  const connection = await integration.connection.active("opencode-go")
  if (connection === undefined || connection === null) {
    return unavailableUsage("Connect OpenCode Go with an API key to view usage limits.")
  }

  const credential = isRecord(connection)
    ? await integration.connection.resolve(connection)
    : undefined
  if (credential === undefined || credential === null) {
    return unavailableUsage("OpenCode Go credentials are unavailable. Reconnect the API key.")
  }

  return readGoUsage({ credential, fetchImpl, signal })
}
