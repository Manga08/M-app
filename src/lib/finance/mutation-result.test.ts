import { describe, expect, it } from "vitest";
import { FinanceMutationError, localMutationResult, mutationFailure, queuedMutationResult, syncedMutationResult } from "./mutation-result";

describe("resultados de mutaciones financieras", () => {
  it("distingue persistencia local, sincronización y cola sin falsos positivos remotos", () => {
    expect(localMutationResult("profile.update")).toMatchObject({ status: "local", localSaved: true, remoteSaved: false, queued: false });
    expect(syncedMutationResult("profile.update")).toMatchObject({ status: "synced", localSaved: true, remoteSaved: true, queued: false });
    expect(queuedMutationResult("profile.update", "Sin conexión")).toMatchObject({ status: "queued", localSaved: true, remoteSaved: false, queued: true, warning: "Sin conexión" });
  });

  it("expone un error tipado cuando ni siquiera puede garantizar la cola", () => {
    const error = mutationFailure("account.create", "No se pudo guardar", true);
    expect(error).toBeInstanceOf(FinanceMutationError);
    expect(error.result).toEqual({ ok: false, status: "error", localSaved: true, remoteSaved: false, queued: false, operation: "account.create", message: "No se pudo guardar" });
  });
});
