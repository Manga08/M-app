export function safeInternalDestination(requested: string | null | undefined, origin: string, fallback = "/") {
  if (!requested) return fallback;
  try {
    const trustedOrigin = new URL(origin).origin;
    const destination = new URL(requested, trustedOrigin);
    if (destination.origin !== trustedOrigin) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}
