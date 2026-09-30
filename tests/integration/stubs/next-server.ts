/**
 * Minimal `next/server` stub — only the middleware path of next-auth uses
 * NextResponse/NextRequest; the tests exercise `auth()`/`handlers` which run
 * on web-standard Request/Response. Fail loudly if ever touched.
 */
export class NextResponse extends Response {
  static next(): never {
    throw new Error("NextResponse.next() is not supported in tests");
  }
}

export class NextRequest extends Request {}
