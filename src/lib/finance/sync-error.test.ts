import { describe, expect, it } from "vitest";
import { userFacingSyncErrorMessage } from "./sync-error";

describe("userFacingSyncErrorMessage", () => {
  it("explica los conflictos temporales sin mostrar SQL interno", () => {
    expect(userFacingSyncErrorMessage("deadlock detected")).toBe("Hay otro cambio en curso. Inténtalo nuevamente en un momento.");
    expect(userFacingSyncErrorMessage("could not serialize access due to concurrent update")).toBe("Hay otro cambio en curso. Inténtalo nuevamente en un momento.");
  });
  it("oculta detalles internos de PostgreSQL", () => {
    expect(userFacingSyncErrorMessage('null value in column "user_id" of relation "recurring_occurrences" violates not-null constraint'))
      .toBe("No pudimos sincronizar este cambio todavía. Moneva volverá a intentarlo automáticamente.");
  });

  it("oculta fallos internos y respeta el mensaje de recuperación del formulario", () => {
    expect(userFacingSyncErrorMessage("Cannot read properties of undefined (reading rest)", "Conservamos el formulario. Vuelve a intentarlo.")).toBe("Conservamos el formulario. Vuelve a intentarlo.");
  });

  it("explica un fallo de red sin recomendar borrar información local", () => {
    expect(userFacingSyncErrorMessage(new Error("Failed to fetch"))).toContain("no borres los datos");
  });

  it("conserva mensajes operativos que sí ayudan al usuario", () => {
    expect(userFacingSyncErrorMessage("Sin conexión; se sincronizará automáticamente al volver."))
      .toBe("Sin conexión; se sincronizará automáticamente al volver.");
  });

  it("traduce la regla de moneda inmutable sin mostrar detalles internos", () => {
    expect(userFacingSyncErrorMessage("account currency cannot change after it has movements"))
      .toBe("La moneda de una cuenta con movimientos no puede cambiar. Conservamos su moneda original para proteger el historial.");
  });
});
