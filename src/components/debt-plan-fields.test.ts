import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  applyDebtProductPreset,
  boundedDebtMinimumDue,
  buildDebtPlanPreview,
  createDebtPlanDraft,
  debtRateWasCleared,
  DebtPlanFields,
} from "@/components/debt-plan-fields";

describe("debt plan fields", () => {
  it("builds a calculated COP schedule from explicit fixed terms", () => {
    const value = {
      ...createDebtPlanDraft({ startOn: "2026-08-01" }),
      principal: 12_000_000,
      firstDueOn: "2026-09-01",
      installmentCount: 12,
      rateValue: 18,
    };

    const preview = buildDebtPlanPreview(value);

    expect(preview.state).toBe("ready");
    if (preview.state !== "ready") return;
    expect(preview.certainty).toBe("calculated");
    expect(preview.schedule.rows).toHaveLength(12);
    expect(preview.totalPayments).toBeGreaterThan(value.principal);
    expect(preview.displayCurrency).toBe("COP");
  });

  it("marks a variable-rate projection as approximate", () => {
    const value = {
      ...createDebtPlanDraft({ startOn: "2026-08-01", currencyCode: "USD" }),
      principal: 5_000,
      firstDueOn: "2026-09-01",
      installmentCount: 18,
      variableRate: true,
      indexName: "IBR",
      rateValue: 9,
      spreadRate: 3,
    };

    const preview = buildDebtPlanPreview(value);

    expect(preview.state).toBe("ready");
    if (preview.state !== "ready") return;
    expect(preview.certainty).toBe("estimated");
    expect(preview.displayCurrency).toBe("USD");
    expect(preview.effectiveAnnualRate).toBe(12);
  });

  it("uses a manual UVR reference only for an approximate COP preview", () => {
    const base = createDebtPlanDraft({ startOn: "2026-08-01" });
    const value = {
      ...applyDebtProductPreset(base, "mortgage_uvr"),
      principal: 160_000_000,
      firstDueOn: "2026-09-01",
      installmentCount: 120,
      rateValue: 7,
      indexReferenceValue: 380.25,
    };

    const preview = buildDebtPlanPreview(value);

    expect(preview.state).toBe("ready");
    if (preview.state !== "ready") return;
    expect(preview.certainty).toBe("estimated");
    expect(preview.displayCurrency).toBe("COP");
    expect(preview.totalPayments).toBeGreaterThan(value.principal);
    expect(preview.schedule.currencyCode).toBe("UVR");
  });

  it("keeps the UVR preview usable when the user chooses a manual payment plan", () => {
    const base = applyDebtProductPreset(createDebtPlanDraft({ startOn: "2026-08-01" }), "mortgage_uvr");
    const preview = buildDebtPlanPreview({
      ...base,
      principal: 80_000_000,
      firstDueOn: "2026-09-01",
      installmentCount: 24,
      amortizationMethod: "manual",
      calculationMethod: "manual",
      scheduledPayment: 4_000_000,
      indexReferenceValue: 380,
    });

    expect(preview.state).toBe("ready");
    if (preview.state !== "ready") return;
    expect(preview.certainty).toBe("manual");
    expect(preview.displayCurrency).toBe("COP");
  });

  it("does not invent a missing rate", () => {
    const value = {
      ...createDebtPlanDraft({ startOn: "2026-08-01" }),
      principal: 2_000_000,
      firstDueOn: "2026-09-01",
      installmentCount: 10,
    };

    expect(buildDebtPlanPreview(value)).toEqual({
      state: "empty",
      message: "Escribe la tasa informada para calcular sin inventarla.",
    });
  });

  it("keeps the debt ledger account separate from the account used to pay", () => {
    const value = {
      ...createDebtPlanDraft({ startOn: "2026-08-01" }),
      liabilityAccountId: "liability-account",
      fundingAccountId: "cash-account",
    };

    expect(value.liabilityAccountId).toBe("liability-account");
    expect(value.fundingAccountId).toBe("cash-account");
    expect(value.liabilityAccountId).not.toBe(value.fundingAccountId);
  });

  it("renders the progressive editor with its local preview and accessible labels", () => {
    const value = {
      ...createDebtPlanDraft({ startOn: "2026-08-01" }),
      principal: 3_000_000,
      firstDueOn: "2026-09-01",
      installmentCount: 12,
      rateValue: 14,
    };

    const html = renderToStaticMarkup(createElement(DebtPlanFields, { value, onChange: () => undefined }));

    expect(html).toContain("data-debt-plan-fields");
    expect(html).toContain("¿Qué tipo de deuda es?");
    expect(html).toContain("Vista previa local");
    expect(html).toContain("Cómo leer estos datos");
    expect(html).toContain("for=\"");
    expect(html).not.toContain("undefined");
  });

  it("renders ledger-owned balance and currency as read-only when editing a debt", () => {
    const value = {
      ...createDebtPlanDraft({ startOn: "2026-08-01", currencyCode: "USD" }),
      principal: 850,
      openingExchangeRate: 4_100,
    };

    const html = renderToStaticMarkup(createElement(DebtPlanFields, {
      value,
      openingStateLocked: true,
      onChange: () => undefined,
    }));

    expect(html).toContain('data-debt-opening-state="locked"');
    expect(html).toContain("Saldo pendiente actual");
    expect(html).toContain("editar el plan no cambia el saldo");
    expect(html).toContain("La moneda forma parte del historial contable");
    expect(html).toContain("readOnly");
  });

  it("caps a contractual minimum at a smaller final installment", () => {
    expect(boundedDebtMinimumDue(300_000, 42_750)).toBe(42_750);
    expect(() => boundedDebtMinimumDue(-1, 42_750)).toThrow("no puede ser negativo");
  });

  it("distinguishes an explicitly cleared persisted rate from an untouched empty draft", () => {
    expect(debtRateWasCleared({ rateValue: undefined, effectiveAnnualRate: undefined }, true)).toBe(true);
    expect(debtRateWasCleared({ rateValue: undefined, effectiveAnnualRate: undefined }, false)).toBe(false);
    expect(debtRateWasCleared({ rateValue: 0, effectiveAnnualRate: 0 }, true)).toBe(false);
  });
});
