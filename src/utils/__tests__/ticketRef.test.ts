import { describe, it, expect } from "@jest/globals"
import { deriveTicketRef } from "../ticketRef"

describe("deriveTicketRef", () => {
  it("derives a ref from the legacy ticket_timestamp_random format", () => {
    // timestamp = "1620000000000" (13 digits), random = "123456" (6 chars)
    // fifthDigit = timestamp[4] = "0", ninthDigit = timestamp[8] = "0"
    // midStart = floor((6-3)/2) = 1, middleThree = random.substring(1,4) = "234"
    expect(deriveTicketRef("ticket_1620000000000_123456", false)).toBe("YV-00-234")
  })

  it("uses the YVT prefix for table entry tickets", () => {
    expect(deriveTicketRef("ticket_1620000000000_123456", true)).toBe("YVT-00-234")
  })

  it("derives a ref from a UUIDv4 ticket id", () => {
    const ref = deriveTicketRef("f1b2afb7-be0c-4c36-bdf8-d1e15d8f67a6", false)
    expect(ref).toMatch(/^YV-[a-z0-9]{2}-[a-z0-9]{3}$/)
  })

  it("throws for an unexpected ticket id format", () => {
    expect(() => deriveTicketRef("short", false)).toThrow()
  })
})
