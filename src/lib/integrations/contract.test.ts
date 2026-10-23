import { describe, expect, it } from 'vitest';
import { connectionState, type IntegrationConnection } from './contract';

const connection: IntegrationConnection = { id: 'local', name: 'Local', permission: 'read', token_prefix: 'mnv_local000', created_at: '2020-01-01T00:00:00Z', expires_at: null, revoked_at: null, last_used_at: null };

describe('personal connection lifetime', () => {
  it('keeps explicit permanent access active regardless of age', () => {
    expect(connectionState(connection, Date.parse('2099-01-01T00:00:00Z'))).toBe('Activa');
  });
  it('revocation takes precedence over any expiration policy', () => {
    expect(connectionState({ ...connection, revoked_at: '2026-01-01T00:00:00Z' })).toBe('Revocada');
  });
  it('dated credentials still expire at the exact boundary', () => {
    const date = '2026-10-30T00:00:00Z';
    expect(connectionState({ ...connection, expires_at: date }, Date.parse(date) - 1)).toBe('Activa');
    expect(connectionState({ ...connection, expires_at: date }, Date.parse(date))).toBe('Caducada');
  });
});
