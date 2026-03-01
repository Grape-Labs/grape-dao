import { NextRequest, NextResponse } from "next/server";
import {
  createConnection,
  loadWalletSnapshot,
  parsePublicKey,
  parseRpcEndpoint
} from "@/lib/power/identity-planner";

export async function GET(request: NextRequest) {
  try {
    const owner = parsePublicKey(
      request.nextUrl.searchParams.get("owner"),
      "owner"
    );
    const rpcEndpoint = parseRpcEndpoint(
      request.nextUrl.searchParams.get("rpcEndpoint")
    );
    const connection = createConnection(rpcEndpoint);
    const snapshot = await loadWalletSnapshot(connection, owner, rpcEndpoint);

    return NextResponse.json({
      ok: true,
      snapshot
    });
  } catch (unknownError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to load holdings."
      },
      { status: 400 }
    );
  }
}
