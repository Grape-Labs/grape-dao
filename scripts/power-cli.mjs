#!/usr/bin/env node

const DEFAULT_BASE_URL = process.env.POWER_API_BASE_URL || "http://localhost:3000";

function parseArgs(args) {
  const parsed = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current.startsWith("--")) {
      parsed._.push(current);
      continue;
    }
    const key = current.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function usage() {
  console.log(
    [
      "Power CLI",
      "",
      "Usage:",
      "  npm run power:cli -- holdings --owner <PUBKEY> [--rpc-endpoint <URL>]",
      "  npm run power:cli -- revoke-plan --owner <PUBKEY> [--rpc-endpoint <URL>] [--batch-size 8]",
      "  npm run power:cli -- sweep-plan --owner <PUBKEY> --safe-wallet <PUBKEY> [--reserve-sol 0.02] [--rpc-endpoint <URL>] [--batch-size 6]",
      "",
      "Optional:",
      "  --base-url <URL>   (default http://localhost:3000)",
      "  --json             (print compact JSON)"
    ].join("\n")
  );
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return payload;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const command = parsed._[0];

  if (!command || parsed.help || parsed.h) {
    usage();
    process.exit(0);
  }

  const baseUrl = String(parsed["base-url"] || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const owner = typeof parsed.owner === "string" ? parsed.owner.trim() : "";
  const rpcEndpoint =
    typeof parsed["rpc-endpoint"] === "string"
      ? parsed["rpc-endpoint"].trim()
      : "";

  if (!owner) {
    console.error("Missing --owner");
    usage();
    process.exit(1);
  }

  let result;

  if (command === "holdings") {
    const url = new URL(`${baseUrl}/api/power/holdings`);
    url.searchParams.set("owner", owner);
    if (rpcEndpoint) {
      url.searchParams.set("rpcEndpoint", rpcEndpoint);
    }
    result = await requestJson(url.toString(), { method: "GET" });
  } else if (command === "revoke-plan") {
    const body = {
      owner,
      rpcEndpoint: rpcEndpoint || undefined,
      maxInstructionsPerTx: parsed["batch-size"]
    };
    result = await requestJson(`${baseUrl}/api/power/revoke-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } else if (command === "sweep-plan") {
    const safeWallet =
      typeof parsed["safe-wallet"] === "string"
        ? parsed["safe-wallet"].trim()
        : "";
    if (!safeWallet) {
      console.error("Missing --safe-wallet");
      usage();
      process.exit(1);
    }
    const body = {
      owner,
      safeWallet,
      reserveSol: parsed["reserve-sol"],
      rpcEndpoint: rpcEndpoint || undefined,
      maxInstructionsPerTx: parsed["batch-size"]
    };
    result = await requestJson(`${baseUrl}/api/power/sweep-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } else {
    console.error(`Unknown command: ${command}`);
    usage();
    process.exit(1);
  }

  const asJson = Boolean(parsed.json);
  if (asJson) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
