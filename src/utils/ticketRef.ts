export function deriveTicketRef(ticketId: string, isTableEntry: boolean): string {
  const parts = ticketId.split('_');
  if (parts.length !== 3) {
    throw new Error(`Unexpected ticket ID format, cannot derive ticket_ref: ${ticketId}`);
  }
  const [, timestamp, randomStr] = parts;

  if (timestamp.length < 9) {
    throw new Error(`Timestamp portion too short to derive ticket_ref: ${timestamp}`);
  }
  if (randomStr.length < 6) {
    throw new Error(`Random portion too short to derive middle-3 ticket_ref segment: ${randomStr}`);
  }

  const fifthDigit = timestamp[4];
  const ninthDigit = timestamp[8];

  const midStart = Math.floor((randomStr.length - 3) / 2);
  const middleThree = randomStr.substring(midStart, midStart + 3);

  const prefix = isTableEntry ? 'YVT' : 'YV';
  return `${prefix}-${fifthDigit}${ninthDigit}-${middleThree}`;
}