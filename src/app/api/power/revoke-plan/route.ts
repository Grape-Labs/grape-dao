import { NextRequest, NextResponse } from "next/server";
import {
  buildRevokeDelegatesPlan,
  createConnection,
  parsePlanBody
} from "@/lib/power/identity-planner";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parsePlanBody(body);
    const connection = createConnection(parsed.rpcEndpoint);

    const result = await buildRevokeDelegatesPlan({
      connection,
      owner: parsed.owner,
      rpcEndpoint: parsed.rpcEndpoint,
      maxInstructionsPerTx: parsed.maxInstructionsPerTx
    });

    return NextResponse.json({
      ok: true,
      result
    });
  } catch (unknownError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to build revoke plan."
      },
      { status: 400 }
    );
  }
}
