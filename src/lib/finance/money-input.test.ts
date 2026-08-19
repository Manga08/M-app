import { describe, expect, it } from "vitest";
import { formatMoneyInput, formatMoneyInputValue, parseMoneyInput } from "./money-input";

describe("campos monetarios", () => {
  it("agrupa pesos colombianos mientras se escriben", () => {
    expect(formatMoneyInput("1000000", "COP")).toBe("1.000.000");
    expect(formatMoneyInput("$ 1.000.000", "COP")).toBe("1.000.000");
  });

  it("conserva decimales locales para monedas que los usan", () => {
    expect(formatMoneyInput("123456,78", "USD")).toBe("123.456,78");
    expect(formatMoneyInput("1234.5", "USD")).toBe("1.234,5");
  });

  it("convierte el texto formateado al valor numérico real", () => {
    expect(parseMoneyInput("1.000.000")).toBe(1_000_000);
    expect(parseMoneyInput("123.456,78")).toBe(123_456.78);
  });

  it("formatea valores existentes al abrir una edición", () => {
    expect(formatMoneyInputValue(1_250_000, "COP")).toBe("1.250.000");
  });

  it("admite saldos iniciales negativos sin perder la agrupación", () => {
    expect(formatMoneyInput("-1250000", "COP", { allowNegative: true })).toBe("-1.250.000");
    expect(parseMoneyInput("-1.250.000")).toBe(-1_250_000);
  });

  it("conserva cero y permite vaciar el campo", () => {
    expect(formatMoneyInput("0", "COP")).toBe("0");
    expect(formatMoneyInput("", "COP")).toBe("");
    expect(parseMoneyInput("")).toBe(0);
    expect(parseMoneyInput("-")).toBe(0);
  });
});
