import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { createFinancePostgres } from './helpers/finance-postgres';

const transport = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => transport }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => null }));
import { handleIntegrationApi } from '@/lib/integrations/server';

describe('HTTP contract → real financial PostgreSQL', () => {
  let db: PGlite;
  const owner = randomUUID(), gate = 'only-local-http-gateway-secret-more-than32', token = `mnv_httptest.${'T'.repeat(43)}`;
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  beforeAll(async () => {
    vi.stubEnv('MONEVA_INTEGRATION_GATEWAY_KEY', gate);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'local-publishable');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://moneva-three.vercel.app');
    db = await createFinancePostgres();
    await db.query("insert into private.access_allowlist(email,enabled,access_role) values('http-local@example.test',true,'member')");
    await db.query("insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,'http-local@example.test',now(),'{\"provider\":\"google\"}')", [owner]);
    await db.query("insert into auth.identities(user_id,provider) values($1,'google')", [owner]);
    await db.query('insert into private.integration_gateway_keys(key_hash) values($1)', [hash(gate)]);
    await db.query("insert into private.integration_connections(user_id,name,permission,token_hash,token_prefix,reset_generation,expires_at) values($1,'HTTP local','read',$2,'mnv_httptest',0,now()+interval '1 day')", [owner, hash(token)]);
    transport.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (!['integration_gateway_v1','integration_preview_v1','integration_schema_v1'].includes(name)) throw new Error('Not registered');
      const keys = Object.keys(args);
      try {
        const { rows } = await db.query<{ value: unknown }>(`select public.${name}(${keys.map((key, i) => `${key} := $${i + 1}${key === 'p_payload' ? '::jsonb' : '::text'}`).join(',')}) value`, keys.map((key) => key === 'p_payload' ? JSON.stringify(args[key]) : args[key]));
        return { data: rows[0].value, error: null };
      } catch (error) { return { data: null, error }; }
    });
  }, 120000);
  afterAll(async () => { await db.close(); vi.unstubAllEnvs(); });
  const request = (path: string, data?: unknown, authorization = `Bearer ${token}`, headers: Record<string, string> = {}) => handleIntegrationApi(new Request(`https://moneva-three.vercel.app/api/v1/${path}`, {
    method: data === undefined ? 'GET' : 'POST', headers: { authorization, ...(data === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, body: data === undefined ? undefined : JSON.stringify(data),
  }), path.split('/'));

  it('returns JSON 401, no login HTML and no redirect when no token is present', async () => {
    const response = await request('capabilities', undefined, '');
    expect(response.status).toBe(401); expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect((await response.json()).error.code).toBe('unauthorized');
  });
  it('loads eleven owner-scoped blocks in one database round trip', async () => {
    transport.rpc.mockClear();
    const response = await request('context', {});
    const body = await response.json();
    expect(response.status).toBe(200); expect(Object.keys(body.data)).toHaveLength(11);
    expect(transport.rpc).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(body)).not.toContain(token);
    expect(JSON.stringify(body)).not.toContain(gate);
  });
  it('marks transport contention retryable without claiming the operation was not committed', async () => {
    transport.rpc.mockResolvedValueOnce({ data: null, error: { code: '40P01', message: 'deadlock detected' } });
    const response = await request('capabilities');
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.error.code).toBe('unavailable');
    expect(body.error.retryable).toBe(true);
    expect(body).not.toHaveProperty('committed');
    expect(body.error.message).not.toContain('deadlock');
  });
  it('publishes a credential-free OpenAPI and a public guide from the registered catalogue', async () => {
    const response = await request('openapi.json', undefined, '');
    const schema = await response.json();
    expect(schema.openapi).toBe('3.1.0'); expect(schema.paths['/commands']).toBeDefined();
    const guide = await (await request('guide', undefined, '')).text();
    expect(guide).toContain('movement.record'); expect(guide).not.toContain(token); expect(guide).not.toContain(gate);
  });
  it('keeps the financial rules and rejects a read-only write without creating a receipt', async () => {
    const response = await request('commands', { operationId: randomUUID(), expectedRevision: '0', commands: [{ id: randomUUID(), action: 'account.create', data: { name: 'Forbidden', account_type: 'cash' } }] });
    expect(response.status).toBe(403); expect((await response.json()).committed).toBe(false);
    expect((await db.query('select * from private.integration_receipts')).rows).toHaveLength(0);
  });
  it('validates media type, bounded body, malformed schemas and unknown endpoints safely', async () => {
    expect((await request('query', {}, undefined, { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await request('query', { queries: [], [token]: true })).status).toBe(422);
    const large = await request('query', { content: 'x'.repeat(262145) }); expect(large.status).toBe(413);
    expect((await request('admin/users')).status).toBe(404);
  });
  it('runs the canonical simulator with read permission and no financial persistence', async () => {
    const response = await request('simulation', { month: '2026-10-01', incomeTarget: '1000000', mainCategories: [{ id: 'needs', group: 'needs', name: 'Necesidades', color: '#00ff00', icon: 'home', sortOrder: 0, included: true, targetPercent: 100 }], subcategories: [{ id: 'food', group: 'needs', name: 'Comida', color: '#00ff00', icon: 'home', sortOrder: 0, budget: 0, spent: 100000 }], automaticBudgets: true });
    expect(response.status).toBe(200); const body = await response.json();
    expect(body.data.persisted).toBe(false); expect(body.data.summary.budget).toBe(1000000);
    expect((await db.query('select * from public.budgets')).rows).toHaveLength(0);
  });
});
