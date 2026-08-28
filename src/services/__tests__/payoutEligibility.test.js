// Phase 3 (3.2): payout eligibility rule — dependency-free so jest can load it.
const { ticketIsPayable } = require("../../../netlify/shared/payoutRules");

function ticket(overrides = {}) {
  return {
    payout_eligible: true,
    payout_status: "pending",
    refund_status: "none",
    status: "used",
    ...overrides,
  };
}

describe("payout eligibility (Phase 3, 3.2)", () => {
  it("accepts a used, refund-free, pending ticket", () => {
    expect(ticketIsPayable(ticket())).toBe(true);
  });

  it("rejects refunded tickets", () => {
    expect(ticketIsPayable(ticket({ refund_status: "completed", status: "refunded" }))).toBe(false);
  });

  it("rejects tickets with an in-flight refund", () => {
    expect(ticketIsPayable(ticket({ refund_status: "processing" }))).toBe(false);
    expect(ticketIsPayable(ticket({ refund_status: "approved" }))).toBe(false);
  });

  it("rejects already-paid or processing payouts", () => {
    expect(ticketIsPayable(ticket({ payout_status: "paid" }))).toBe(false);
    expect(ticketIsPayable(ticket({ payout_status: "processing" }))).toBe(false);
  });

  it("rejects tickets not yet payout-eligible", () => {
    expect(ticketIsPayable(ticket({ payout_eligible: false }))).toBe(false);
    expect(ticketIsPayable(ticket({ status: "active" }))).toBe(true);
    expect(ticketIsPayable(ticket({ status: "cancelled" }))).toBe(false);
  });
});
