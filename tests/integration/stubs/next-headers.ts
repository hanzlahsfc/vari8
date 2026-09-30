/**
 * Test stub for `next/headers` — vitest cannot resolve the real Next.js
 * server-only module. The integration session-runtime tests drive the REAL
 * next-auth `auth()` (RSC path) by feeding request headers through this hook.
 */
let current: Headers = new Headers();

export function setTestHeaders(next: Headers): void {
  current = next;
}

export async function headers(): Promise<Headers> {
  return current;
}
