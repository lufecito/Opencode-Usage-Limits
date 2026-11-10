import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  GREEN,
  OPENAI_HEADING_COLOR,
  RED,
  YELLOW,
  GO_HEADING_COLOR,
  usageColor,
} from "../src/color.ts"

describe("usageColor", () => {
  it("is green from 70% to 100%", () => {
    for (const value of [70, 71, 85, 99.9, 100]) {
      assert.equal(usageColor(value), GREEN, String(value))
    }
  })

  it("is yellow from 30% to 69%", () => {
    for (const value of [30, 31, 50, 68, 69, 69.9]) {
      assert.equal(usageColor(value), YELLOW, String(value))
    }
  })

  it("is red below 30%", () => {
    for (const value of [0, 1, 15, 28, 29, 29.9]) {
      assert.equal(usageColor(value), RED, String(value))
    }
  })
})

describe("headings", () => {
  it("colors OpenCode Go yellow and OpenAI green", () => {
    assert.equal(GO_HEADING_COLOR, YELLOW)
    assert.equal(OPENAI_HEADING_COLOR, GREEN)
  })
})
