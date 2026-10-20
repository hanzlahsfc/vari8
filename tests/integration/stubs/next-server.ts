/**
 * Minimal `next/server` test adapter. Better Auth's Next integration resolves
 * requests through `NextRequest`/`NextResponse`, so use Next.js's real request
 * implementation rather than a web Request look-alike. Middleware response
 * behavior remains deliberately unsupported here.
 */
export { NextRequest } from "next/dist/server/web/spec-extension/request";

export class NextResponse extends Response {
  static next(): never {
    throw new Error("NextResponse.next() is not supported in tests");
  }
}
