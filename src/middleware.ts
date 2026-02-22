import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const segments = pathname.split("/");
  const firstSegment = segments[1] || "";
  const normalizedFirstSegment = firstSegment.toLowerCase();

  // Normalize known top-level route casing only; preserve dynamic segments.
  const shouldNormalizeTopLevel = ["identity", "token", "tokentools"].includes(
    normalizedFirstSegment
  );

  if (
    shouldNormalizeTopLevel &&
    firstSegment.length > 0 &&
    firstSegment !== normalizedFirstSegment
  ) {
    const normalizedUrl = request.nextUrl.clone();
    segments[1] = normalizedFirstSegment;
    normalizedUrl.pathname = segments.join("/") || "/";
    return NextResponse.redirect(normalizedUrl);
  }

  return NextResponse.next();
}
