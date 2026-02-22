export const SHYFT_API_BASE = "https://api.shyft.to";
export const SHYFT_NETWORK = "mainnet-beta";

export function extractShyftApiKeyFromRpcEndpoint(endpoint: string) {
  try {
    const parsed = new URL(endpoint);
    if (!parsed.hostname.includes("shyft.to")) {
      return null;
    }
    const apiKey = parsed.searchParams.get("api_key");
    return apiKey?.trim() || null;
  } catch {
    return null;
  }
}

export function buildShyftUrl(
  path: string,
  params: Record<string, string | number | boolean | undefined>
) {
  const url = new URL(path, SHYFT_API_BASE);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

export async function fetchShyft<T>(
  apiKey: string,
  path: string,
  params: Record<string, string | number | boolean | undefined>
) {
  const response = await fetch(buildShyftUrl(path, params), {
    method: "GET",
    headers: {
      "x-api-key": apiKey
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Shyft API request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export function extractShyftResultArray<T>(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return [] as T[];
  }

  const result = (payload as { result?: unknown }).result;
  if (Array.isArray(result)) {
    return result as T[];
  }
  if (!result || typeof result !== "object") {
    return [] as T[];
  }

  const candidateKeys = ["data", "items", "nfts", "tokens", "stake_accounts"];
  for (const key of candidateKeys) {
    const value = (result as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      return value as T[];
    }
  }

  return [] as T[];
}
