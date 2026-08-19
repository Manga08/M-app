import { describe, expect, it } from "vitest";
import { activeIncomeTypes, archiveIncomeTypeInCategories, upsertIncomeTypeInCategories } from "./income-types";
import type { Category } from "./types";

const categories: Category[] = [
  { id: "expense", name: "Mercado", group: "needs", color: "#55a8f8", icon: "shopping-cart", kind: "expense" },
  { id: "salary", name: "Nómina", group: "income", color: "#38d39f", icon: "briefcase", kind: "income", isDefault: true },
  { id: "archived", name: "Venta", group: "income", color: "#78d8b6", icon: "coins", kind: "income", archived: true },
];

describe("tipos de ingreso", () => {
  it("solo devuelve tipos activos y conserva uno archivado al editar un movimiento histórico", () => {
    expect(activeIncomeTypes(categories).map((category) => category.id)).toEqual(["salary"]);
    expect(activeIncomeTypes(categories, "archived").map((category) => category.id)).toEqual(["salary", "archived"]);
  });

  it("crea un tipo con la forma de ingreso sin alterar categorías de gasto", () => {
    const result = upsertIncomeTypeInCategories(categories, { id: "bonus", name: "Bonificación", color: "#34d399", icon: "gift" });
    expect(result.find((category) => category.id === "bonus")).toMatchObject({ group: "income", kind: "income", archived: false });
    expect(result.find((category) => category.id === "expense")).toEqual(categories[0]);
  });

  it("reactiva al editar y conserva la marca de tipo inicial", () => {
    const result = upsertIncomeTypeInCategories(categories, { id: "salary", name: "Salario", color: "#22c55e", icon: "wallet-cards" });
    expect(result.find((category) => category.id === "salary")).toMatchObject({ name: "Salario", isDefault: true, archived: false });
  });

  it("archiva únicamente tipos de ingreso", () => {
    const result = archiveIncomeTypeInCategories(categories, "salary");
    expect(result.find((category) => category.id === "salary")?.archived).toBe(true);
    expect(archiveIncomeTypeInCategories(categories, "expense")[0].archived).toBeUndefined();
  });
});
