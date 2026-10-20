/**
 * Test stub for `next/headers` — vitest cannot resolve the real Next.js
 * server-only modules. Integration tests drive the REAL Better Auth pipeline
 * (auth.handler + auth.api.*) by feeding request headers through `headers()`
 * and capturing Set-Cookie writes through `cookies()`.
 */
let current: Headers = new Headers();

export function setTestHeaders(next: Headers): void {
  current = next;
}

export async function headers(): Promise<Headers> {
  return current;
}

type CookieStoreEntry = { value: string };

const jar = new Map<string, CookieStoreEntry>();

export function clearTestCookies(): void {
  jar.clear();
}

export function getTestCookie(name: string): string | undefined {
  return jar.get(name)?.value;
}

export async function cookies(): Promise<{
  get(name: string): CookieStoreEntry | undefined;
  set(name: string, value: string): void;
  delete(name: string): void;
}> {
  return {
    get: (name) => jar.get(name),
    set: (name, value) => {
      jar.set(name, { value });
    },
    delete: (name) => {
      jar.delete(name);
    },
  };
}
