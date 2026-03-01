import { NextRequest, NextResponse } from "next/server";
import {
  buildSweepPlan,
  createConnection,
  parsePlanBody,
  parsePublicKey
} from "@/lib/power/identity-planner";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parsePlanBody(body);
    const safeWallet = parsePublicKey(parsed.safeWallet, "safeWallet");
    const connection = createConnection(parsed.rpcEndpoint);

    const result = await buildSweepPlan({
      connection,
      owner: parsed.owner,
      safeWallet,
      reserveSol: parsed.reserveSol,
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
            : "Failed to build sweep plan."
      },
      { status: 400 }
    );
  }
}
