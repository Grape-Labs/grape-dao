import { NextRequest, NextResponse } from "next/server";

const HELIUS_TRANSACTIONS_URL = "https://api.helius.xyz/v0/transactions/";

function extractFirstEnhancedTransaction(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload[0] ?? null;
  }
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const result = (payload as { result?: unknown }).result;
  if (Array.isArray(result)) {
    return result[0] ?? null;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.NEXT_HELIUS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing NEXT_HELIUS_API_KEY on server." },
      { status: 500 }
    );
  }

  const signature = request.nextUrl.searchParams.get("signature")?.trim() || "";
  if (!signature) {
    return NextResponse.json(
      { ok: false, error: "Missing signature query parameter." },
      { status: 400 }
    );
  }

  const upstreamUrl = new URL(HELIUS_TRANSACTIONS_URL);
  upstreamUrl.searchParams.set("api-key", apiKey);

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ transactions: [signature] }),
      cache: "no-store"
    });

    const responseText = await upstreamResponse.text();
    let payload: unknown = null;
    try {
      payload = responseText ? (JSON.parse(responseText) as unknown) : null;
    } catch {
      payload = responseText || null;
    }

    if (!upstreamResponse.ok) {
      const errorMessage =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: unknown }).error || "Upstream request failed.")
          : `Helius request failed (${upstreamResponse.status}).`;
      return NextResponse.json(
        {
          ok: false,
          error: errorMessage
        },
        { status: upstreamResponse.status }
      );
    }

    const transaction = extractFirstEnhancedTransaction(payload);
    return NextResponse.json({
      ok: true,
      transaction
    });
  } catch (unknownError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to fetch Helius enhanced transaction."
      },
      { status: 502 }
    );
  }
}
