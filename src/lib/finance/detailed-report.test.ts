import { describe, expect, it } from "vitest";
import { demoFinanceState } from "@/lib/finance/demo-data";
import { buildDetailedFinanceReport, detailedFinanceReportFromRpc } from "@/lib/finance/detailed-report";
import { defaultReportQuery } from "@/lib/finance/report-query";

describe("reporte financiero multimoneda", () => {
  it("conserva el monto nativo y agrega únicamente el snapshot histórico", () => {
    const state = structuredClone(demoFinanceState);
    const account = state.accounts[0];
    const transaction = state.transactions.find((item) => item.accountId === account.id)!;
    account.currencyCode = "USD";
    account.initialBalance = 100;
    account.openingExchangeRate = 4_000;
    account.openingBalanceDate = "2026-01-01";
    transaction.amount = 25;
    transaction.nativeCurrencyCode = "USD";
    transaction.baseCurrencyCode = "COP";
    transaction.baseAmount = 102_500;
    transaction.exchangeRate = 4_100;

    const query = defaultReportQuery(new Date(`${transaction.occurredOn}T12:00:00Z`));
    const report = buildDetailedFinanceReport(state, query, "complete");
    const reportedMovement = report.transactions.find((item) => item.id === transaction.id)!;
    const reportedAccount = report.accounts.find((item) => item.id === account.id)!;

    expect(reportedMovement.amount).toBe(25);
    expect(reportedMovement.baseAmount).toBe(102_500);
    expect(reportedAccount.currencyCode).toBe("USD");
    expect(reportedAccount.reportingIncome + reportedAccount.reportingExpense).toBeGreaterThanOrEqual(102_500);
    expect(report.reportingCurrencyCode).toBe(state.profile?.currencyCode);
  });

  it("interpreta la respuesta v4 sin reemplazar el importe original", () => {
    const report = detailedFinanceReportFromRpc({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      reportingCurrencyCode: "COP",
      summary: {},
      accounts: [{
        id: "account-usd", name: "Dólares", type: "savings", color: "#2563eb", currencyCode: "USD",
        entityId: "entity-global", entityName: "Global66", archived: false,
        nativeOpeningBalance: 100, nativeClosingBalance: 125, nativeIncome: 25, nativeExpense: 0,
        nativeTransferIn: 0, nativeTransferOut: 0, nativeNetFlow: 25,
        reportingOpeningBalance: 400_000, reportingClosingBalance: 502_500, reportingIncome: 102_500,
        reportingExpense: 0, reportingTransferIn: 0, reportingTransferOut: 0, reportingNetFlow: 102_500,
      }],
      transactions: [{
        id: "movement-usd", kind: "income", amount: 102_500, native_amount: 25, base_amount: 102_500,
        native_currency_code: "USD", base_currency_code: "COP", exchange_rate: 4_100,
        account_id: "account-usd", description: "Ingreso USD", occurred_on: "2026-08-01", created_at: "2026-08-01T12:00:00Z",
      }],
    });

    expect(report.transactions[0].amount).toBe(25);
    expect(report.transactions[0].baseAmount).toBe(102_500);
    expect(report.entities[0]).toMatchObject({ id: "entity-global", name: "Global66", reportingClosingBalance: 502_500 });
    expect(report.entities[0].nativeTotals).toEqual([{ currencyCode: "USD", openingBalance: 100, closingBalance: 125, netFlow: 25 }]);
  });
});
