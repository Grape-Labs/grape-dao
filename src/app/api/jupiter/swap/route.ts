import { NextRequest, NextResponse } from "next/server";

const JUPITER_SWAP_URL = "https://api.jup.ag/swap/v1/swap";

export async function POST(request: NextRequest) {
  const apiKey = process.env.NEXT_JUP_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing NEXT_JUP_API_KEY on server." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const upstreamResponse = await fetch(JUPITER_SWAP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify(body),
      cache: "no-store"
    });

    const responseText = await upstreamResponse.text();
    let payload: unknown = { error: responseText || "Upstream swap request failed." };
    try {
      payload = JSON.parse(responseText);
    } catch {
      // keep text fallback payload
    }

    return NextResponse.json(payload, { status: upstreamResponse.status });
  } catch (unknownError) {
    return NextResponse.json(
      {
        error:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to fetch Jupiter swap transaction."
      },
      { status: 502 }
    );
  }
}
