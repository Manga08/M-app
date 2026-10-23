import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { createFinancePostgres } from "./helpers/finance-postgres";
import { detailedFinanceReportFromRpc } from "@/lib/finance/detailed-report";

describe("reportes: PostgreSQL real, filtros y permisos", () => {
  let db: PGlite, account: string, category: string, sibling: string, group: string;
  const owner = randomUUID(), other = randomUUID();
  beforeAll(async () => {
    db = await createFinancePostgres();
    for (const [id, email] of [[owner, "report-owner@example.test"], [other, "report-other@example.test"]]) {
      await db.query("insert into private.access_allowlist(email,enabled,access_role) values($1,true,'member')", [email]);
      await db.query("insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),'{\"provider\":\"google\"}')", [id, email]);
      await db.query("insert into auth.identities(user_id,provider) values($1,'google')", [id]);
    }
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [owner, JSON.stringify({ sub: owner, role: "authenticated" })]);
    account = (await db.query<{ id: string }>("select id from public.accounts where user_id=$1 limit 1", [owner])).rows[0].id;
    const rows = (await db.query<{ id: string; category_group: string }>("select id,category_group from public.categories where user_id=$1 and transaction_kind='expense' order by category_group,name", [owner])).rows;
    const first = rows.find((item) => rows.some((candidate) => candidate.id !== item.id && candidate.category_group === item.category_group))!;
    category = first.id; group = first.category_group; sibling = rows.find((item) => item.id !== category && item.category_group === group)!.id;
    await db.query("update public.accounts set initial_balance=5000000,opening_balance_date='2026-01-01' where id=$1", [account]);
  }, 120_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.exec("begin"); });
  afterEach(async () => { await db.exec("rollback"); });
  const add = async (amount: number, categoryId = category, date = "2026-08-20") => db.query(`insert into public.transactions(id,user_id,account_id,category_id,kind,amount,description,occurred_on,native_currency_code,base_currency_code,base_amount,exchange_rate,exchange_rate_date,exchange_rate_source)
    values($1,$2,$3,$4,'expense',$5,'Local report test',$6,'COP','COP',$5,1,$6,'identity')`, [randomUUID(), owner, account, categoryId, amount, date]);
  const report = async (args: string = "", values: unknown[] = []) => {
    await db.exec("set local role authenticated");
    const rows = (await db.query<{ value: unknown }>(`select public.get_detailed_finance_report_v4('2026-08-01','2026-10-31'${args}) value`, values)).rows;
    return detailedFinanceReportFromRpc(rows[0].value);
  };
  it("reconcilia clasificación compuesta, resumen y filas", async () => {
    await add(200_000); await add(300_000, sibling);
    const result = await report(",p_group_keys:=$1::text[],p_category_ids:=$2::uuid[]", [[group], [category]]);
    expect(result.summary.expense).toBe(200_000);
    expect(result.groups.reduce((sum, item) => sum + item.expense, 0)).toBe(200_000);
    expect(result.transactions).toHaveLength(1);
  });
  it("no calcula un déficit sin límites", async () => {
    await add(200_000); const result = await report();
    expect(result.summary).toMatchObject({ budget: 0, budgetExpense: 0, budgetVariance: 0, unbudgetedExpense: 200_000 });
  });
  it("respeta categoría/mes en presupuestos parciales", async () => {
    await add(100_000); await add(300_000, sibling); await add(500_000, category, "2026-09-20");
    await db.query("insert into public.budgets(user_id,category_id,month,amount) values($1,$2,'2026-08-01',100000)", [owner, category]);
    const result = await report();
    expect(result.summary).toMatchObject({ expense: 900_000, budgetExpense: 100_000, budgetUsage: 100, budgetVariance: 0, unbudgetedExpense: 800_000 });
    expect(result.groups.find((item) => item.group === group)?.usage).toBe(100);
  });
  it("no introduce septiembre en meses sueltos ni en el denominador", async () => {
    await add(310_000); await add(9_000_000, category, "2026-09-20"); await add(310_000, category, "2026-10-20");
    const result = await report(",p_months:=array['2026-08-01','2026-10-01']::date[],p_granularity:='month'");
    expect(result.summary.averageDailyExpense).toBe(10_000);
    expect(result.series.map((item) => item.period)).toEqual(["2026-08-01", "2026-10-01"]);
  });
  it("conserva saldos del libro al filtrar una subcategoría", async () => {
    await add(200_000); await add(300_000, sibling);
    const result = await report(",p_category_ids:=$1::uuid[]", [[category]]);
    expect(result.summary.expense).toBe(200_000); expect(result.accounts[0].nativeClosingBalance).toBe(4_500_000);
  });
  it("pagina todo el resultado por cursor sin saltos, duplicados ni filtros perdidos", async () => {
    for (let index = 0; index < 27; index++) await add(1000 + index);
    await add(99_999, sibling);
    await db.exec("set local role authenticated");
    const page = async (cursor?: { occurredOn: string; createdAt: string; id: string }) => (await db.query<{ value: { transactions: Array<{ id: string }>; nextCursor: typeof cursor; hasMore: boolean } }>(`select public.get_report_transaction_page_v1('2026-08-01','2026-08-31',p_category_ids:=$1::uuid[],p_cursor_date:=$2::date,p_cursor_created:=$3::timestamptz,p_cursor_id:=$4::uuid) value`, [[category], cursor?.occurredOn ?? null, cursor?.createdAt ?? null, cursor?.id ?? null])).rows[0].value;
    const first = await page(), second = await page(first.nextCursor), last = await page(second.nextCursor);
    expect([first.transactions.length, second.transactions.length, last.transactions.length]).toEqual([12, 12, 3]);
    expect(new Set([...first.transactions, ...second.transactions, ...last.transactions].map((item) => item.id)).size).toBe(27);
    expect(last.hasMore).toBe(false);
  });
  it("mantiene USD nativo y COP histórico sin reinterpretar tasas", async () => {
    const usd = randomUUID();
    await db.query("insert into public.accounts(id,user_id,name,account_type,currency_code,initial_balance,opening_exchange_rate,opening_balance_date) values($1,$2,'USD local','savings','USD',100,4000,'2026-01-01')", [usd, owner]);
    await db.query(`insert into public.transactions(id,user_id,account_id,category_id,kind,amount,description,occurred_on,native_currency_code,base_currency_code,base_amount,exchange_rate,exchange_rate_date,exchange_rate_source)
      values($1,$2,$3,$4,'expense',25,'USD historical','2026-08-20','USD','COP',102500,4100,'2026-08-20','manual')`, [randomUUID(), owner, usd, category]);
    const result = await report();
    expect(result.summary.expense).toBe(102_500);
    expect(result.accounts.find((item) => item.id === usd)).toMatchObject({ currencyCode: "USD", nativeClosingBalance: 75, reportingClosingBalance: 297_500 });
  });
  it("aportes manuales históricos no se confunden con progreso vivo", async () => {
    const target = randomUUID();
    await db.query("insert into public.financial_targets(id,user_id,mode,kind,title,target_amount,initial_progress,starts_on) values($1,$2,'accumulate','savings','Meta local',1000000,900000,'2026-01-01')", [target, owner]);
    await db.query("insert into public.financial_target_entries(user_id,target_id,kind,effect,amount,occurred_on) values($1,$2,'contribution','advance',30000,'2026-08-10')", [owner, target]);
    const result = await report();
    expect(result.targetActivity?.[0]).toMatchObject({ id: target, advanced: 0, manualNet: 30_000, transactionCount: 0 });
    expect(result.summary.income).toBe(0);
  });
  it("mantiene SECURITY INVOKER, aislamiento de usuario y acceso anónimo cerrado", async () => {
    await add(200_000);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    expect((await report()).summary.expense).toBe(0);
    await db.exec("reset role");
    const policy = (await db.query<{ definer: boolean; anonymous: boolean }>("select p.prosecdef definer,has_function_privilege('anon',p.oid,'execute') anonymous from pg_proc p where p.proname='get_detailed_finance_report_v4'")).rows[0];
    expect(policy).toEqual({ definer: false, anonymous: false });
  });
});
