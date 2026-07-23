export function deriveTicketRef(ticketId: string, isTableEntry: boolean): string {
  const prefix = isTableEntry ? 'YVT' : 'YV';

  // Old format: ticket_{timestamp}_{random}
  const parts = ticketId.split('_');
  if (parts.length === 3) {
    const [, timestamp, randomStr] = parts;
    if (timestamp.length >= 9 && randomStr.length >= 6) {
      const fifthDigit = timestamp[4];
      const ninthDigit = timestamp[8];
      const midStart = Math.floor((randomStr.length - 3) / 2);
      const middleThree = randomStr.substring(midStart, midStart + 3);
      return `${prefix}-${fifthDigit}${ninthDigit}-${middleThree}`;
    }
  }

  // New format: UUIDv4 (f1b2afb7-be0c-4c36-bdf8-d1e15d8f67a6)
  const clean = ticketId.replace(/-/g, '');
  if (clean.length >= 17) {
    const a = clean[5];
    const b = clean[9];
    const c = clean.substring(14, 17);
    return `${prefix}-${a}${b}-${c}`;
  }

  throw new Error(`Unexpected ticket ID format, cannot derive ticket_ref: ${ticketId}`);
}
