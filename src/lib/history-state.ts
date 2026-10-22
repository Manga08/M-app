/** Preserve app context, but let Next recognise a native History API navigation as external. */
export function publicHistoryState(value: unknown): Record<string, unknown> {
  const next = value && typeof value === "object" ? { ...value as Record<string, unknown> } : {};
  delete next.__NA;
  delete next._N;
  delete next.__PRIVATE_NEXTJS_INTERNALS_TREE;
  return next;
}
