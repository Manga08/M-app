import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createFinancePostgres } from "./helpers/finance-postgres";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

describe("integration PostgreSQL boundary", () => {
  let db: PGlite;
  const owner = randomUUID();
  const other = randomUUID();
  const gateway = "integration-local-test-gateway-at-least-32-characters";
  const tokens = { read: `mnv_readtest.${"A".repeat(43)}`, write: `mnv_writetest.${"B".repeat(43)}`, full: `mnv_fulltest.${"C".repeat(43)}` };
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const query = async (sql: string, args: unknown[] = []) => (await db.query<{ value: Record<string, unknown> }>(sql, args)).rows[0]?.value;
  const call = async (mode: string, payload: unknown = {}, token = tokens.full) => {
    const result = await query("select public.integration_gateway_v1($1,$2,$3,$4::jsonb) value", [gateway, hash(token), mode, JSON.stringify(payload)]);
    if (result?.error) throw new Error((result.error as { message: string }).message);
    return result;
  };
  const revision = async () => String((await call("capabilities"))!.revision);
  let account: string;
  let category: string;
  beforeAll(async () => {
    db = await createFinancePostgres();
    await db.query("insert into private.integration_gateway_keys(key_hash) values($1)", [hash(gateway)]);
    for (const [id, email] of [[owner, "integration-owner@example.test"], [other, "integration-other@example.test"]]) {
      await db.query("insert into private.access_allowlist(email,enabled,access_role) values($1,true,'member')", [email]);
      await db.query("insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3::jsonb)", [id, email, JSON.stringify({ provider: "google", providers: ["google"] })]);
      await db.query("insert into auth.identities(user_id,provider) values($1,'google')", [id]);
    }
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [owner, JSON.stringify({ sub: owner, role: "authenticated", amr: [{ method: "oauth", timestamp: Math.floor(Date.now() / 1000) }] })]);
    for (const [permission, token] of Object.entries(tokens)) {
      await query("select public.manage_integration_connections('create',$1::jsonb) value", [JSON.stringify({ name: `Local ${permission}`, permission, hash: hash(token), prefix: token.split(".")[0], expiresAt: new Date(Date.now() + 86400000).toISOString() })]);
    }
    account = (await db.query<{ id: string }>("select id from public.accounts where user_id=$1", [owner])).rows[0].id;
    category = (await db.query<{ id: string }>("select id from public.categories where user_id=$1 and transaction_kind='expense' limit 1", [owner])).rows[0].id;
  }, 120_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.query('delete from private.integration_usage'); });
  it("applies every financial migration locally", async () => {
    const result = await db.query<{ count: number }>("select count(*)::int count from private.integration_operations");
    expect(result.rows[0].count).toBeGreaterThan(25);
  });
  it("requires a dedicated gateway secret, not just a public Supabase key", async () => {
    await expect(query("select public.integration_gateway_v1('wrong',$1,'capabilities','{}') value", [tokens.read])).rejects.toThrow("no autorizada");
  });
  it("returns compact, owner-isolated context without financial writes", async () => {
    const before = (await db.query<{ count: string }>("select count(*) count from public.audit_events")).rows[0].count;
    const result = await call("context", { include: ["profile", "summary", "accounts", "entities", "categories", "distribution", "budget", "targets", "scheduled", "liabilities", "cards"] }, tokens.read);
    const data = result!.data as { accounts: { items: Array<{ id: string; user_id?: string }> } };
    expect(data.accounts.items).toHaveLength(1);
    expect(data.accounts.items[0].id).toBe(account);
    expect(data.accounts.items[0].user_id).toBeUndefined();
    expect((result!.operations as Array<{ permission: string }>).every((op) => op.permission === "read")).toBe(true);
    expect((await db.query<{ count: string }>("select count(*) count from public.audit_events")).rows[0].count).toBe(before);
  });
  it("rejects writes with read-only credentials", async () => {
    await expect(call("commands", { operationId: randomUUID(), expectedRevision: await revision(), commands: [{ id: randomUUID(), action: "movement.record", data: { kind: "expense", account_id: account, category_id: category, amount: "25000", description: "Local", occurred_on: "2026-10-21" } }] }, tokens.read)).rejects.toThrow("solo lectura");
  });
  it("records an expense atomically and replays the exact receipt", async () => {
    const id = randomUUID();
    const payload = { operationId: randomUUID(), expectedRevision: await revision(), commands: [{ id, action: "movement.record", data: { kind: "expense", account_id: account, category_id: category, amount: "25000", description: "Local", occurred_on: "2026-10-21" } }] };
    expect((await call("commands", payload, tokens.write))!.committed).toBe(true);
    expect((await call("commands", payload, tokens.write))!.replayed).toBe(true);
    expect((await db.query<{ count: number }>("select count(*)::int count from public.transactions where id=$1", [id])).rows[0].count).toBe(1);
    await expect(call("commands", { ...payload, commands: [{ ...payload.commands[0], data: { ...payload.commands[0].data, amount: "26000" } }] }, tokens.write)).rejects.toThrow("otro contenido");
  });
  it("rejects stale revisions and rolls back the entire batch on an invalid command", async () => {
    await expect(call("commands", { operationId: randomUUID(), expectedRevision: "0", commands: [{ id: randomUUID(), action: "account.create", data: { name: "Old", account_type: "cash" } }] })).rejects.toThrow("cambiaron");
    const id = randomUUID();
    await expect(call("commands", { operationId: randomUUID(), expectedRevision: await revision(), commands: [
      { id: randomUUID(), action: "account.create", data: { id, name: "Must rollback", account_type: "cash" } },
      { id: randomUUID(), action: "arbitrary.sql", data: {} },
    ] })).rejects.toThrow("no existe");
    expect((await db.query<{ count: number }>("select count(*)::int count from public.accounts where id=$1", [id])).rows[0].count).toBe(0);
  });
  it("enforces destructive permissions inside the dispatcher", async () => {
    await expect(call("commands", { operationId: randomUUID(), expectedRevision: await revision(), commands: [{ id: randomUUID(), action: "account.archive", data: { account_id: account, expected_version: 1 } }] }, tokens.write)).rejects.toThrow("acceso total");
    await expect(call("commands", { operationId: randomUUID(), expectedRevision: await revision(), commands: [{ id: randomUUID(), action: "liability.save", data: { account: { id: account }, liability: { status: "archived" } } }] }, tokens.write)).rejects.toThrow("acceso total");
  });
  it("rejects a foreign account even through the privileged gateway", async () => {
    const foreign = (await db.query<{ id: string }>("select id from public.accounts where user_id=$1", [other])).rows[0].id;
    await expect(call("commands", { operationId: randomUUID(), expectedRevision: await revision(), commands: [{ id: randomUUID(), action: "movement.record", data: { kind: "expense", account_id: foreign, category_id: category, amount: "1", description: "No", occurred_on: "2026-10-21" } }] })).rejects.toThrow("cuenta activa propia");
  });
  it("a preview runs the real financial constraints without preserving writes", async () => {
    const id = randomUUID();
    const result = await query("select public.integration_preview_v1($1,$2,$3::jsonb) value", [gateway, hash(tokens.write), JSON.stringify({ operationId: randomUUID(), expectedRevision: await revision(), commands: [{ id: randomUUID(), action: "account.create", data: { id, name: "Preview", account_type: "cash" } }] })]);
    expect(result!.committed).toBe(false);
    expect(result!.preview).toBe(true);
    expect((await db.query<{ count: number }>("select count(*)::int count from public.accounts where id=$1", [id])).rows[0].count).toBe(0);
    expect((await db.query<{ count: number }>('select count(*)::int count from private.integration_usage')).rows[0].count).toBe(1);
  });

  const command = async (action: string, data: unknown, token = tokens.full) => call('commands', {
    operationId: randomUUID(), expectedRevision: await revision(), commands: [{ id: randomUUID(), action, data }],
  }, token);

  it('never grants private table access or invokes an arbitrary routine', async () => {
    const grants = await db.query<{ ok: boolean }>(`select has_table_privilege('anon','private.integration_connections','select') or has_table_privilege('authenticated','private.integration_connections','select') or has_function_privilege('anon','private.integration_execute(text,text,text,jsonb)','execute') ok`);
    expect(grants.rows[0].ok).toBe(false);
    await expect(command('manage_integration_connections', {})).rejects.toThrow('no existe');
    await expect(command('account.create', { name: 'Foreign owner', user_id: other, account_type: 'cash' })).rejects.toThrow('protegido');
    await expect(command('category.save', { id: randomUUID(), name: 'Test', group: 'needs', color: '#123456', icon: 'tag', user_id: other })).rejects.toThrow('protegido');
  });

  it('rejects revoked, expired, reset-generation and disabled-owner capabilities immediately', async () => {
    await db.query('begin');
    try {
      await db.query('update private.integration_connections set revoked_at=now() where token_hash=$1', [hash(tokens.read)]);
      await expect(call('context', {}, tokens.read)).rejects.toThrow('revocado');
    } finally { await db.query('rollback'); }
    await db.query('begin');
    try {
      await db.query("update private.integration_connections set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where token_hash=$1", [hash(tokens.read)]);
      await expect(call('context', {}, tokens.read)).rejects.toThrow('caducó');
    } finally { await db.query('rollback'); }
    await db.query('begin');
    try {
      await db.query('update public.profiles set financial_reset_generation=financial_reset_generation+1 where id=$1', [owner]);
      await expect(call('context', {}, tokens.read)).rejects.toThrow('reiniciada');
    } finally { await db.query('rollback'); }
    await db.query('begin');
    try {
      await db.query("update private.access_allowlist set enabled=false where email='integration-owner@example.test'");
      await expect(call('context', {}, tokens.read)).rejects.toThrow('deshabilitado');
    } finally { await db.query('rollback'); }
  });

  it('requires recent Google authentication and never returns token hashes', async () => {
    const rows = await query("select public.manage_integration_connections('list','{}') value");
    expect(JSON.stringify(rows)).not.toContain('token_hash');
    const previous = (await db.query<{ claims: string }>("select current_setting('request.jwt.claims') claims")).rows[0].claims;
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: owner, amr: [{ timestamp: 1 }] })]);
    try { await expect(query("select public.manage_integration_connections('create','{}') value")).rejects.toThrow('verificar'); }
    finally { await db.query("select set_config('request.jwt.claims',$1,false)", [previous]); }
  });

  it('counts failed commands and previews; enforces a shared quota across tokens', async () => {
    await expect(command('arbitrary.sql', {})).rejects.toThrow('no existe');
    expect((await db.query<{ units: number }>('select units from private.integration_usage')).rows[0].units).toBe(6);
    await db.query('update private.integration_usage set requests=120');
    await expect(call('capabilities', {}, tokens.read)).rejects.toThrow('cuota');
    await expect(call('capabilities', {}, tokens.write)).rejects.toThrow('cuota');
  });

  it('protects stale web/offline changes after an agent commits without blocking a fresh edit', async () => {
    const external = (await db.query<{ revision: string }>('select external_revision::text revision from private.finance_revisions where user_id=$1', [owner])).rows[0].revision;
    await db.query('set role authenticated');
    try {
      await db.query("select set_config('request.headers','{}',false)");
      await expect(db.query('update public.accounts set name=name where id=$1', [account])).rejects.toThrow('asistente modificó');
      await db.query("select set_config('request.headers',$1,false)", [JSON.stringify({ 'x-moneva-external-revision': external })]);
      await db.query('update public.accounts set name=name where id=$1', [account]);
    } finally { await db.query('reset role'); await db.query("select set_config('request.headers','{}',false)"); }
  });

  it.each(['COP-USD', 'USD-COP', 'USD-USD', 'COP-COP'])('keeps both sides and exact historical COP value in %s', async (pair) => {
    const [from, to] = pair.split('-');
    const source = randomUUID(), destination = randomUUID();
    for (const [id, currency] of [[source, from], [destination, to]]) await command('account.create', {
      id, name: `Local ${currency}`, account_type: 'cash', currency_code: currency, opening_exchange_rate: currency === 'USD' ? '4000' : '1',
    });
    const isMixed = from !== to;
    const amount = from === 'USD' ? '12.50' : '50000';
    const received = to === 'USD' ? '12.50' : '50000';
    const result = await command('movement.record', { kind: 'transfer', account_id: source, destination_account_id: destination,
      amount, ...(isMixed ? { destination_amount: received } : {}), exchange_rate: '4000', description: 'FX local', occurred_on: '2026-10-21' });
    const rows = ((result!.results as Array<{ data: { movements: Array<{ base_amount: string; amount: string }> } }>)[0].data.movements);
    expect(rows).toHaveLength(2);
    expect(rows[0].base_amount).toBe(rows[1].base_amount);
    expect(rows[0].amount).toBe(from === 'USD' ? '12.50' : '50000');
  });

  it('rejects missing rates, invalid currency precision and archived accounts', async () => {
    const usd = randomUUID();
    await command('account.create', { id: usd, name: 'USD', account_type: 'cash', currency_code: 'USD', opening_exchange_rate: '4000' });
    await expect(command('movement.record', { kind: 'expense', account_id: usd, category_id: category, amount: '10', description: 'USD', occurred_on: '2026-10-21' })).rejects.toThrow();
    await expect(command('movement.record', { kind: 'expense', account_id: usd, category_id: category, amount: '10.001', exchange_rate: '4000', description: 'USD', occurred_on: '2026-10-21' })).rejects.toThrow('precisión');
    await db.query('update public.accounts set archived=true,archived_at=now() where id=$1', [usd]);
    await expect(command('movement.record', { kind: 'expense', account_id: usd, category_id: category, amount: '10', exchange_rate: '4000', description: 'USD', occurred_on: '2026-10-21' })).rejects.toThrow('activa');
  });

  it('preserves huge monetary decimals as strings, not rounded JavaScript numbers', async () => {
    const result = await query("select private.integration_json('{\"amount\":90000000000000.01,\"nested\":[0.01,123]}'::jsonb) value");
    expect(result).toEqual({ amount: '90000000000000.01', nested: ['0.01', '123'] });
  });

  it('writes a real optional budget without changing distribution or inventing income', async () => {
    await command('budget.set', { month: '2026-10-01', income_target: '4000000', source: 'manual', budgets: [{ id: randomUUID(), category_id: category, amount: '750000' }] });
    const result = await call('query', { queries: [{ id: 'budget', action: 'budget', data: { month: '2026-10-01' } }] });
    expect(JSON.stringify(result)).toContain('750000');
    expect((await db.query<{ count: number }>('select count(*)::int count from public.group_allocations where user_id=$1 and included_in_plan', [owner])).rows[0].count).toBe(0);
  });

  it('supports targets, manual contributions and full-only contribution deletion', async () => {
    const targetId = randomUUID(), entryId = randomUUID();
    await command('target.save', { target: { id: targetId, title: 'Viaje local', mode: 'accumulate', kind: 'savings', status: 'active', target_amount: '1000000', initial_progress: '0', starts_on: '2026-10-01', color: '#22aa66', icon: 'plane', tracking_mode: 'manual' } });
    await command('target-entry.save', { id: entryId, target_id: targetId, kind: 'contribution', effect: 'advance', amount: '50000', occurred_on: '2026-10-21' });
    const progress = (await db.query<{ amount: string }>('select progress_amount::text amount from public.financial_target_overview where id=$1', [targetId])).rows[0].amount;
    expect(Number(progress)).toBe(50000);
    await expect(command('target-entry.delete', { id: entryId }, tokens.write)).rejects.toThrow('acceso total');
    await command('target-entry.delete', { id: entryId });
    expect((await db.query('select id from public.financial_target_entries where id=$1', [entryId])).rows).toHaveLength(0);
  });

  it('creates a card and a financed purchase without duplicating the expense', async () => {
    const card = randomUUID(), transaction = randomUUID();
    await command('card.save', { account: { id: card, name: 'Tarjeta local', currency_code: 'COP', opening_debt: '0', opening_balance_date: '2026-10-01', color: '#123456', icon: 'credit-card' }, card: { network: 'visa', last_four: '1234', credit_limit: '5000000', cutoff_day: 20, due_day: 5, annual_fee: '0' } });
    await command('card.purchase', {
      transaction: { id: transaction, account_id: card, category_id: category, kind: 'expense', amount: '90000', native_currency_code: 'COP', base_currency_code: 'COP', base_amount: '90000', exchange_rate: '1', exchange_rate_date: '2026-10-21', exchange_rate_source: 'same_currency', description: 'Compra local', occurred_on: '2026-10-21' },
      plan: { id: randomUUID(), installment_count: 1, financing_type: 'no_interest', first_due_on: '2026-11-05' },
      installments: [{ id: randomUUID(), installment_number: 1, due_on: '2026-11-05', principal: '90000', estimated_interest: '0', estimated_fee: '0' }],
    });
    const total = (await db.query<{ amount: string }>("select sum(amount)::text amount from public.transactions where account_id=$1 and kind='expense'", [card])).rows[0].amount;
    expect(Number(total)).toBe(90000);
    expect((await db.query('select id from public.credit_card_installments where user_id=$1', [owner])).rows).toHaveLength(1);
  });

  it('creates a native debt with canonical ownership and no duplicate account cash', async () => {
    const debt = randomUUID();
    await command('liability.save', { account: { id: debt, name: 'Préstamo local', currency_code: 'COP', opening_debt: '800000', opening_balance_date: '2026-10-01', color: '#123456', icon: 'bank' }, liability: { account_id: debt, kind: 'personal_debt', status: 'active', creditor_name: 'Persona de prueba' } });
    expect(Number((await db.query<{ amount: string }>('select initial_balance::text amount from public.accounts where id=$1', [debt])).rows[0].amount)).toBe(-800000);
    expect((await db.query('select id from public.transactions where account_id=$1', [debt])).rows).toHaveLength(0);
  });

  it('keeps first-of-month posting and assigned recurring date as separate concepts', async () => {
    const rule = randomUUID();
    await command('scheduled.save', { id: rule, kind: 'expense', amount: '19000', account_id: account, category_id: category, description: 'Suscripción local', cadence: 'monthly', interval_count: 1, starts_on: '2026-10-24', anchor_day: 24, posting_policy: 'month_start', timezone: 'America/Bogota', auto_post: true, include_in_budget: false, include_in_income_target: false, status: 'active', exchange_rate: '1', exchange_rate_date: '2026-10-21', exchange_rate_source: 'same_currency' });
    const saved = (await db.query<{ posting_policy: string; anchor_day: number }>('select posting_policy,anchor_day from public.recurring_rules where id=$1', [rule])).rows[0];
    expect(saved).toEqual({ posting_policy: 'month_start', anchor_day: 24 });
    await expect(command('scheduled.save', { id: rule, status: 'archived' }, tokens.write)).rejects.toThrow('acceso total');
  });

  it('aggregates 10,000 large local movements without shipping the history in context', async () => {
    await db.query('begin');
    try {
      await db.query(`insert into public.transactions(id,user_id,account_id,category_id,kind,amount,description,occurred_on,native_currency_code,base_currency_code,base_amount,exchange_rate,exchange_rate_date,exchange_rate_source)
        select gen_random_uuid(),$1::uuid,$2::uuid,$3::uuid,'expense',90000000000,'Carga local '||g,date '2026-10-01'+(g%31),'COP','COP',90000000000,1,date '2026-10-01','same_currency' from generate_series(1,10000) g`, [owner, account, category]);
      const result = await call('context', { include: ['summary', 'accounts'], filters: { month: '2026-10-01' } }, tokens.read);
      expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(50_000);
      expect(JSON.stringify(result)).not.toContain('Carga local');
      const page = await call('query', { queries: [{ id: 'history', action: 'movements', data: { limit: 200, start_date: '2026-10-01', end_date: '2026-11-01' } }] }, tokens.read);
      expect(((page!.results as Array<{ data: { items: unknown[] } }>)[0].data.items)).toHaveLength(100);
    } finally { await db.query('rollback'); }
  }, 60000);

  it('reports a stale canonical object version as 409 even with a fresh global revision', async () => {
    const id = randomUUID();
    const entity = { id, name: 'Versioned entity', color: '#123456', icon: 'bank', sort_order: 0 };
    await command('entity.save', { entity });
    const result = await query('select public.integration_gateway_v1($1,$2,$3,$4::jsonb) value', [gateway, hash(tokens.write), 'commands', JSON.stringify({ operationId: randomUUID(), expectedRevision: await revision(), commands: [{ id: randomUUID(), action: 'entity.save', data: { entity, expected_version: 0 } }] })]);
    expect(result!.error).toMatchObject({ status: 409, code: 'conflict' });
  });

  it('resets financial data and capabilities while preserving Google, appearance and the other owner', async () => {
    const otherBefore = (await db.query('select * from public.accounts where user_id=$1', [other])).rows;
    const script = (await readFile('supabase/operations/reset_financial_user.sql', 'utf8')).replace("target_user_id constant uuid := '00000000-0000-0000-0000-000000000000'", `target_user_id constant uuid := '${owner}'`);
    await db.exec(script);
    expect((await db.query('select * from private.integration_connections where user_id=$1', [owner])).rows).toHaveLength(0);
    expect((await db.query('select * from private.integration_command_ids where user_id=$1', [owner])).rows).toHaveLength(0);
    expect((await db.query('select * from public.transactions where user_id=$1', [owner])).rows).toHaveLength(0);
    expect((await db.query('select * from auth.users where id=$1', [owner])).rows).toHaveLength(1);
    expect((await db.query('select * from public.accounts where user_id=$1', [other])).rows).toEqual(otherBefore);
    await expect(call('context', {}, tokens.read)).rejects.toThrow('revocado');
  });
});
