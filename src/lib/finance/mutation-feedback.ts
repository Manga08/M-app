import { toast } from "sonner";
import { FinanceMutationError, type FinanceMutationResult } from "./mutation-result";

/**
 * Keeps financial write feedback honest: local persistence is never described
 * as remote synchronization.
 */
export function announceMutation(result: FinanceMutationResult, successMessage: string, options?: { silentWhenSaved?: boolean }) {
  if (result.status === "queued") {
    toast.warning(`${successMessage} en este dispositivo. ${result.warning ?? "La sincronización quedó pendiente y se reintentará automáticamente."}`);
    return;
  }

  if (result.status === "local") {
    if (!options?.silentWhenSaved) toast.success(`${successMessage} en este dispositivo.`);
    return;
  }

  if (!options?.silentWhenSaved) toast.success(successMessage);
}

export function mutationErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof FinanceMutationError) return error.result.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallbackMessage;
}

export function announceMutationError(error: unknown, fallbackMessage: string) {
  const message = mutationErrorMessage(error, fallbackMessage);
  toast.error(message);
  return message;
}
