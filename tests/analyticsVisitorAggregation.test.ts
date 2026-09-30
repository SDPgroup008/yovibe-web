import { aggregateVisitorSessions, VisitorSessionRow } from '../src/services/AnalyticsService';

const row = (start_time: string, unique_visitor_id: string | null): VisitorSessionRow => ({ start_time, unique_visitor_id });

describe('aggregateVisitorSessions', () => {
  it('counts sessions at the start boundary and excludes invalid buckets', () => {
    const rows = [
      row('2026-01-01T00:00:00.000Z', 'new-visitor'),
      row('2026-01-01T23:59:59.999Z', 'returning-visitor'),
      row('2026-01-02T00:00:00.000Z', 'outside-range'),
    ];

    const result = aggregateVisitorSessions(rows, new Set(['returning-visitor']), 1, (date) => date.getUTCDate() - 1);

    expect(result[0]).toEqual({ sessions: 2, newUsers: 1, returningUsers: 1 });
  });

  it('counts one visitor once per bucket and classifies later-bucket visits as returning', () => {
    const rows = [
      row('2026-01-01T08:00:00.000Z', 'repeat-visitor'),
      row('2026-01-01T09:00:00.000Z', 'repeat-visitor'),
      row('2026-01-02T08:00:00.000Z', 'repeat-visitor'),
    ];

    const result = aggregateVisitorSessions(rows, new Set(), 2, (date) => date.getUTCDate() - 1);

    expect(result[0]).toEqual({ sessions: 2, newUsers: 1, returningUsers: 0 });
    expect(result[1]).toEqual({ sessions: 1, newUsers: 0, returningUsers: 1 });
  });

  it('classifies visitors already seen before a year or decade as returning', () => {
    const rows = [
      row('2024-02-01T12:00:00.000Z', 'historic-visitor'),
      row('2025-02-01T12:00:00.000Z', 'new-visitor'),
    ];

    const result = aggregateVisitorSessions(rows, new Set(['historic-visitor']), 2, (date) => date.getUTCFullYear() - 2024);

    expect(result[0].returningUsers).toBe(1);
    expect(result[0].newUsers).toBe(0);
    expect(result[1].newUsers).toBe(1);
  });

  it('classifies a visitor as returning in a later month or year of the same range', () => {
    const rows = [
      row('2026-01-15T12:00:00.000Z', 'repeat-visitor'),
      row('2026-02-15T12:00:00.000Z', 'repeat-visitor'),
      row('2027-01-15T12:00:00.000Z', 'repeat-visitor'),
    ];

    const monthly = aggregateVisitorSessions(rows.slice(0, 2), new Set(), 12, (date) => date.getUTCMonth());
    const yearly = aggregateVisitorSessions(rows, new Set(), 10, (date) => date.getUTCFullYear() - 2026);

    expect(monthly[0]).toEqual({ sessions: 1, newUsers: 1, returningUsers: 0 });
    expect(monthly[1]).toEqual({ sessions: 1, newUsers: 0, returningUsers: 1 });
    expect(yearly[0]).toEqual({ sessions: 2, newUsers: 1, returningUsers: 0 });
    expect(yearly[1]).toEqual({ sessions: 1, newUsers: 0, returningUsers: 1 });
  });

  it('handles more than one page of rows without changing classification semantics', () => {
    const rows = Array.from({ length: 1001 }, (_, index) => row(`2026-01-01T00:${String(index % 60).padStart(2, '0')}:00.000Z`, `visitor-${index}`));

    const result = aggregateVisitorSessions(rows, new Set(), 1, () => 0);

    expect(result[0].sessions).toBe(1001);
    expect(result[0].newUsers).toBe(1001);
    expect(result[0].returningUsers).toBe(0);
  });
});
