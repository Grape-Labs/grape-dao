import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Normalize known app routes casing to avoid route mismatches.
  const shouldNormalize =
    /^\/identity(\/|$)/i.test(pathname) ||
    /^\/token(\/|$)/i.test(pathname) ||
    /^\/tokentools(\/|$)/i.test(pathname);

  if (shouldNormalize && pathname !== pathname.toLowerCase()) {
    const normalizedUrl = request.nextUrl.clone();
    normalizedUrl.pathname = pathname.toLowerCase();
    return NextResponse.redirect(normalizedUrl);
  }

  return NextResponse.next();
}
