import { describe, expect, test } from "bun:test"
import { decodeDataUrl, isEmptyDataUrl } from "../../src/util/data-url"

describe("isEmptyDataUrl", () => {
  test("detects empty base64 payload", () => {
    expect(isEmptyDataUrl("data:image/jpeg;base64,")).toBe(true)
  })

  test("detects empty plain payload", () => {
    expect(isEmptyDataUrl("data:text/plain,")).toBe(true)
  })

  test("detects missing comma", () => {
    expect(isEmptyDataUrl("data:image/png")).toBe(true)
  })

  test("rejects non-empty payloads", () => {
    expect(isEmptyDataUrl("data:image/png;base64,iVBOR")).toBe(false)
    expect(isEmptyDataUrl("data:text/plain,hello")).toBe(false)
  })

  test("ignores non-data URLs", () => {
    expect(isEmptyDataUrl("https://example.com/a.png")).toBe(false)
  })
})

describe("decodeDataUrl", () => {
  test("decodes base64 data URLs", () => {
    const body = '{\n  "ok": true\n}\n'
    const url = `data:text/plain;base64,${Buffer.from(body).toString("base64")}`
    expect(decodeDataUrl(url)).toBe(body)
  })

  test("decodes plain data URLs", () => {
    expect(decodeDataUrl("data:text/plain,hello%20world")).toBe("hello world")
  })
})
