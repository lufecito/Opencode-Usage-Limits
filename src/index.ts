import { Plugin } from "@opencode/plugin"
import { UsageLimitsRpc } from "./rpc.ts"
import { readActiveGoUsage } from "./service.ts"

export default Plugin.define({
  id: "usage-limits",
  async setup(ctx) {
    const registration = await ctx.rpc.register(UsageLimitsRpc, {
      go: async (_input, call) =>
        readActiveGoUsage({
          integration: ctx.integration,
          signal: call.signal,
        }),
    })

    return () => registration.dispose()
  },
})
