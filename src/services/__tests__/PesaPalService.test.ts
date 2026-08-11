import { describe, it, expect } from "@jest/globals"
import { PesaPalService } from "../PesaPalService"

describe("PesaPalService.calculateTicketPrice", () => {
  it("returns subtotal with no late fee before 7am on the event date", () => {
    const future = new Date("2099-01-01T20:00:00")
    const result = PesaPalService.calculateTicketPrice(10000, 2, future, 0)
    expect(result.subtotal).toBe(20000)
    expect(result.lateFee).toBe(0)
    expect(result.total).toBe(20000)
    expect(result.isLatePurchase).toBe(false)
  })

  it("applies the late fee after 7am on the event date", () => {
    const past = new Date("2020-01-01T20:00:00")
    const result = PesaPalService.calculateTicketPrice(10000, 1, past, 10)
    expect(result.subtotal).toBe(10000)
    expect(result.lateFee).toBe(1000) // 10% of 10000
    expect(result.total).toBe(11000)
    expect(result.isLatePurchase).toBe(true)
  })

  it("defaults the late fee to 0% when not provided", () => {
    const past = new Date("2020-01-01T20:00:00")
    const result = PesaPalService.calculateTicketPrice(5000, 1, past)
    expect(result.lateFee).toBe(0)
    expect(result.isLatePurchase).toBe(false)
    expect(result.total).toBe(5000)
  })
})

describe("PesaPalService.calculateRevenueSplit", () => {
  it("splits the 15% app commission from venue revenue", () => {
    const result = PesaPalService.calculateRevenueSplit(100000)
    expect(result.appCommission).toBe(15000)
    expect(result.venueRevenue).toBe(85000)
    expect(result.commissionRate).toBe(0.15)
  })
})
