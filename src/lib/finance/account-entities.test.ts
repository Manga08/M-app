import { describe, expect, it } from "vitest";
import { accountContextLabel, accountEntityGroups, accountOptionGroups, activeAccountEntities } from "./account-entities";
import type { Account, AccountEntity } from "./types";

const entities: AccountEntity[] = [
  { id: "global66", name: "Global66", color: "#38d39f", icon: "brand-global66", sortOrder: 2 },
  { id: "rappi", name: "RappiPay", color: "#ff554f", icon: "brand-rappi", sortOrder: 1 },
  { id: "old", name: "Entidad archivada", color: "#64748b", icon: "landmark", sortOrder: 0, archived: true },
];

const accounts: Account[] = [
  { id: "cop", name: "Pesos", type: "savings", initialBalance: 0, color: "#38d39f", currencyCode: "COP", entityId: "global66" },
  { id: "usd", name: "Dólares", type: "savings", initialBalance: 0, color: "#3b82f6", currencyCode: "USD", entityId: "global66" },
  { id: "cash", name: "Efectivo", type: "cash", initialBalance: 0, color: "#f59e0b", currencyCode: "COP" },
  { id: "orphan", name: "Bolsillo anterior", type: "savings", initialBalance: 0, color: "#8b5cf6", entityId: "old" },
  { id: "archived", name: "Cuenta archivada", type: "cash", initialBalance: 0, color: "#64748b", archived: true },
];

describe("entidades de cuentas", () => {
  it("ordena las entidades activas sin exponer las archivadas", () => {
    expect(activeAccountEntities(entities).map((entity) => entity.id)).toEqual(["rappi", "global66"]);
  });

  it("agrupa las cuentas y recupera las huérfanas en Sin entidad", () => {
    const groups = accountEntityGroups(accounts, entities);
    expect(groups.map((group) => group.entity?.id ?? "ungrouped")).toEqual(["rappi", "global66", "ungrouped"]);
    expect(groups[1].accounts.map((account) => account.id)).toEqual(["usd", "cop"]);
    expect(groups[2].accounts.map((account) => account.id)).toEqual(["orphan", "cash"]);
  });

  it("crea selectores con contexto y conserva la cuenta como valor real", () => {
    expect(accountOptionGroups(accounts, entities)).toEqual([
      {
        key: "global66",
        label: "Global66",
        options: [
          { value: "usd", label: "Dólares · USD" },
          { value: "cop", label: "Pesos · COP" },
        ],
      },
      {
        key: "ungrouped",
        label: "Sin entidad",
        options: [
          { value: "orphan", label: "Bolsillo anterior · COP" },
          { value: "cash", label: "Efectivo · COP" },
        ],
      },
    ]);
    expect(accountContextLabel(accounts[0], entities)).toBe("Global66 · Pesos");
    expect(accountContextLabel(accounts[2], entities)).toBe("Efectivo");
  });
});
