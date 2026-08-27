import type { FinanceSnapshot, Transaction } from "./types";

/** The server count is authoritative because the local movement list is paginated. */
export function accountCurrencyIsLocked(accountId: string, snapshot: FinanceSnapshot | undefined, transactions: Transaction[]) {
  return (snapshot?.accountMovementCounts?.[accountId] ?? 0) > 0
    || transactions.some((transaction) => transaction.accountId === accountId);
}
