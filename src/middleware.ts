import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Normalize only /identity path casing to avoid redirect loops.
  if (/^\/identity(\/|$)/i.test(pathname) && pathname !== pathname.toLowerCase()) {
    const normalizedUrl = request.nextUrl.clone();
    normalizedUrl.pathname = pathname.toLowerCase();
    return NextResponse.redirect(normalizedUrl);
  }

  return NextResponse.next();
}
