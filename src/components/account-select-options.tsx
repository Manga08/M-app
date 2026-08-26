import { accountOptionGroups } from "@/lib/finance/account-entities";
import type { Account, AccountEntity } from "@/lib/finance/types";

export type AccountSelectOptionsProps = { accounts: Account[]; entities: AccountEntity[]; includeArchived?: boolean };

/**
 * Returns native option nodes directly so SelectControl can normalize the same
 * grouped choices for both its native mobile select and Radix desktop picker.
 */
export function accountSelectOptions({ accounts, entities, includeArchived = false }: AccountSelectOptionsProps) {
  const activeGroups = accountOptionGroups(accounts, entities);
  const archived = includeArchived
    ? accounts.filter((account) => account.archived).toSorted((left, right) => left.name.localeCompare(right.name, "es", { sensitivity: "base", numeric: true }))
    : [];

  return <>
    {activeGroups.map((group) => (
      <optgroup key={group.key} label={group.label}>
        {group.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </optgroup>
    ))}
    {archived.length ? <optgroup label="Archivadas · solo historial">
      {archived.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode ?? "COP"}</option>)}
    </optgroup> : null}
  </>;
}
