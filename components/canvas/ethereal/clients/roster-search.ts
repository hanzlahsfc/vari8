import type { WorkspaceClient } from "./model";

/**
 * T3 roster free-text filter. Matches the client name, label, phase or
 * template, case-insensitively, after trimming. A blank query passes every
 * row. Kept in a dependency-free module so the filter is unit-testable and
 * the frontend/canvas twins stay identical.
 */
export function matchingSearch(client: WorkspaceClient, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [client.name, client.label, client.phase, client.template]
    .filter(Boolean)
    .some((value) => value.toLocaleLowerCase().includes(normalized));
}
