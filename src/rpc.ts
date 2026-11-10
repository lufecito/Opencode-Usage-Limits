import { Rpc } from "@opencode/plugin/rpc"

const windowSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    usedPercent: { type: "number", minimum: 0, maximum: 100 },
    limited: { type: "boolean" },
    resetsAt: {
      anyOf: [{ type: "number" }, { type: "null" }],
    },
  },
  required: ["id", "label", "usedPercent", "limited", "resetsAt"],
  additionalProperties: false,
} as const

const outputSchema = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["loading", "ready", "unavailable", "error"],
    },
    message: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    windows: {
      type: "array",
      items: windowSchema,
    },
  },
  required: ["status", "message", "windows"],
  additionalProperties: false,
} as const

export const UsageLimitsRpc = Rpc.define({
  id: "usage-limits",
  methods: {
    chatgpt: {
      input: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      output: outputSchema,
    },
  },
  events: {},
})
