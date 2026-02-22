import { NextResponse } from "next/server";
import { createRequire } from "module";
import { Buffer } from "buffer";

export const runtime = "nodejs";
export const maxDuration = 60;

const require = createRequire(import.meta.url);
const TRUTHY_RE = /^(1|true|yes|on)$/i;

type IrysUploader = {
  getPrice: (size: number) => Promise<unknown>;
  getBalance: () => Promise<unknown>;
  fund: (amount: bigint) => Promise<unknown>;
  upload: (
    data: Buffer,
    options: { tags: Array<{ name: string; value: string }> }
  ) => Promise<unknown>;
};

function mustEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function boolEnv(name: string, fallback = false) {
  const raw = process.env[name];
  if (raw == null) {
    return fallback;
  }
  return TRUTHY_RE.test(raw.trim());
}

function intEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    return BigInt(String(value));
  }
  if (
    value &&
    typeof value === "object" &&
    "toString" in value &&
    typeof value.toString === "function"
  ) {
    return BigInt(value.toString());
  }
  throw new Error("Unable to convert value to bigint.");
}

async function withTimeout<T>(
  label: string,
  promise: Promise<T>,
  ms: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms
      );
      promise.then(resolve).catch(reject);
    });
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function resolveIrysRpcUrl(network: "mainnet" | "devnet") {
  if (process.env.IRYS_RPC_URL) {
    return process.env.IRYS_RPC_URL;
  }
  if (network === "mainnet") {
    return (
      process.env.NEXT_PUBLIC_RPC_SHYFT_MAINNET ||
      process.env.NEXT_PUBLIC_SOLANA_DEFAULT_RPC_URL ||
      null
    );
  }
  return process.env.NEXT_PUBLIC_RPC_SHYFT_DEVNET || null;
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const provider = (url.searchParams.get("provider") || "irys").toLowerCase();
    if (provider !== "irys") {
      return NextResponse.json(
        { ok: false, error: "Provider not supported yet" },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType =
      (form.get("contentType") as string) || file.type || "application/octet-stream";

    const maxUploadBytes = intEnv("IRYS_MAX_UPLOAD_BYTES", 10 * 1024 * 1024);
    if (buffer.length > maxUploadBytes) {
      return NextResponse.json(
        {
          ok: false,
          error: `File too large for server upload (${buffer.length} bytes > ${maxUploadBytes} bytes)`
        },
        { status: 413 }
      );
    }

    const { Uploader } = require("@irys/upload");
    const { Solana } = require("@irys/upload-solana");

    const network = (process.env.IRYS_NETWORK || "mainnet").toLowerCase();
    const normalizedNetwork: "mainnet" | "devnet" =
      network === "devnet" ? "devnet" : "mainnet";
    const rpcUrl = resolveIrysRpcUrl(normalizedNetwork);
    const opTimeoutMs = intEnv("IRYS_OP_TIMEOUT_MS", 8000);
    const uploadTimeoutMs = intEnv("IRYS_UPLOAD_TIMEOUT_MS", 25000);
    const autoFund = boolEnv("IRYS_AUTO_FUND", false);

    const keyRaw = mustEnv("IRYS_SOLANA_PRIVATE_KEY");
    let walletKey: unknown;
    try {
      walletKey = JSON.parse(keyRaw);
    } catch {
      throw new Error("IRYS_SOLANA_PRIVATE_KEY must be valid JSON");
    }

    const initPromise =
      normalizedNetwork === "mainnet"
        ? (Uploader(Solana).withWallet(walletKey).mainnet() as Promise<IrysUploader>)
        : rpcUrl
          ? (Uploader(Solana)
              .withWallet(walletKey)
              .withRpc(rpcUrl)
              .devnet() as Promise<IrysUploader>)
          : (Uploader(Solana).withWallet(walletKey).devnet() as Promise<IrysUploader>);

    const uploader = await withTimeout<IrysUploader>(
      "Irys client initialization",
      initPromise,
      opTimeoutMs
    );

    const [priceAny, balanceAny] = await Promise.all([
      withTimeout("Irys getPrice", uploader.getPrice(buffer.length), opTimeoutMs),
      withTimeout("Irys getBalance", uploader.getBalance(), opTimeoutMs)
    ]);

    const price = toBigInt(priceAny);
    const balance = toBigInt(balanceAny);
    if (balance < price) {
      const deficit = price - balance;
      if (!autoFund) {
        return NextResponse.json(
          {
            ok: false,
            error: `Irys balance too low. Needed ${price.toString()}, available ${balance.toString()}. Top up wallet or set IRYS_AUTO_FUND=true.`
          },
          { status: 402 }
        );
      }
      const topUp = deficit + price;
      await withTimeout(
        "Irys fund",
        uploader.fund(topUp),
        Math.max(opTimeoutMs, 20000)
      );
    }

    const receipt = await withTimeout(
      "Irys upload",
      uploader.upload(buffer, {
        tags: [{ name: "Content-Type", value: contentType }]
      }),
      uploadTimeoutMs
    );

    const uploadId =
      receipt && typeof receipt === "object" && "id" in receipt
        ? (receipt.id as string | undefined)
        : undefined;
    if (!uploadId) {
      throw new Error("Upload failed: missing receipt id");
    }

    const gateway = process.env.IRYS_GATEWAY_URL || "https://gateway.irys.xyz";
    const publicUrl = `${gateway}/${uploadId}`;
    return NextResponse.json({ ok: true, id: uploadId, url: publicUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Upload failed";
    const status = /timed out/i.test(message)
      ? 504
      : /Missing env:/i.test(message) || /IRYS_SOLANA_PRIVATE_KEY/i.test(message)
        ? 500
        : 500;

    console.error("[api/storage/upload] error:", message);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
