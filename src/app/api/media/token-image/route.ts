import { isIP } from "node:net";
import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = octets;
  if (a === 10) {
    return true;
  }
  if (a === 127) {
    return true;
  }
  if (a === 0) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && typeof b === "number" && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  return false;
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::") {
    return true;
  }
  if (normalized.startsWith("fe80:")) {
    return true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  return false;
}

function isPrivateIpAddress(address: string) {
  const version = isIP(address);
  if (version === 4) {
    return isPrivateIpv4(address);
  }
  if (version === 6) {
    return isPrivateIpv6(address);
  }
  return true;
}

function assertSafeRemoteHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Missing host.");
  }
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    throw new Error("Host is not allowed.");
  }

  if (isIP(normalized) !== 0) {
    if (isPrivateIpAddress(normalized)) {
      throw new Error("Private IP targets are not allowed.");
    }
  }
}

async function readBodyWithLimit(response: Response, byteLimit: number) {
  if (!response.body) {
    throw new Error("Image response body is empty.");
  }

  const reader = response.body.getReader();
  let totalBytes = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    totalBytes += value.byteLength;
    if (totalBytes > byteLimit) {
      throw new Error("Image exceeds maximum allowed size.");
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawTargetUrl = url.searchParams.get("url")?.trim() || "";
    if (!rawTargetUrl) {
      return NextResponse.json(
        { ok: false, error: "Missing url query parameter." },
        { status: 400 }
      );
    }

    const targetUrl = new URL(rawTargetUrl);
    if (targetUrl.protocol !== "https:") {
      return NextResponse.json(
        { ok: false, error: "Only HTTPS image URLs are supported." },
        { status: 400 }
      );
    }
    if (targetUrl.username || targetUrl.password) {
      return NextResponse.json(
        { ok: false, error: "Credentialed URLs are not allowed." },
        { status: 400 }
      );
    }

    assertSafeRemoteHost(targetUrl.hostname);

    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      abortController.abort();
    }, REQUEST_TIMEOUT_MS);

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(targetUrl.toString(), {
        method: "GET",
        redirect: "follow",
        cache: "force-cache",
        signal: abortController.signal,
        headers: {
          Accept: "image/*",
          "User-Agent": "GrapeHubImageProxy/1.0"
        }
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `Image fetch failed with status ${upstreamResponse.status}.`
        },
        { status: 502 }
      );
    }

    const contentType = (upstreamResponse.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { ok: false, error: "Remote asset is not an image." },
        { status: 415 }
      );
    }

    if (contentType === "image/svg+xml" || contentType.includes("svg")) {
      return NextResponse.json(
        { ok: false, error: "SVG images are not allowed." },
        { status: 415 }
      );
    }

    const contentLength = Number(upstreamResponse.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Image exceeds maximum allowed size." },
        { status: 413 }
      );
    }

    const payload = await readBodyWithLimit(upstreamResponse, MAX_IMAGE_BYTES);

    return new NextResponse(payload, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control":
          "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (unknownError) {
    const message =
      unknownError instanceof Error ? unknownError.message : "Image proxy failed.";
    const isTimeout = /abort|timed out|timeout/i.test(message);
    const status = isTimeout ? 504 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
