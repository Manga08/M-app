import { describe, expect, it } from "vitest";
import { userFacingSyncErrorMessage } from "./sync-error";

describe("userFacingSyncErrorMessage", () => {
  it("oculta detalles internos de PostgreSQL", () => {
    expect(userFacingSyncErrorMessage('null value in column "user_id" of relation "recurring_occurrences" violates not-null constraint'))
      .toBe("No pudimos sincronizar este cambio todavía. Moneva volverá a intentarlo automáticamente.");
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
