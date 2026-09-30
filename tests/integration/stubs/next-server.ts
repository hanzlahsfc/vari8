/**
 * Minimal `next/server` test adapter. Auth.js's handler path reads
 * `NextRequest.nextUrl` whenever AUTH_URL/NEXTAUTH_URL is configured, so use
 * Next.js's real request implementation rather than a web Request look-alike.
 * Middleware response behavior remains deliberately unsupported here.
 */
export { NextRequest } from "next/dist/server/web/spec-extension/request";

export class NextResponse extends Response {
  static next(): never {
    throw new Error("NextResponse.next() is not supported in tests");
  }
}
