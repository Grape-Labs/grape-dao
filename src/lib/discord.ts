type SendDiscordMessageInput = {
  botToken: string;
  channelId: string;
  content: string;
};

type DiscordMessageResponse = {
  id?: string;
};

function trimToDiscordLimit(content: string) {
  const normalized = content.trim();
  if (normalized.length <= 2000) {
    return normalized;
  }
  return `${normalized.slice(0, 1997)}...`;
}

export async function sendDiscordChannelMessage({
  botToken,
  channelId,
  content
}: SendDiscordMessageInput) {
  const safeContent = trimToDiscordLimit(content);
  if (!safeContent) {
    throw new Error("Discord message content is empty.");
  }

  const response = await fetch(
    `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: safeContent,
        allowed_mentions: {
          parse: []
        }
      }),
      cache: "no-store"
    }
  );

  const responseText = await response.text();
  let payload: unknown = null;
  try {
    payload = responseText ? (JSON.parse(responseText) as unknown) : null;
  } catch {
    payload = responseText || null;
  }

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message || "Discord API request failed.")
        : `Discord API request failed (${response.status}).`;
    throw new Error(errorMessage);
  }

  const parsed = payload as DiscordMessageResponse | null;
  return {
    messageId: parsed?.id || null
  };
}
