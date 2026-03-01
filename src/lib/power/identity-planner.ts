import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createRevokeInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import { Buffer } from "buffer";
import type { ParsedAccountData } from "@solana/web3.js";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  type TransactionInstruction
} from "@solana/web3.js";

const DEFAULT_RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_DEFAULT_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

export type PlannerTokenAccount = {
  account: string;
  mint: string;
  tokenProgramId: string;
  rawAmount: string;
  decimals: number;
  accountState: string;
  delegate: string | null;
  closeAuthority: string | null;
  isZeroBalance: boolean;
};

export type WalletSnapshot = {
  owner: string;
  rpcEndpoint: string;
  solLamports: number;
  sol: number;
  tokenAccounts: PlannerTokenAccount[];
  updatedAt: string;
};

export type SerializableInstruction = {
  programId: string;
  accounts: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  dataBase64: string;
};

export type InstructionBatch = {
  label: string;
  instructionCount: number;
  instructions: SerializableInstruction[];
};

type RevokePlanSummary = {
  owner: string;
  rpcEndpoint: string;
  delegatedAccounts: number;
  revocableAccounts: number;
  frozenSkipped: number;
  transactionCount: number;
};

type RevokePlanResult = {
  summary: RevokePlanSummary;
  batches: InstructionBatch[];
  warnings: string[];
};

type SweepPlanSummary = {
  owner: string;
  safeWallet: string;
  rpcEndpoint: string;
  tokenSweeps: number;
  ataCreations: number;
  solSweepLamports: number;
  solSweep: number;
  transactionCount: number;
};

type SweepPlanResult = {
  summary: SweepPlanSummary;
  batches: InstructionBatch[];
  warnings: string[];
};

type BuildRevokePlanInput = {
  connection: Connection;
  owner: PublicKey;
  rpcEndpoint: string;
  maxInstructionsPerTx: number;
};

type BuildSweepPlanInput = {
  connection: Connection;
  owner: PublicKey;
  safeWallet: PublicKey;
  reserveSol: number;
  rpcEndpoint: string;
  maxInstructionsPerTx: number;
};

function chunkInstructions(
  label: string,
  instructions: TransactionInstruction[],
  chunkSize: number
): InstructionBatch[] {
  const batches: InstructionBatch[] = [];
  if (instructions.length === 0) {
    return batches;
  }
  for (let index = 0; index < instructions.length; index += chunkSize) {
    const batchInstructions = instructions.slice(index, index + chunkSize);
    const batchIndex = Math.floor(index / chunkSize) + 1;
    const totalBatches = Math.ceil(instructions.length / chunkSize);
    batches.push({
      label: `${label} (${batchIndex}/${totalBatches})`,
      instructionCount: batchInstructions.length,
      instructions: batchInstructions.map(serializeInstruction)
    });
  }
  return batches;
}

function serializeInstruction(instruction: TransactionInstruction): SerializableInstruction {
  return {
    programId: instruction.programId.toBase58(),
    accounts: instruction.keys.map((key) => ({
      pubkey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable
    })),
    dataBase64: Buffer.from(instruction.data).toString("base64")
  };
}

function resolveTokenProgramId(tokenProgramId: string) {
  if (tokenProgramId === TOKEN_2022_PROGRAM_ID.toBase58()) {
    return TOKEN_2022_PROGRAM_ID;
  }
  return TOKEN_PROGRAM_ID;
}

function parseReserveSol(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0.02;
}

function parseMaxInstructionsPerTx(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return fallback;
}

export function parseRpcEndpoint(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return DEFAULT_RPC_ENDPOINT;
  }
  const normalized = value.trim();
  try {
    const parsed = new URL(normalized);
    if (!parsed.protocol.startsWith("http")) {
      return DEFAULT_RPC_ENDPOINT;
    }
    return normalized;
  } catch {
    return DEFAULT_RPC_ENDPOINT;
  }
}

export function parsePublicKey(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  try {
    return new PublicKey(value.trim());
  } catch {
    throw new Error(`${field} must be a valid Solana address.`);
  }
}

export function createConnection(rpcEndpoint?: unknown) {
  return new Connection(parseRpcEndpoint(rpcEndpoint), "confirmed");
}

export async function loadWalletSnapshot(
  connection: Connection,
  owner: PublicKey,
  rpcEndpoint: string
): Promise<WalletSnapshot> {
  const [balanceLamports, tokenAccounts, token2022Accounts] = await Promise.all([
    connection.getBalance(owner, "confirmed"),
    connection.getParsedTokenAccountsByOwner(
      owner,
      { programId: TOKEN_PROGRAM_ID },
      "confirmed"
    ),
    connection.getParsedTokenAccountsByOwner(
      owner,
      { programId: TOKEN_2022_PROGRAM_ID },
      "confirmed"
    )
  ]);

  const allAccounts = [...tokenAccounts.value, ...token2022Accounts.value]
    .map((entry) => {
      const parsedData = entry.account.data as ParsedAccountData;
      const tokenAmount = parsedData.parsed.info.tokenAmount as {
        amount: string;
        decimals: number;
      };

      return {
        account: entry.pubkey.toBase58(),
        mint: parsedData.parsed.info.mint as string,
        tokenProgramId: entry.account.owner.toBase58(),
        rawAmount: tokenAmount.amount,
        decimals: tokenAmount.decimals,
        accountState:
          (parsedData.parsed.info.state as string | undefined) ?? "unknown",
        delegate: (parsedData.parsed.info.delegate as string | undefined) ?? null,
        closeAuthority:
          (parsedData.parsed.info.closeAuthority as string | undefined) ?? null,
        isZeroBalance: tokenAmount.amount === "0"
      } satisfies PlannerTokenAccount;
    })
    .sort((left, right) => {
      const leftAmount = BigInt(left.rawAmount);
      const rightAmount = BigInt(right.rawAmount);
      if (leftAmount === rightAmount) {
        return 0;
      }
      return leftAmount > rightAmount ? -1 : 1;
    });

  return {
    owner: owner.toBase58(),
    rpcEndpoint,
    solLamports: balanceLamports,
    sol: balanceLamports / LAMPORTS_PER_SOL,
    tokenAccounts: allAccounts,
    updatedAt: new Date().toISOString()
  };
}

export async function buildRevokeDelegatesPlan(
  input: BuildRevokePlanInput
): Promise<RevokePlanResult> {
  const wallet = await loadWalletSnapshot(
    input.connection,
    input.owner,
    input.rpcEndpoint
  );

  const warnings: string[] = [];
  let frozenSkipped = 0;
  const delegatedAccounts = wallet.tokenAccounts.filter((account) =>
    Boolean(account.delegate)
  );
  const revokeInstructions = delegatedAccounts
    .filter((account) => {
      if (account.accountState === "frozen") {
        frozenSkipped += 1;
        return false;
      }
      return true;
    })
    .map((account) =>
      createRevokeInstruction(
        new PublicKey(account.account),
        input.owner,
        [],
        resolveTokenProgramId(account.tokenProgramId)
      )
    );

  if (delegatedAccounts.length === 0) {
    warnings.push("No delegated accounts were found.");
  }
  if (frozenSkipped > 0) {
    warnings.push(
      `${frozenSkipped} delegated account(s) were frozen and skipped.`
    );
  }

  const batches = chunkInstructions(
    "Revoke Delegates",
    revokeInstructions,
    input.maxInstructionsPerTx
  );

  return {
    summary: {
      owner: wallet.owner,
      rpcEndpoint: wallet.rpcEndpoint,
      delegatedAccounts: delegatedAccounts.length,
      revocableAccounts: revokeInstructions.length,
      frozenSkipped,
      transactionCount: batches.length
    },
    batches,
    warnings
  };
}

export async function buildSweepPlan(
  input: BuildSweepPlanInput
): Promise<SweepPlanResult> {
  const wallet = await loadWalletSnapshot(
    input.connection,
    input.owner,
    input.rpcEndpoint
  );
  if (input.safeWallet.equals(input.owner)) {
    throw new Error("safeWallet must be different from owner.");
  }

  const warnings: string[] = [];
  const tokenInstructions: TransactionInstruction[] = [];
  const createdAtaSet = new Set<string>();
  let tokenSweeps = 0;
  let ataCreations = 0;

  wallet.tokenAccounts.forEach((account) => {
    const amount = BigInt(account.rawAmount);
    if (amount <= 0n) {
      return;
    }

    const tokenProgramId = resolveTokenProgramId(account.tokenProgramId);
    const mint = new PublicKey(account.mint);
    const source = new PublicKey(account.account);
    const destinationAta = getAssociatedTokenAddressSync(
      mint,
      input.safeWallet,
      false,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const ataKey = `${destinationAta.toBase58()}:${tokenProgramId.toBase58()}`;
    if (!createdAtaSet.has(ataKey)) {
      createdAtaSet.add(ataKey);
      tokenInstructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          input.owner,
          destinationAta,
          input.safeWallet,
          mint,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      ataCreations += 1;
    }

    tokenInstructions.push(
      createTransferCheckedInstruction(
        source,
        mint,
        destinationAta,
        input.owner,
        amount,
        account.decimals,
        [],
        tokenProgramId
      )
    );
    tokenSweeps += 1;
  });

  if (tokenSweeps === 0) {
    warnings.push("No non-zero token balances found to sweep.");
  }

  const tokenBatches = chunkInstructions(
    "Sweep Tokens",
    tokenInstructions,
    input.maxInstructionsPerTx
  );

  const reserveLamports = Math.floor(parseReserveSol(input.reserveSol) * LAMPORTS_PER_SOL);
  const solSweepLamports = Math.max(0, wallet.solLamports - reserveLamports);
  const solBatches: InstructionBatch[] =
    solSweepLamports > 0
      ? chunkInstructions(
          "Sweep SOL",
          [
            SystemProgram.transfer({
              fromPubkey: input.owner,
              toPubkey: input.safeWallet,
              lamports: solSweepLamports
            })
          ],
          1
        )
      : [];
  if (solSweepLamports <= 0) {
    warnings.push("SOL sweep skipped because balance is below reserve.");
  }

  const batches = [...tokenBatches, ...solBatches];

  return {
    summary: {
      owner: wallet.owner,
      safeWallet: input.safeWallet.toBase58(),
      rpcEndpoint: wallet.rpcEndpoint,
      tokenSweeps,
      ataCreations,
      solSweepLamports,
      solSweep: solSweepLamports / LAMPORTS_PER_SOL,
      transactionCount: batches.length
    },
    batches,
    warnings
  };
}

export function parsePlanBody(value: unknown) {
  const body = (value || {}) as Record<string, unknown>;
  const rpcEndpoint = parseRpcEndpoint(body.rpcEndpoint);
  const owner = parsePublicKey(body.owner, "owner");
  const maxInstructionsPerTx = parseMaxInstructionsPerTx(
    body.maxInstructionsPerTx,
    8
  );
  return {
    rpcEndpoint,
    owner,
    maxInstructionsPerTx,
    safeWallet: body.safeWallet,
    reserveSol: parseReserveSol(body.reserveSol)
  };
}
