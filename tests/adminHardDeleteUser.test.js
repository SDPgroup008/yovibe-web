const {
  isAdmin,
  hasDeleteConfirmation,
  isMissingRelation,
  isAuthUserMissing,
  preflightResponse,
} = require('../netlify/functions/admin-hard-delete-user');

describe('administrator hard-delete safeguards', () => {
  test('accepts only administrator profiles', () => {
    expect(isAdmin({ user_type: 'admin' })).toBe(true);
    expect(isAdmin({ user_type: 'regular_user' })).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  test('requires the exact permanent-delete confirmation phrase', () => {
    expect(hasDeleteConfirmation('DELETE')).toBe(true);
    expect(hasDeleteConfirmation(' delete ')).toBe(false);
    expect(hasDeleteConfirmation('')).toBe(false);
  });

  test('recognises missing migration relations without masking other errors', () => {
    expect(isMissingRelation({ code: '42P01' })).toBe(true);
    expect(isMissingRelation({ code: 'PGRST205' })).toBe(true);
    expect(isMissingRelation({ code: '42501', message: 'permission denied' })).toBe(false);
  });

  test('treats a missing Auth user as a retryable cleanup state', () => {
    expect(isAuthUserMissing({ status: 404 })).toBe(true);
    expect(isAuthUserMissing({ message: 'User not found' })).toBe(true);
    expect(isAuthUserMissing({ status: 500, message: 'provider unavailable' })).toBe(false);
  });

  test('returns only safe preflight fields to the browser', () => {
    expect(preflightResponse({
      canHardDelete: false,
      authExists: true,
      blockers: [{ key: 'tickets', label: 'Ticket purchase records', count: 1 }],
    })).toEqual({
      canHardDelete: false,
      authAlreadyDeleted: false,
      blockers: [{ key: 'tickets', label: 'Ticket purchase records', count: 1 }],
    });
  });
});
