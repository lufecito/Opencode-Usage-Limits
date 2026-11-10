import { Plugin } from "@opencode/plugin"
import { UsageLimitsRpc } from "./rpc.ts"
import { readActiveOpenAIUsage } from "./service.ts"

export default Plugin.define({
  id: "usage-limits",
  async setup(ctx) {
    const registration = await ctx.rpc.register(UsageLimitsRpc, {
      chatgpt: async (_input, call) =>
        readActiveOpenAIUsage({
          integration: ctx.integration,
          signal: call.signal,
        }),
    })

    return () => registration.dispose()
  },
})
