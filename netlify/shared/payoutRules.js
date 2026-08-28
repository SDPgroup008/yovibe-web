// netlify/shared/payoutRules.js
//
// Dependency-free payout eligibility rule (Phase 3, 3.2), extracted so it can
// be unit-tested under jest and shared by payout.js.

function ticketIsPayable(t) {
  const refundState = t.refund_status || 'none';
  return (
    t.payout_eligible === true &&
    (t.payout_status || 'pending') === 'pending' &&
    refundState === 'none' &&
    (t.status === 'active' || t.status === 'used')
  );
}

module.exports = { ticketIsPayable };
