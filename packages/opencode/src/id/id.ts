import z from "zod"
import { randomBytes } from "crypto"

const prefixes = {
  event: "evt",
  session: "ses",
  message: "msg",
  permission: "per",
  question: "que",
  user: "usr",
  part: "prt",
  pty: "pty",
  tool: "tool",
  workspace: "wrk",
  entry: "ent",
  account: "act",
} as const

export function schema(prefix: keyof typeof prefixes) {
  return z.string().startsWith(prefixes[prefix])
}

const LENGTH = 26

// State for monotonic ID generation
let lastTimestamp = 0
let counter = 0

/**
 * Legacy layout `ts * 0x1000 + counter` wraps every 2^36 ms (~2.18 years); it
 * wrapped on 2026-08-14T11:19:55Z, making new IDs sort below pre-wrap IDs and
 * breaking string-comparison logic (prompt loop, revert, fork).
 *
 * Modern layout: bit 47 = format flag, lower 47 bits =
 * `(ts - EPOCH) << 4 | counter`. Monotonic until ~year 2304, always sorts
 * above post-wrap legacy IDs, decodable unambiguously (see timestamp()).
 */
const EPOCH = 1767225600000 // Date.UTC(2026, 0, 1)
const FLAG = 1n << 47n
const MASK = FLAG - 1n

export function ascending(prefix: keyof typeof prefixes, given?: string) {
  return generateID(prefix, "ascending", given)
}

export function descending(prefix: keyof typeof prefixes, given?: string) {
  return generateID(prefix, "descending", given)
}

function generateID(prefix: keyof typeof prefixes, direction: "descending" | "ascending", given?: string): string {
  if (!given) {
    return create(prefixes[prefix], direction)
  }

  if (!given.startsWith(prefixes[prefix])) {
    throw new Error(`ID ${given} does not start with ${prefixes[prefix]}`)
  }
  return given
}

function randomBase62(length: number): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
  let result = ""
  const bytes = randomBytes(length)
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % 62]
  }
  return result
}

export function create(prefix: string, direction: "descending" | "ascending", timestamp?: number): string {
  const currentTimestamp = timestamp ?? Date.now()

  if (currentTimestamp > lastTimestamp) {
    lastTimestamp = currentTimestamp
    counter = 0
  }
  counter++

  const delta = BigInt(Math.max(currentTimestamp - EPOCH, 0))
  let now = FLAG | ((delta << BigInt(4)) | BigInt(counter))

  now = direction === "descending" ? ~now : now

  const timeBytes = Buffer.alloc(6)
  for (let i = 0; i < 6; i++) {
    timeBytes[i] = Number((now >> BigInt(40 - 8 * i)) & BigInt(0xff))
  }

  return prefix + "_" + timeBytes.toString("hex") + randomBase62(LENGTH - 12)
}

/** Extract timestamp from an ascending ID (modern or legacy layout). Does not work with descending IDs. */
export function timestamp(id: string): number {
  const prefix = id.split("_")[0]
  const hex = id.slice(prefix.length + 1, prefix.length + 13)
  const encoded = BigInt("0x" + hex)
  if (encoded & FLAG) {
    const modern = ((encoded & MASK) >> BigInt(4)) + BigInt(EPOCH)
    if (modern <= BigInt(Date.now()) + 86_400_000n) return Number(modern)
  }
  return Number(encoded >> BigInt(12))
}

export * as Identifier from "./id"
