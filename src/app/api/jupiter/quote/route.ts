import { NextRequest, NextResponse } from "next/server";

const JUPITER_QUOTE_URL = "https://api.jup.ag/swap/v1/quote";

export async function GET(request: NextRequest) {
  const apiKey = process.env.NEXT_JUP_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing NEXT_JUP_API_KEY on server." },
      { status: 500 }
    );
  }

  const upstreamUrl = new URL(JUPITER_QUOTE_URL);
  request.nextUrl.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.set(key, value);
  });

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: {
        "x-api-key": apiKey
      },
      cache: "no-store"
    });

    const responseText = await upstreamResponse.text();
    let payload: unknown = { error: responseText || "Upstream quote request failed." };
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
            : "Failed to fetch Jupiter quote."
      },
      { status: 502 }
    );
  }
}
