import { NextRequest, NextResponse } from "next/server";
import { sendDiscordChannelMessage } from "@/lib/discord";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return true;
  }
  const authorization = request.headers.get("authorization") || "";
  return authorization === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized cron request." },
      { status: 401 }
    );
  }

  const botToken = process.env.DISCORD_BOT_TOKEN?.trim() || "";
  const channelId = process.env.DISCORD_CHANNEL_ID?.trim() || "";

  if (!botToken) {
    return NextResponse.json(
      { ok: false, error: "Missing DISCORD_BOT_TOKEN." },
      { status: 500 }
    );
  }
  if (!channelId) {
    return NextResponse.json(
      { ok: false, error: "Missing DISCORD_CHANNEL_ID." },
      { status: 500 }
    );
  }

  const defaultMessage = `Grape cron heartbeat: ${new Date().toISOString()}`;
  const messageTemplate = process.env.DISCORD_CRON_MESSAGE?.trim();

  try {
    const postResult = await sendDiscordChannelMessage({
      botToken,
      channelId,
      content: messageTemplate || defaultMessage
    });

    return NextResponse.json({
      ok: true,
      channelId,
      messageId: postResult.messageId
    });
  } catch (unknownError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to post message to Discord."
      },
      { status: 502 }
    );
  }
}
