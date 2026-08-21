import { describe, expect, it } from "vitest";
import { analyzeOcrText } from "./local-image-capture";

describe("captura local desde texto OCR", () => {
  it("extrae una compra de una notificación bancaria colombiana", () => {
    const candidate = analyzeOcrText(`
      Bancolombia
      Compra aprobada
      Pagaste $ 15.000 en Almacenes Éxito
      Tarjeta terminada en 4521
      Fecha: 20 de agosto de 2026, 10:45 a. m.
    `, { referenceDate: "2026-08-20" });

    expect(candidate).toMatchObject({
      type: "expense",
      amount: 15_000,
      currencyCode: "COP",
      occurredOn: "2026-08-20",
      merchant: "Éxito",
      description: "Compra en Éxito",
      accountLast4: "4521",
      sourceInstitution: "Bancolombia",
      icon: "brand:exito-colombia",
    });
    expect(candidate.confidence.overall).toBeGreaterThan(0.8);
    expect(candidate.warnings).toEqual([]);
  });

  it("reconoce un ingreso con formato monetario decimal", () => {
    const candidate = analyzeOcrText(`
      Davivienda
      Transferencia recibida
      Recibiste COP $ 1.250.000,00 de EMPRESA EJEMPLO S.A.S.
      Cuenta **1234
      Fecha 18/08/2026
    `, { referenceDate: "2026-08-20" });

    expect(candidate.type).toBe("income");
    expect(candidate.amount).toBe(1_250_000);
    expect(candidate.occurredOn).toBe("2026-08-18");
    expect(candidate.merchant).toBe("EMPRESA EJEMPLO S.A.S.");
    expect(candidate.accountLast4).toBe("1234");
    expect(candidate.sourceInstitution).toBe("Davivienda");
  });

  it("marca una transferencia para confirmar ambas cuentas", () => {
    const candidate = analyzeOcrText(`
      Nequi
      Transferencia enviada
      Enviaste $80.000 a María Pérez
      Desde tu cuenta terminada en 9087
      Hoy, 08:21
    `, { referenceDate: "2026-08-20" });

    expect(candidate).toMatchObject({ type: "transfer", amount: 80_000, occurredOn: "2026-08-20", merchant: "María Pérez", accountLast4: "9087" });
    expect(candidate.warnings.map((item) => item.code)).toContain("transfer_accounts_required");
    expect(candidate.warnings.map((item) => item.code)).toContain("date_inferred");
  });

  it("prefiere el total del recibo sobre subtotal, IVA y cambio", () => {
    const candidate = analyzeOcrText(`
      RESTAURANTE DEMO
      Subtotal          $ 90.000
      IVA               $ 17.100
      TOTAL A PAGAR     $ 107.100
      Efectivo          $ 120.000
      Cambio            $ 12.900
      Compra realizada 19/08/2026
    `, { referenceDate: "2026-08-20" });

    expect(candidate.type).toBe("expense");
    expect(candidate.amount).toBe(107_100);
    expect(candidate.occurredOn).toBe("2026-08-19");
    expect(candidate.warnings.map((item) => item.code)).not.toContain("amount_ambiguous");
  });

  it("no mezcla una fecha de la misma línea con el monto", () => {
    const candidate = analyzeOcrText("Compraste $ 45.000 20/08/2026 en Carulla", { referenceDate: "2026-08-20" });
    expect(candidate.amount).toBe(45_000);
    expect(candidate.occurredOn).toBe("2026-08-20");
    expect(candidate.merchant).toBe("Carulla");
  });

  it("advierte cuando dos montos tienen la misma prioridad", () => {
    const candidate = analyzeOcrText(`
      Pago realizado
      Monto: $ 25.000
      Valor: $ 30.000
      Fecha: 19/08/2026
    `, { referenceDate: "2026-08-20" });

    expect(candidate.amount).toBe(30_000);
    expect(candidate.warnings.map((item) => item.code)).toContain("amount_ambiguous");
    expect(candidate.confidence.overall).toBeLessThanOrEqual(0.68);
  });

  it("corrige una O confundida con cero, pero obliga a revisar el monto", () => {
    const candidate = analyzeOcrText(`
      Compra aprobada
      Pagaste $ 15.OOO en Spotify
      Fecha: 20/08/2026
    `, { referenceDate: "2026-08-20" });

    expect(candidate.amount).toBe(15_000);
    expect(candidate.merchant).toBe("Spotify");
    expect(candidate.icon).toBe("brand:spotify");
    expect(candidate.warnings.map((item) => item.code)).toContain("amount_ocr_corrected");
  });

  it("separa la institución emisora del comercio conocido", () => {
    const candidate = analyzeOcrText(`
      Global66
      Compra aprobada por $ 49.900
      Comercio: YouTube
      Fecha: 20/08/2026
    `, { referenceDate: "2026-08-20" });

    expect(candidate.sourceInstitution).toBe("Global66");
    expect(candidate.merchant).toBe("YouTube");
    expect(candidate.icon).toBe("brand:youtube");
  });

  it("no inventa datos cuando el OCR no contiene evidencia suficiente", () => {
    const candidate = analyzeOcrText("Gracias por preferirnos", { referenceDate: "2026-08-20" });

    expect(candidate).toMatchObject({ type: "unknown", amount: null, occurredOn: null, merchant: null, accountLast4: null, icon: null });
    expect(candidate.confidence.overall).toBeLessThanOrEqual(0.25);
    expect(candidate.warnings.map((item) => item.code)).toEqual(expect.arrayContaining(["type_uncertain", "amount_missing", "date_missing", "merchant_missing"]));
  });

  it("rechaza texto vacío sin efectos secundarios", () => {
    const candidate = analyzeOcrText(" \n\t ", { referenceDate: "2026-08-20" });
    expect(candidate.confidence.overall).toBe(0);
    expect(candidate.warnings.map((item) => item.code)).toEqual(["empty_text"]);
  });

  it("no conserva el texto financiero original en el candidato", () => {
    const candidate = analyzeOcrText("Pagaste $20.000 en Spotify\nCuenta **7788\nFecha 20/08/2026", { referenceDate: "2026-08-20" });
    expect(candidate).not.toHaveProperty("rawText");
    expect(JSON.stringify(candidate)).not.toContain("7788\nFecha");
  });

  it("señala fechas numéricas ambiguas y fechas futuras", () => {
    const candidate = analyzeOcrText("Pagaste $10.000 en Subway\nFecha: 08/09/2026", { referenceDate: "2026-08-20" });
    expect(candidate.occurredOn).toBe("2026-09-08");
    expect(candidate.warnings.map((item) => item.code)).toEqual(expect.arrayContaining(["date_ambiguous", "future_date"]));
  });
});
