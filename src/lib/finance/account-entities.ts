import type { Account, AccountEntity } from "@/lib/finance/types";

export type AccountEntityGroup = {
  entity: AccountEntity | null;
  accounts: Account[];
};

export type AccountOptionGroup = {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
};

function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, "es", { sensitivity: "base", numeric: true });
}

export function activeAccountEntities(entities: AccountEntity[]) {
  return entities
    .filter((entity) => !entity.archived)
    .toSorted((a, b) => a.sortOrder - b.sortOrder || byName(a, b));
}

export function accountEntityGroups(accounts: Account[], entities: AccountEntity[]): AccountEntityGroup[] {
  const activeAccounts = accounts.filter((account) => !account.archived);
  const accountsByEntity = new Map<string, Account[]>();
  const ungrouped: Account[] = [];

  for (const account of activeAccounts) {
    if (!account.entityId) {
      ungrouped.push(account);
      continue;
    }
    const current = accountsByEntity.get(account.entityId) ?? [];
    current.push(account);
    accountsByEntity.set(account.entityId, current);
  }

  const groups: AccountEntityGroup[] = activeAccountEntities(entities).map((entity) => ({
    entity,
    accounts: (accountsByEntity.get(entity.id) ?? []).toSorted(byName),
  }));

  const knownEntityIds = new Set(groups.map(({ entity }) => entity!.id));
  for (const account of activeAccounts) {
    if (account.entityId && !knownEntityIds.has(account.entityId)) ungrouped.push(account);
  }

  if (ungrouped.length) groups.push({ entity: null, accounts: ungrouped.toSorted(byName) });
  return groups;
}

export function accountOptionGroups(accounts: Account[], entities: AccountEntity[]): AccountOptionGroup[] {
  return accountEntityGroups(accounts, entities)
    .filter((group) => group.accounts.length > 0)
    .map((group) => ({
      key: group.entity?.id ?? "ungrouped",
      label: group.entity?.name ?? "Sin entidad",
      options: group.accounts.map((account) => ({
        value: account.id,
        label: `${account.name} · ${account.currencyCode ?? "COP"}`,
      })),
    }));
}

export function accountContextLabel(account: Account | undefined, entities: AccountEntity[]) {
  if (!account) return "Cuenta";
  const entity = account.entityId ? entities.find((item) => item.id === account.entityId && !item.archived) : undefined;
  return entity ? `${entity.name} · ${account.name}` : account.name;
}
