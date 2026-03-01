"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createBurnCheckedInstruction,
  createCloseAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import { MPL_TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import {
  type TransactionInstruction,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction as Web3TransactionInstruction
} from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Link,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import type { WalletHoldingsState } from "@/hooks/use-wallet-holdings";
import { useTokenMetadata } from "@/hooks/use-token-metadata";

type IdentityActionsProps = {
  holdingsState: WalletHoldingsState;
};

type ActionMode =
  | "send-sol"
  | "send-token"
  | "burn"
  | "close"
  | "metaplex-burn";
type StatusState = {
  severity: "success" | "error";
  message: string;
  signature?: string;
} | null;
type TokenDelta = {
  asset: string;
  amount: string;
  direction: "in" | "out";
};
type PreparedAction = {
  label: string;
  instructions: TransactionInstruction[];
  tokenDeltas: TokenDelta[];
  rentImpactLamports: number;
  riskFlags: string[];
};
type DecodedInstruction = {
  programId: string;
  programLabel: string;
  accounts: string[];
  dataLength: number;
};
type SimulationPreview = {
  label: string;
  feeLamports: number | null;
  rentImpactLamports: number;
  tokenDeltas: TokenDelta[];
  riskFlags: string[];
  instructions: DecodedInstruction[];
  logs: string[];
  error: string | null;
};
type PreflightFailureHint = {
  id: string;
  title: string;
  evidence: string;
  fixSteps: string[];
};

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID);
const IDENTITY_MEDIA_PREF_STORAGE_KEY = "grapehub.identity.media.enabled";
const IDENTITY_MEDIA_PREF_EVENT = "grapehub:identity-media-preference";

const PROGRAM_LABELS: Record<string, string> = {
  [SystemProgram.programId.toBase58()]: "System Program",
  [TOKEN_PROGRAM_ID.toBase58()]: "SPL Token Program",
  [ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()]: "Associated Token Program",
  [TOKEN_METADATA_PROGRAM_ID.toBase58()]: "Metaplex Token Metadata"
};

function parseAmountToBaseUnits(input: string, decimals: number): bigint {
  const normalized = input.trim();
  if (!normalized) {
    throw new Error("Amount is required.");
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Amount must be a positive number.");
  }

  const [wholePart, fractionPartRaw = ""] = normalized.split(".");
  if (fractionPartRaw.length > decimals) {
    throw new Error(`Amount exceeds ${decimals} decimal places.`);
  }

  const paddedFraction = fractionPartRaw.padEnd(decimals, "0");
  const combined = `${wholePart}${paddedFraction}`.replace(/^0+/, "") || "0";
  return BigInt(combined);
}

function shortenAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function findMetadataPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer()
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

function findMasterEditionPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from("edition")
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

function decodeInstructions(
  instructions: TransactionInstruction[]
): DecodedInstruction[] {
  return instructions.map((instruction) => {
    const programId = instruction.programId.toBase58();
    return {
      programId,
      programLabel: PROGRAM_LABELS[programId] || "Unknown Program",
      accounts: instruction.keys.map((key) => {
        const flags = [
          key.isSigner ? "S" : null,
          key.isWritable ? "W" : null
        ]
          .filter(Boolean)
          .join("/");
        return `${key.pubkey.toBase58()}${flags ? ` [${flags}]` : ""}`;
      }),
      dataLength: instruction.data.length
    };
  });
}

function formatSimulationError(value: unknown) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function resolveMetadataUri(uri: string) {
  const normalized = uri.replace(/\0/g, "").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${normalized.slice("ipfs://".length)}`;
  }
  return normalized;
}

function buildTokenImageProxyUrl(source: string, enabled: boolean) {
  if (!enabled) {
    return null;
  }
  const resolved = resolveMetadataUri(source);
  if (!resolved) {
    return null;
  }
  return `/api/media/token-image?url=${encodeURIComponent(resolved)}`;
}

function formatUiAmount(value: number, decimals = 9) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }
  return value
    .toLocaleString("en-US", {
      useGrouping: false,
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals
    })
    .replace(/\.?0+$/, "");
}

function decodePreflightFailure(
  error: string | null,
  logs: string[],
  instructions: DecodedInstruction[]
): PreflightFailureHint[] {
  if (!error) {
    return [];
  }

  const joinedLogs = logs.join("\n");
  const combined = `${error}\n${joinedLogs}`;
  const normalized = combined.toLowerCase();
  const hints: PreflightFailureHint[] = [];

  const addHint = (hint: PreflightFailureHint) => {
    if (hints.some((existing) => existing.id === hint.id)) {
      return;
    }
    hints.push(hint);
  };
  const findEvidence = (pattern: RegExp, fallback: string) => {
    const match = combined.match(pattern);
    return match?.[0] || fallback;
  };
  const hasTokenProgram = instructions.some(
    (instruction) => instruction.programId === TOKEN_PROGRAM_ID.toBase58()
  );

  if (/account is frozen|custom program error:\s*0x11/i.test(combined)) {
    addHint({
      id: "frozen-account",
      title: "Frozen Token Account",
      evidence: findEvidence(
        /account is frozen|custom program error:\s*0x11/i,
        "Token program rejected instruction because account is frozen."
      ),
      fixSteps: [
        "Thaw the token account with the mint freeze authority.",
        "Run revoke/transfer again after thaw completes.",
        "If freeze authority is external, coordinate with that authority first."
      ]
    });
  }

  const ataMismatchPattern =
    /associated token account|invalid associated token|address does not match seed derivation|provided owner is not allowed/i;
  if (ataMismatchPattern.test(combined)) {
    addHint({
      id: "ata-mismatch",
      title: "Associated Token Account (ATA) Mismatch",
      evidence: findEvidence(
        ataMismatchPattern,
        "Associated token account constraints failed."
      ),
      fixSteps: [
        "Re-derive destination ATA from exact owner + mint + token program.",
        "Create ATA idempotently before transfer when destination account is missing.",
        "Do not reuse Token ATA derivation for Token-2022 accounts."
      ]
    });
  }

  const mentionsToken = normalized.includes("tokenkegqfezyinwajbnbgkpfxcwubvbf9ss623vq5da");
  const mentionsToken2022 = normalized.includes("tokenzq");
  const wrongTokenProgramPattern =
    /incorrect program id for instruction|invalid account owner for instruction|owner does not match|incorrectprogramid/i;
  if ((mentionsToken && mentionsToken2022) || wrongTokenProgramPattern.test(combined)) {
    addHint({
      id: "wrong-token-program",
      title: "Wrong Token Program Selected",
      evidence: findEvidence(
        wrongTokenProgramPattern,
        "Instruction likely mixed Token and Token-2022 accounts/program IDs."
      ),
      fixSteps: [
        "Use the source token account owner program for each token instruction.",
        "Pass the same program to ATA derivation and ATA creation.",
        hasTokenProgram
          ? "If source is Token-2022, switch builders to TOKEN_2022_PROGRAM_ID."
          : "Verify token program per account before building instructions."
      ]
    });
  }

  const authorityMismatchPattern =
    /missing required signature|signature verification failed|owner does not match|custom program error:\s*0x4/i;
  if (authorityMismatchPattern.test(combined)) {
    addHint({
      id: "authority-mismatch",
      title: "Authority / Signer Mismatch",
      evidence: findEvidence(
        authorityMismatchPattern,
        "Instruction signer does not match required authority."
      ),
      fixSteps: [
        "Confirm connected wallet is the required authority (owner/delegate/close/mint/freeze).",
        "For multisig authorities, include all required signer accounts.",
        "Check that account owner and authority fields were not rotated to another wallet."
      ]
    });
  }

  if (/allocate: account .* already in use|already in use/i.test(combined)) {
    addHint({
      id: "account-already-in-use",
      title: "PDA or Account Already Exists",
      evidence: findEvidence(
        /allocate: account .* already in use|already in use/i,
        "System allocate failed because target account already exists."
      ),
      fixSteps: [
        "Use a new unique seed/index when deriving the account PDA.",
        "For claim flows, avoid reusing the same (distributor, claimant, index) tuple.",
        "If close is allowed, close the existing record first, then retry."
      ]
    });
  }

  if (hints.length === 0) {
    addHint({
      id: "generic",
      title: "Unclassified Preflight Failure",
      evidence: error,
      fixSteps: [
        "Inspect runtime logs to locate first failing program invocation.",
        "Verify account ownership, signer set, and program IDs for that instruction.",
        "Re-run with a smaller transaction to isolate the failing instruction."
      ]
    });
  }

  return hints;
}

export function IdentityActions({ holdingsState }: IdentityActionsProps) {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { holdings, refresh } = holdingsState;

  const [mode, setMode] = useState<ActionMode>("send-sol");
  const [status, setStatus] = useState<StatusState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationPreview, setSimulationPreview] =
    useState<SimulationPreview | null>(null);

  const [solRecipient, setSolRecipient] = useState("");
  const [solAmount, setSolAmount] = useState("");

  const [tokenSourceAccount, setTokenSourceAccount] = useState("");
  const [tokenRecipient, setTokenRecipient] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");

  const [burnSourceAccount, setBurnSourceAccount] = useState("");
  const [burnAmount, setBurnAmount] = useState("");

  const [closeSourceAccount, setCloseSourceAccount] = useState("");
  const [metaplexSourceAccount, setMetaplexSourceAccount] = useState("");
  const [isMediaEnabled, setIsMediaEnabled] = useState(false);

  const positiveAccounts = useMemo(
    () => holdings.tokenAccounts.filter((account) => !account.isZeroBalance),
    [holdings.tokenAccounts]
  );
  const closeableAccounts = useMemo(
    () => holdings.tokenAccounts.filter((account) => account.isZeroBalance),
    [holdings.tokenAccounts]
  );
  const metaplexNftCandidates = useMemo(
    () =>
      holdings.tokenAccounts.filter(
        (account) => account.decimals === 0 && BigInt(account.rawAmount) >= 1n
      ),
    [holdings.tokenAccounts]
  );
  const { getTokenMetadata } = useTokenMetadata(
    holdings.tokenAccounts.map((account) => account.mint)
  );

  const selectedTokenSource = useMemo(
    () => positiveAccounts.find((account) => account.account === tokenSourceAccount),
    [positiveAccounts, tokenSourceAccount]
  );
  const selectedBurnSource = useMemo(
    () => positiveAccounts.find((account) => account.account === burnSourceAccount),
    [positiveAccounts, burnSourceAccount]
  );
  const selectedCloseSource = useMemo(
    () => closeableAccounts.find((account) => account.account === closeSourceAccount),
    [closeSourceAccount, closeableAccounts]
  );
  const selectedMetaplexSource = useMemo(
    () =>
      metaplexNftCandidates.find(
        (account) => account.account === metaplexSourceAccount
      ),
    [metaplexNftCandidates, metaplexSourceAccount]
  );
  const availableSol = holdings.sol;
  const halfSol = useMemo(() => formatUiAmount(availableSol / 2), [availableSol]);
  const maxSol = useMemo(() => formatUiAmount(availableSol), [availableSol]);
  const preflightFailureHints = useMemo(
    () =>
      simulationPreview
        ? decodePreflightFailure(
            simulationPreview.error,
            simulationPreview.logs,
            simulationPreview.instructions
          )
        : [],
    [simulationPreview]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const readPreference = () => {
      const storedPreference = window.localStorage.getItem(
        IDENTITY_MEDIA_PREF_STORAGE_KEY
      );
      setIsMediaEnabled(storedPreference === "true");
    };
    readPreference();

    const onStorage = (event: StorageEvent) => {
      if (event.key === IDENTITY_MEDIA_PREF_STORAGE_KEY) {
        readPreference();
      }
    };
    const onPreferenceEvent = () => {
      readPreference();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(IDENTITY_MEDIA_PREF_EVENT, onPreferenceEvent);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(IDENTITY_MEDIA_PREF_EVENT, onPreferenceEvent);
    };
  }, []);

  async function executePreparedAction(preparedAction: PreparedAction) {
    if (!connected || !publicKey || !sendTransaction) {
      setStatus({
        severity: "error",
        message: "Connect an identity wallet before sending transactions."
      });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    try {
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction({
        feePayer: publicKey,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      }).add(...preparedAction.instructions);

      const signature = await sendTransaction(transaction, connection, {
        preflightCommitment: "confirmed"
      });

      await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
        },
        "confirmed"
      );

      setStatus({
        severity: "success",
        message: `${preparedAction.label} submitted successfully.`,
        signature
      });
      refresh();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Transaction failed."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function simulatePreparedAction(preparedAction: PreparedAction) {
    if (!connected || !publicKey) {
      setStatus({
        severity: "error",
        message: "Connect an identity wallet before simulating transactions."
      });
      return;
    }

    setIsSimulating(true);
    setStatus(null);

    try {
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction({
        feePayer: publicKey,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      }).add(...preparedAction.instructions);

      const [simulationResult, feeResult] = await Promise.all([
        connection.simulateTransaction(transaction),
        connection.getFeeForMessage(transaction.compileMessage(), "confirmed")
      ]);

      const decodedInstructions = decodeInstructions(preparedAction.instructions);
      const unknownProgramFlags = decodedInstructions
        .filter((instruction) => instruction.programLabel === "Unknown Program")
        .map(
          (instruction) =>
            `Unknown program in tx: ${instruction.programId}`
        );
      const riskFlags = Array.from(
        new Set([...preparedAction.riskFlags, ...unknownProgramFlags])
      );

      setSimulationPreview({
        label: preparedAction.label,
        feeLamports: feeResult.value,
        rentImpactLamports: preparedAction.rentImpactLamports,
        tokenDeltas: preparedAction.tokenDeltas,
        riskFlags,
        instructions: decodedInstructions,
        logs: simulationResult.value.logs ?? [],
        error: formatSimulationError(simulationResult.value.err)
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Simulation failed."
      });
    } finally {
      setIsSimulating(false);
    }
  }

  async function prepareSendSolAction(): Promise<PreparedAction> {
    if (!publicKey) {
      throw new Error("Connect an identity wallet first.");
    }

    const recipient = new PublicKey(solRecipient.trim());
    const lamportsAmount = parseAmountToBaseUnits(solAmount, 9);
    if (lamportsAmount <= 0n) {
      throw new Error("SOL amount must be greater than zero.");
    }
    if (lamportsAmount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Amount too large.");
    }

    const riskFlags: string[] = [];
    if (Number(solAmount) > 5) {
      riskFlags.push("Large SOL transfer.");
    }
    if (recipient.toBase58() !== publicKey.toBase58()) {
      riskFlags.push("Recipient is an external wallet.");
    }

    return {
      label: "SOL transfer",
      instructions: [
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: recipient,
          lamports: Number(lamportsAmount)
        })
      ],
      tokenDeltas: [
        {
          asset: "SOL",
          amount: `-${solAmount} SOL`,
          direction: "out"
        }
      ],
      rentImpactLamports: 0,
      riskFlags
    };
  }

  async function prepareSendTokenAction(): Promise<PreparedAction> {
    if (!publicKey) {
      throw new Error("Connect an identity wallet first.");
    }
    if (!selectedTokenSource) {
      throw new Error("Select a source token account.");
    }

    const recipientOwner = new PublicKey(tokenRecipient.trim());
    const mint = new PublicKey(selectedTokenSource.mint);
    const sourceAccount = new PublicKey(selectedTokenSource.account);
    const destinationAta = getAssociatedTokenAddressSync(mint, recipientOwner);
    const amount = parseAmountToBaseUnits(tokenAmount, selectedTokenSource.decimals);

    if (amount <= 0n) {
      throw new Error("Token amount must be greater than zero.");
    }
    if (amount > BigInt(selectedTokenSource.rawAmount)) {
      throw new Error("Amount exceeds token account balance.");
    }

    const instructions: TransactionInstruction[] = [];
    let rentImpactLamports = 0;
    const destinationInfo = await connection.getAccountInfo(destinationAta, "confirmed");
    if (!destinationInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          publicKey,
          destinationAta,
          recipientOwner,
          mint
        )
      );
      const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(165);
      rentImpactLamports -= tokenAccountRent;
    }

    instructions.push(
      createTransferCheckedInstruction(
        sourceAccount,
        mint,
        destinationAta,
        publicKey,
        amount,
        selectedTokenSource.decimals
      )
    );

    const riskFlags: string[] = [];
    if (recipientOwner.toBase58() !== publicKey.toBase58()) {
      riskFlags.push("Token recipient is an external wallet.");
    }
    if (!destinationInfo) {
      riskFlags.push("Will create recipient ATA and spend rent.");
    }

    return {
      label: "Token transfer",
      instructions,
      tokenDeltas: [
        {
          asset:
            getTokenMetadata(selectedTokenSource.mint)?.symbol ||
            selectedTokenSource.mint,
          amount: `-${tokenAmount}`,
          direction: "out"
        }
      ],
      rentImpactLamports,
      riskFlags
    };
  }

  async function prepareBurnTokenAction(): Promise<PreparedAction> {
    if (!publicKey) {
      throw new Error("Connect an identity wallet first.");
    }
    if (!selectedBurnSource) {
      throw new Error("Select a token account to burn from.");
    }

    const amount = parseAmountToBaseUnits(burnAmount, selectedBurnSource.decimals);
    if (amount <= 0n) {
      throw new Error("Burn amount must be greater than zero.");
    }
    if (amount > BigInt(selectedBurnSource.rawAmount)) {
      throw new Error("Burn amount exceeds token account balance.");
    }

    return {
      label: "Token burn",
      instructions: [
        createBurnCheckedInstruction(
          new PublicKey(selectedBurnSource.account),
          new PublicKey(selectedBurnSource.mint),
          publicKey,
          amount,
          selectedBurnSource.decimals
        )
      ],
      tokenDeltas: [
        {
          asset:
            getTokenMetadata(selectedBurnSource.mint)?.symbol ||
            selectedBurnSource.mint,
          amount: `-${burnAmount}`,
          direction: "out"
        }
      ],
      rentImpactLamports: 0,
      riskFlags: ["Permanent burn action."]
    };
  }

  async function prepareCloseAccountAction(): Promise<PreparedAction> {
    if (!publicKey) {
      throw new Error("Connect an identity wallet first.");
    }
    if (!selectedCloseSource) {
      throw new Error("Select a closeable token account.");
    }
    if (!selectedCloseSource.isZeroBalance) {
      throw new Error("Token account must be empty before it can be closed.");
    }

    const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(165);

    return {
      label: "Token account close",
      instructions: [
        createCloseAccountInstruction(
          new PublicKey(selectedCloseSource.account),
          publicKey,
          publicKey
        )
      ],
      tokenDeltas: [],
      rentImpactLamports: tokenAccountRent,
      riskFlags: ["Account close action."]
    };
  }

  async function prepareMetaplexBurnAction(): Promise<PreparedAction> {
    if (!publicKey) {
      throw new Error("Connect an identity wallet first.");
    }
    if (!selectedMetaplexSource) {
      throw new Error("Select an NFT token account.");
    }

    const mint = new PublicKey(selectedMetaplexSource.mint);
    const tokenAccount = new PublicKey(selectedMetaplexSource.account);
    const metadataPda = findMetadataPda(mint);
    const masterEditionPda = findMasterEditionPda(mint);

    const metadataInfo = await connection.getAccountInfo(metadataPda, "confirmed");
    if (!metadataInfo) {
      throw new Error("Metadata account not found for selected mint.");
    }

    const masterEditionInfo = await connection.getAccountInfo(
      masterEditionPda,
      "confirmed"
    );
    if (!masterEditionInfo) {
      throw new Error(
        "Master edition account not found. This flow is intended for legacy Metaplex NFTs."
      );
    }

    const burnNftInstruction = new Web3TransactionInstruction({
      programId: TOKEN_METADATA_PROGRAM_ID,
      keys: [
        { pubkey: metadataPda, isSigner: false, isWritable: true },
        { pubkey: publicKey, isSigner: true, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: true },
        { pubkey: tokenAccount, isSigner: false, isWritable: true },
        { pubkey: masterEditionPda, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
      ],
      data: Buffer.from([29])
    });

    const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(165);

    return {
      label: "Metaplex full burn",
      instructions: [burnNftInstruction],
      tokenDeltas: [
        {
          asset:
            getTokenMetadata(selectedMetaplexSource.mint)?.symbol ||
            selectedMetaplexSource.mint,
          amount: "-1 NFT",
          direction: "out"
        }
      ],
      rentImpactLamports: tokenAccountRent,
      riskFlags: ["Permanent NFT burn and account close path."]
    };
  }

  async function getPreparedActionForMode(
    requestedMode: ActionMode
  ): Promise<PreparedAction> {
    switch (requestedMode) {
      case "send-sol":
        return prepareSendSolAction();
      case "send-token":
        return prepareSendTokenAction();
      case "burn":
        return prepareBurnTokenAction();
      case "close":
        return prepareCloseAccountAction();
      case "metaplex-burn":
        return prepareMetaplexBurnAction();
      default:
        throw new Error("Unsupported action mode.");
    }
  }

  async function onSimulateCurrentMode() {
    try {
      const preparedAction = await getPreparedActionForMode(mode);
      await simulatePreparedAction(preparedAction);
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to prepare simulation."
      });
    }
  }

  async function onExecuteCurrentMode() {
    try {
      const preparedAction = await getPreparedActionForMode(mode);
      await executePreparedAction(preparedAction);
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to prepare transaction."
      });
    }
  }

  return (
    <Card className="fx-card" variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.25}>
          <Typography variant="subtitle2">Identity Actions + Simulator</Typography>

          <ToggleButtonGroup
            size="small"
            value={mode}
            exclusive
            onChange={(_, nextMode: ActionMode | null) => {
              if (nextMode) {
                setMode(nextMode);
              }
            }}
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))"
            }}
          >
            <ToggleButton value="send-sol">Send SOL</ToggleButton>
            <ToggleButton value="send-token">Send Token</ToggleButton>
            <ToggleButton value="burn">Burn</ToggleButton>
            <ToggleButton value="close">Close</ToggleButton>
            <ToggleButton value="metaplex-burn">Metaplex Burn</ToggleButton>
          </ToggleButtonGroup>

          {mode === "send-sol" ? (
            <Stack spacing={1}>
              <TextField
                size="small"
                label="Recipient Wallet"
                value={solRecipient}
                onChange={(event) => setSolRecipient(event.target.value)}
                fullWidth
              />
              <TextField
                size="small"
                label="Amount (SOL)"
                value={solAmount}
                onChange={(event) => setSolAmount(event.target.value)}
                fullWidth
              />
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={0.7}
                alignItems={{ sm: "center" }}
                justifyContent="space-between"
                useFlexGap
                flexWrap="wrap"
              >
                <Typography variant="caption" color="text.secondary">
                  Available: {formatUiAmount(availableSol)} SOL
                </Typography>
                <Stack direction="row" spacing={0.6}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setSolAmount(halfSol)}
                    disabled={availableSol <= 0}
                  >
                    Half
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setSolAmount(maxSol)}
                    disabled={availableSol <= 0}
                  >
                    Max
                  </Button>
                </Stack>
              </Stack>
            </Stack>
          ) : null}

          {mode === "send-token" ? (
            <Stack spacing={1}>
              <TextField
                select
                size="small"
                label="Source Token Account"
                value={tokenSourceAccount}
                onChange={(event) => setTokenSourceAccount(event.target.value)}
                fullWidth
              >
                {positiveAccounts.map((account) => (
                  <MenuItem key={account.account} value={account.account}>
                    <Stack direction="row" spacing={0.8} alignItems="center" sx={{ minWidth: 0 }}>
                      {buildTokenImageProxyUrl(
                        getTokenMetadata(account.mint)?.logoURI || "",
                        isMediaEnabled
                      ) ? (
                        <Box
                          component="img"
                          src={
                            buildTokenImageProxyUrl(
                              getTokenMetadata(account.mint)?.logoURI || "",
                              isMediaEnabled
                            ) || ""
                          }
                          alt={getTokenMetadata(account.mint)?.symbol || "Token"}
                          sx={{
                            width: 20,
                            height: 20,
                            borderRadius: 0.6,
                            border: "1px solid",
                            borderColor: "divider",
                            objectFit: "cover",
                            flexShrink: 0
                          }}
                        />
                      ) : null}
                      <Typography variant="body2" sx={{ minWidth: 0 }}>
                        {getTokenMetadata(account.mint)?.symbol ||
                          shortenAddress(account.mint)}{" "}
                        | {account.amountLabel} | {shortenAddress(account.account)}
                      </Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="Recipient Wallet"
                value={tokenRecipient}
                onChange={(event) => setTokenRecipient(event.target.value)}
                fullWidth
              />
              <TextField
                size="small"
                label={`Amount ${selectedTokenSource ? `(decimals ${selectedTokenSource.decimals})` : ""}`}
                value={tokenAmount}
                onChange={(event) => setTokenAmount(event.target.value)}
                fullWidth
              />
            </Stack>
          ) : null}

          {mode === "burn" ? (
            <Stack spacing={1}>
              <TextField
                select
                size="small"
                label="Token Account"
                value={burnSourceAccount}
                onChange={(event) => setBurnSourceAccount(event.target.value)}
                fullWidth
              >
                {positiveAccounts.map((account) => (
                  <MenuItem key={account.account} value={account.account}>
                    <Stack direction="row" spacing={0.8} alignItems="center" sx={{ minWidth: 0 }}>
                      {buildTokenImageProxyUrl(
                        getTokenMetadata(account.mint)?.logoURI || "",
                        isMediaEnabled
                      ) ? (
                        <Box
                          component="img"
                          src={
                            buildTokenImageProxyUrl(
                              getTokenMetadata(account.mint)?.logoURI || "",
                              isMediaEnabled
                            ) || ""
                          }
                          alt={getTokenMetadata(account.mint)?.symbol || "Token"}
                          sx={{
                            width: 20,
                            height: 20,
                            borderRadius: 0.6,
                            border: "1px solid",
                            borderColor: "divider",
                            objectFit: "cover",
                            flexShrink: 0
                          }}
                        />
                      ) : null}
                      <Typography variant="body2" sx={{ minWidth: 0 }}>
                        {getTokenMetadata(account.mint)?.symbol ||
                          shortenAddress(account.mint)}{" "}
                        | {account.amountLabel} | {shortenAddress(account.account)}
                      </Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label={`Amount to Burn ${selectedBurnSource ? `(decimals ${selectedBurnSource.decimals})` : ""}`}
                value={burnAmount}
                onChange={(event) => setBurnAmount(event.target.value)}
                fullWidth
              />
            </Stack>
          ) : null}

          {mode === "close" ? (
            <Stack spacing={1}>
              <TextField
                select
                size="small"
                label="Empty Token Account"
                value={closeSourceAccount}
                onChange={(event) => setCloseSourceAccount(event.target.value)}
                fullWidth
              >
                {closeableAccounts.map((account) => (
                  <MenuItem key={account.account} value={account.account}>
                    <Stack direction="row" spacing={0.8} alignItems="center" sx={{ minWidth: 0 }}>
                      {buildTokenImageProxyUrl(
                        getTokenMetadata(account.mint)?.logoURI || "",
                        isMediaEnabled
                      ) ? (
                        <Box
                          component="img"
                          src={
                            buildTokenImageProxyUrl(
                              getTokenMetadata(account.mint)?.logoURI || "",
                              isMediaEnabled
                            ) || ""
                          }
                          alt={getTokenMetadata(account.mint)?.symbol || "Token"}
                          sx={{
                            width: 20,
                            height: 20,
                            borderRadius: 0.6,
                            border: "1px solid",
                            borderColor: "divider",
                            objectFit: "cover",
                            flexShrink: 0
                          }}
                        />
                      ) : null}
                      <Typography variant="body2" sx={{ minWidth: 0 }}>
                        {getTokenMetadata(account.mint)?.symbol ||
                          shortenAddress(account.mint)}{" "}
                        | {shortenAddress(account.account)}
                      </Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </TextField>
              <Typography variant="caption" color="text.secondary">
                Only empty token accounts can be closed.
              </Typography>
            </Stack>
          ) : null}

          {mode === "metaplex-burn" ? (
            <Stack spacing={1}>
              <TextField
                select
                size="small"
                label="Legacy NFT Token Account"
                value={metaplexSourceAccount}
                onChange={(event) => setMetaplexSourceAccount(event.target.value)}
                fullWidth
              >
                {metaplexNftCandidates.length === 0 ? (
                  <MenuItem value="" disabled>
                    No legacy NFT accounts available
                  </MenuItem>
                ) : (
                  metaplexNftCandidates.map((account) => (
                    <MenuItem key={account.account} value={account.account}>
                      <Stack direction="row" spacing={0.8} alignItems="center" sx={{ minWidth: 0 }}>
                        {buildTokenImageProxyUrl(
                          getTokenMetadata(account.mint)?.logoURI || "",
                          isMediaEnabled
                        ) ? (
                          <Box
                            component="img"
                            src={
                              buildTokenImageProxyUrl(
                                getTokenMetadata(account.mint)?.logoURI || "",
                                isMediaEnabled
                              ) || ""
                            }
                            alt={getTokenMetadata(account.mint)?.symbol || "NFT"}
                            sx={{
                              width: 20,
                              height: 20,
                              borderRadius: 0.6,
                              border: "1px solid",
                              borderColor: "divider",
                              objectFit: "cover",
                              flexShrink: 0
                            }}
                          />
                        ) : null}
                        <Typography variant="body2" sx={{ minWidth: 0 }}>
                          {getTokenMetadata(account.mint)?.symbol ||
                            shortenAddress(account.mint)}{" "}
                          | {shortenAddress(account.account)}
                        </Typography>
                      </Stack>
                    </MenuItem>
                  ))
                )}
              </TextField>
              <Typography variant="caption" color="text.secondary">
                Legacy Metaplex burn path with metadata + edition checks.
              </Typography>
            </Stack>
          ) : null}

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              variant="outlined"
              onClick={() => {
                void onSimulateCurrentMode();
              }}
              disabled={!connected || isSubmitting || isSimulating}
            >
              {isSimulating ? "Simulating..." : "Simulate + Decode"}
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                void onExecuteCurrentMode();
              }}
              disabled={!connected || isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Execute"}
            </Button>
          </Stack>

          {simulationPreview ? (
            <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
              <CardContent sx={{ p: 1.25 }}>
                <Stack spacing={0.9}>
                  <Typography variant="subtitle2">
                    Simulation Report: {simulationPreview.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Fee:{" "}
                    {simulationPreview.feeLamports !== null
                      ? `${(simulationPreview.feeLamports / 1_000_000_000).toFixed(6)} SOL`
                      : "unavailable"}{" "}
                    | Rent impact:{" "}
                    {(simulationPreview.rentImpactLamports / 1_000_000_000).toFixed(
                      6
                    )}{" "}
                    SOL
                  </Typography>

                  {simulationPreview.tokenDeltas.length > 0 ? (
                    <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap">
                      {simulationPreview.tokenDeltas.map((delta, index) => (
                        <Chip
                          key={`${delta.asset}-${index}`}
                          size="small"
                          color={delta.direction === "out" ? "warning" : "success"}
                          label={`${delta.asset.length > 16 ? shortenAddress(delta.asset) : delta.asset} ${delta.amount}`}
                        />
                      ))}
                    </Stack>
                  ) : null}

                  {simulationPreview.riskFlags.length > 0 ? (
                    <Alert severity="warning">
                      {simulationPreview.riskFlags.join(" | ")}
                    </Alert>
                  ) : null}

                  {simulationPreview.error ? (
                    <Alert severity="error">
                      Simulation error: {simulationPreview.error}
                    </Alert>
                  ) : (
                    <Alert severity="success">
                      Simulation completed with no runtime error.
                    </Alert>
                  )}

                  {simulationPreview.error && preflightFailureHints.length > 0 ? (
                    <Card variant="outlined" sx={{ borderRadius: 1.25 }}>
                      <CardContent sx={{ p: 1 }}>
                        <Stack spacing={0.75}>
                          <Typography variant="caption" color="text.secondary">
                            Preflight Failure Decoder
                          </Typography>
                          {preflightFailureHints.map((hint) => (
                            <Box
                              key={hint.id}
                              sx={{
                                p: 0.75,
                                border: "1px solid",
                                borderColor: "divider",
                                borderRadius: 1
                              }}
                            >
                              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                {hint.title}
                              </Typography>
                              <Typography
                                variant="caption"
                                display="block"
                                color="text.secondary"
                                sx={{ mt: 0.2 }}
                              >
                                Evidence: {hint.evidence}
                              </Typography>
                              <Box sx={{ mt: 0.45, display: "grid", gap: 0.2 }}>
                                {hint.fixSteps.map((step, index) => (
                                  <Typography
                                    key={`${hint.id}-step-${index}`}
                                    variant="caption"
                                    display="block"
                                  >
                                    {index + 1}. {step}
                                  </Typography>
                                ))}
                              </Box>
                            </Box>
                          ))}
                        </Stack>
                      </CardContent>
                    </Card>
                  ) : null}

                  <Divider />

                  <Typography variant="caption" color="text.secondary">
                    Exact Instructions ({simulationPreview.instructions.length})
                  </Typography>
                  <Box sx={{ maxHeight: 180, overflow: "auto", display: "grid", gap: 0.5 }}>
                    {simulationPreview.instructions.map((instruction, index) => (
                      <Box
                        key={`${instruction.programId}-${index}`}
                        sx={{
                          p: 0.7,
                          border: "1px solid",
                          borderColor: "divider",
                          borderRadius: 1
                        }}
                      >
                        <Typography variant="caption">
                          #{index + 1} {instruction.programLabel} ({instruction.programId})
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary">
                          Data bytes: {instruction.dataLength}
                        </Typography>
                        {instruction.accounts.map((account) => (
                          <Typography
                            key={account}
                            variant="caption"
                            display="block"
                            sx={{ fontFamily: "var(--font-mono), monospace" }}
                          >
                            {account}
                          </Typography>
                        ))}
                      </Box>
                    ))}
                  </Box>

                  {simulationPreview.logs.length > 0 ? (
                    <>
                      <Divider />
                      <Typography variant="caption" color="text.secondary">
                        Runtime Logs
                      </Typography>
                      <Box sx={{ maxHeight: 120, overflow: "auto" }}>
                        {simulationPreview.logs.slice(0, 24).map((log) => (
                          <Typography
                            key={log}
                            variant="caption"
                            display="block"
                            sx={{ fontFamily: "var(--font-mono), monospace" }}
                          >
                            {log}
                          </Typography>
                        ))}
                      </Box>
                    </>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          {status ? (
            <Alert severity={status.severity}>
              {status.message}
              {status.signature ? (
                <Box component="span">
                  {" "}
                  <Link
                    href={`https://solscan.io/tx/${status.signature}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction
                  </Link>
                </Box>
              ) : null}
            </Alert>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
