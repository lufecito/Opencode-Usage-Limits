import { For, Show, createSignal } from "solid-js"
import { Plugin } from "@opencode/plugin/tui"
import { errorUsage, type UsageResult } from "./normalize.ts"
import { UsageLimitsRpc } from "./rpc.ts"

const REFRESH_INTERVAL_MS = 60_000
const loading: UsageResult = {
  status: "loading",
  message: null,
  windows: [],
}

function percentage(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function resetLabel(resetsAt: number | null): string {
  if (resetsAt === null) return "Reset unavailable"
  return `Reset ${new Date(resetsAt).toLocaleString()}`
}

function ProviderUsage(props: {
  readonly title: string
  readonly usage: UsageResult
}) {
  return (
    <box flexDirection="column" paddingTop={1}>
      <text>{props.title}</text>
      <Show when={props.usage.status === "loading"}>
        <text>Loading...</text>
      </Show>
      <Show when={props.usage.message}>
        <text>{props.usage.message}</text>
      </Show>
      <For each={props.usage.windows}>
        {(window) => (
          <box flexDirection="column">
            <text>
              {`${window.label}: ${percentage(window.usedPercent)}% used${window.limited ? " - limit reached" : ""}`}
            </text>
            <text>{resetLabel(window.resetsAt)}</text>
          </box>
        )}
      </For>
    </box>
  )
}

export default Plugin.define({
  id: "usage-limits.tui",
  setup(context) {
    const [go, setGo] = createSignal<UsageResult>(loading)
    const [chatgpt, setChatGPT] = createSignal<UsageResult>(loading)
    const location = context.location ?? context.data.location.default()
    const controller = new AbortController()
    let refreshing = false

    const loadGo = async () => {
      try {
        const usage = await context.client.rpc(UsageLimitsRpc).go(
          {},
          { location, signal: controller.signal },
        )
        setGo(usage)
      } catch {
        if (!controller.signal.aborted) {
          setGo(errorUsage("Could not load OpenCode Go limits."))
        }
      }
    }

    const loadChatGPT = async () => {
      try {
        const usage = await context.client.rpc(UsageLimitsRpc).chatgpt(
          {},
          { location, signal: controller.signal },
        )
        setChatGPT(usage)
      } catch {
        if (!controller.signal.aborted) {
          setChatGPT(errorUsage("Could not load OpenAI limits."))
        }
      }
    }

    const refresh = async () => {
      if (refreshing || controller.signal.aborted) return
      refreshing = true
      await Promise.allSettled([loadGo(), loadChatGPT()])
      refreshing = false
    }

    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
    const stopUsageEvents = context.data.on("session.usage.updated", () => void refresh())
    const unregister = context.ui.slot({
      append: "sidebar.content",
      render: () => (
        <box flexDirection="column">
          <text>Usage limits</text>
          <ProviderUsage title="OpenCode Go" usage={go()} />
          <ProviderUsage title="OpenAI" usage={chatgpt()} />
        </box>
      ),
    })

    return () => {
      clearInterval(timer)
      stopUsageEvents()
      unregister()
      controller.abort()
    }
  },
})
