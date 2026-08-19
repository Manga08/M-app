export type FinanceMutationStatus = "local" | "synced" | "queued";

export type FinanceMutationResult = {
  ok: true;
  status: FinanceMutationStatus;
  localSaved: true;
  remoteSaved: boolean;
  queued: boolean;
  operation: string;
  warning?: string;
};

export type FinanceMutationFailure = {
  ok: false;
  status: "error";
  localSaved: boolean;
  remoteSaved: false;
  queued: false;
  operation: string;
  message: string;
};

export class FinanceMutationError extends Error {
  readonly result: FinanceMutationFailure;

  constructor(result: FinanceMutationFailure, options?: ErrorOptions) {
    super(result.message, options);
    this.name = "FinanceMutationError";
    this.result = result;
  }
}

export function localMutationResult(operation: string): FinanceMutationResult {
  return { ok: true, status: "local", localSaved: true, remoteSaved: false, queued: false, operation };
}

export function syncedMutationResult(operation: string): FinanceMutationResult {
  return { ok: true, status: "synced", localSaved: true, remoteSaved: true, queued: false, operation };
}

export function queuedMutationResult(operation: string, warning?: string): FinanceMutationResult {
  return { ok: true, status: "queued", localSaved: true, remoteSaved: false, queued: true, operation, ...(warning ? { warning } : {}) };
}

export function mutationFailure(operation: string, message: string, localSaved: boolean, cause?: unknown): FinanceMutationError {
  return new FinanceMutationError(
    { ok: false, status: "error", localSaved, remoteSaved: false, queued: false, operation, message },
    cause === undefined ? undefined : { cause },
  );
}
