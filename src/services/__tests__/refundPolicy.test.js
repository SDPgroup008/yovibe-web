const {
  REFUND_REASONS,
  calculateRefundEligibility,
  reasonForEventStatus,
  signGuestRefundToken,
  ticketBelongsToUser,
  verifyGuestRefundToken,
} = require('../../../netlify/shared/refundPolicy')

function adminWith(ticket, event) {
  return {
    from(table) {
      const value = table === 'tickets' ? ticket : event
      return {
        select() { return this },
        eq() { return this },
        maybeSingle() { return Promise.resolve({ data: value, error: null }) },
      }
    },
  }
}

describe('refund authorization policy', () => {
  beforeEach(() => {
    process.env.REFUND_LINK_SECRET = 'test-refund-secret-that-is-at-least-thirty-two-bytes-long'
  })

  afterEach(() => {
    delete process.env.REFUND_LINK_SECRET
  })

  test('assigned tickets can be refunded only by their owning account', () => {
    const ticket = { buyer_id: 'owner-id', buyer_email: 'owner@example.com' }
    expect(ticketBelongsToUser(ticket, { id: 'owner-id', email: 'owner@example.com' }, null)).toBe(true)
    expect(ticketBelongsToUser(ticket, { id: 'attacker-id', email: 'owner@example.com' }, null)).toBe(false)
  })

  test('guest tickets can be recovered through the matching account email', () => {
    const ticket = { buyer_id: null, buyer_email: 'Guest@Example.com' }
    expect(ticketBelongsToUser(ticket, { id: 'new-account', email: 'guest@example.com' }, null)).toBe(true)
    expect(ticketBelongsToUser(ticket, { id: 'new-account', email: 'other@example.com' }, null)).toBe(false)
  })

  test('magic links are signed, scoped, expiring, and reject tampering', () => {
    const token = signGuestRefundToken({ ticketId: 'ticket-1', email: 'guest@example.com', nowSeconds: 1000 })
    expect(verifyGuestRefundToken(token, 1500)).toMatchObject({ ticketId: 'ticket-1', email: 'guest@example.com' })
    expect(() => verifyGuestRefundToken(`${token}x`, 1500)).toThrow('Invalid or expired refund link')
    expect(() => verifyGuestRefundToken(token, 1901)).toThrow('Invalid or expired refund link')
  })

  test('only cancelled and postponed event states map to buyer refund reasons', () => {
    expect(reasonForEventStatus('cancelled')).toBe(REFUND_REASONS.cancelled)
    expect(reasonForEventStatus('POSTPONED')).toBe(REFUND_REASONS.postponed)
    expect(reasonForEventStatus('active')).toBeNull()
    expect(reasonForEventStatus('completed')).toBeNull()
  })

  test('eligibility is calculated by the server for a paid cancelled-event ticket', async () => {
    const ticket = { id: 'ticket-1', event_slug: 'event-1', status: 'active', payment_status: 'completed', total_amount: 115000, gateway_fee: 3000 }
    const event = { slug: 'event-1', event_status: 'cancelled' }
    const result = await calculateRefundEligibility(adminWith(ticket, event), ticket.id, REFUND_REASONS.cancelled)
    expect(result.amount).toBe(112000)
  })

  test('normal events and unpaid tickets cannot enter the refund workflow', async () => {
    const baseTicket = { id: 'ticket-1', event_slug: 'event-1', status: 'active', payment_status: 'completed', total_amount: 115000, gateway_fee: 3000 }
    await expect(calculateRefundEligibility(
      adminWith(baseTicket, { slug: 'event-1', event_status: 'active' }),
      baseTicket.id,
      REFUND_REASONS.cancelled,
    )).rejects.toMatchObject({ statusCode: 422 })
    await expect(calculateRefundEligibility(
      adminWith({ ...baseTicket, payment_status: 'pending' }, { slug: 'event-1', event_status: 'cancelled' }),
      baseTicket.id,
      REFUND_REASONS.cancelled,
    )).rejects.toMatchObject({ statusCode: 422 })
  })
})
