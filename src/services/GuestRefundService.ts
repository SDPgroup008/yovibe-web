async function call(body: Record<string, unknown>) {
  const response = await fetch('/.netlify/functions/guest-refund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Refund request failed')
  return payload as { message: string; reference?: string }
}

export default {
  requestAccess(ticketRef: string, email: string) {
    return call({ action: 'request_link', ticketRef, email })
  },
  submit(token: string, note?: string) {
    return call({ action: 'submit', token, note })
  },
}
