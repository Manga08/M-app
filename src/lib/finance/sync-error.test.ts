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
});
