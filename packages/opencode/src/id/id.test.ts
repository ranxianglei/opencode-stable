import { describe, expect, test } from "bun:test"
import { Identifier } from "./id"

const PRE_WRAP_ID = "msg_fffff8d5c0016vB2k8jqfCYsy" // last legacy ID before the 2026-08-14 wrap
const POST_WRAP_ID = "msg_00001ef0b00106PW23ewywTG" // first legacy ID after the wrap

describe("identifier", () => {
  test("round-trips timestamp through create/timestamp", () => {
    const ts = Date.now()
    const id = Identifier.create("msg", "ascending", ts)
    expect(Identifier.timestamp(id)).toBe(ts)
  })

  test("produces lexicographically ascending IDs", () => {
    const first = Identifier.ascending("message")
    const second = Identifier.ascending("message")
    expect(first < second).toBe(true)
  })

  test("new IDs sort above all post-wrap legacy IDs", () => {
    const id = Identifier.ascending("message")
    expect(id > POST_WRAP_ID).toBe(true)
  })

  test("decodes legacy pre-wrap and post-wrap IDs", () => {
    // Legacy decode returns cycle-relative time (pre-existing behavior); the
    // sanity fallback must kick in for the pre-wrap ID so it is not decoded
    // as a far-future "modern" timestamp.
    expect(Identifier.timestamp(PRE_WRAP_ID)).toBeLessThanOrEqual(Date.now() + 86_400_000)
    expect(Identifier.timestamp(POST_WRAP_ID)).toBeGreaterThanOrEqual(0)
  })

  test("stays monotonic across clock going backwards past epoch", () => {
    const before = Identifier.ascending("message")
    const clamped = Identifier.create("msg", "ascending", 0)
    expect(clamped.startsWith("msg_8000")).toBe(true)
    expect(before < Identifier.ascending("message")).toBe(true)
  })
})
