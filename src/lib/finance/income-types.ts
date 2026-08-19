import type { Category, IncomeTypeInput } from "./types";

export function activeIncomeTypes(categories: Category[], includeArchivedId?: string) {
  return categories
    .filter((category) => category.kind === "income" && (!category.archived || category.id === includeArchivedId))
    .sort((left, right) => left.name.localeCompare(right.name, "es", { sensitivity: "base" }));
}

export function upsertIncomeTypeInCategories(categories: Category[], input: IncomeTypeInput) {
  const existing = categories.find((category) => category.id === input.id && category.kind === "income");
  const next: Category = {
    ...input,
    group: "income",
    kind: "income",
    isDefault: existing?.isDefault ?? false,
    archived: false,
  };

  return existing
    ? categories.map((category) => category.id === input.id ? next : category)
    : [...categories, next];
}

export function archiveIncomeTypeInCategories(categories: Category[], id: string) {
  return categories.map((category) => category.id === id && category.kind === "income" ? { ...category, archived: true } : category);
}
