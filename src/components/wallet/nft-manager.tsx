"use client";

import { useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import {
  PublicKey,
  type ParsedAccountData,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  Keypair
} from "@solana/web3.js";
import {
  MPL_TOKEN_METADATA_PROGRAM_ID,
  getCreateMasterEditionV3InstructionDataSerializer,
  getCreateMetadataAccountV3InstructionDataSerializer,
  getMetadataAccountDataSerializer,
  getSetAndVerifyCollectionInstructionDataSerializer,
  getUnverifyCollectionInstructionDataSerializer,
  getUpdateMetadataAccountV2InstructionDataSerializer,
  getVerifyCollectionInstructionDataSerializer
} from "@metaplex-foundation/mpl-token-metadata";
import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Link,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import type { WalletHoldingsState } from "@/hooks/use-wallet-holdings";
import { CandyMachineManager } from "@/components/wallet/candy-machine-manager";

type NftManagerProps = {
  holdingsState: WalletHoldingsState;
};

type StatusState = {
  severity: "success" | "error" | "info";
  message: string;
  signature?: string;
} | null;

type ManagedNft = {
  mint: string;
  metadataPda: string;
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints: number;
};

type ParsedMetadata = {
  metadataPda: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints: number;
  creators: unknown;
  collection: unknown;
  uses: unknown;
  updateAuthority: string;
};

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID);
const METADATA_SEED = new TextEncoder().encode("metadata");
const EDITION_SEED = new TextEncoder().encode("edition");

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function explorerAddressUrl(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=mainnet`;
}

function normalizeMetadataValue(value: string) {
  return value.replace(/\0/g, "").trim();
}

function findMetadataPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [METADATA_SEED, TOKEN_METADATA_PROGRAM_ID.toBytes(), mint.toBytes()],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

function findMasterEditionPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [
      METADATA_SEED,
      TOKEN_METADATA_PROGRAM_ID.toBytes(),
      mint.toBytes(),
      EDITION_SEED
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

function parseMintLines(input: string): string[] {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  if (lines.length === 0) {
    return [];
  }

  return lines.map((line) => {
    const mint = line.includes(",") ? line.split(",")[0].trim() : line;
    return new PublicKey(mint).toBase58();
  });
}

export function NftManager({ holdingsState }: NftManagerProps) {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { refresh } = holdingsState;

  const [status, setStatus] = useState<StatusState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingManagedNfts, setIsLoadingManagedNfts] = useState(false);
  const [managedNfts, setManagedNfts] = useState<ManagedNft[]>([]);
  const [expandedTool, setExpandedTool] = useState<string | false>("managed");

  const [mintName, setMintName] = useState("");
  const [mintSymbol, setMintSymbol] = useState("");
  const [mintUri, setMintUri] = useState("");
  const [mintRecipient, setMintRecipient] = useState("");
  const [mintSellerFeeBps, setMintSellerFeeBps] = useState("0");

  const [sendMintAddress, setSendMintAddress] = useState("");
  const [sendDestination, setSendDestination] = useState("");

  const [cloneSourceMint, setCloneSourceMint] = useState("");
  const [cloneRecipient, setCloneRecipient] = useState("");
  const [cloneName, setCloneName] = useState("");
  const [cloneSymbol, setCloneSymbol] = useState("");
  const [cloneUri, setCloneUri] = useState("");

  const [batchUri, setBatchUri] = useState("");
  const [batchMintList, setBatchMintList] = useState("");
  const [collectionMint, setCollectionMint] = useState("");
  const [collectionTargetMints, setCollectionTargetMints] = useState("");
  const [collectionAction, setCollectionAction] = useState<
    "set-verify" | "verify" | "unverify" | "clear"
  >("set-verify");

  const managedMintList = useMemo(
    () => managedNfts.map((nft) => nft.mint).join("\n"),
    [managedNfts]
  );

  const runWalletTransaction = async (
    transaction: Transaction,
    signers?: Keypair[]
  ) => {
    if (!publicKey) {
      throw new Error("Connect your wallet first.");
    }
    const signature = await sendTransaction(transaction, connection, { signers });
    await connection.confirmTransaction(signature, "confirmed");
    refresh();
    return signature;
  };

  const createMetadataInstruction = (
    mintPublicKey: PublicKey,
    updateAuthority: PublicKey,
    data: {
      name: string;
      symbol: string;
      uri: string;
      sellerFeeBasisPoints: number;
      creators: null;
      collection: null;
      uses: null;
    }
  ) => {
    if (!publicKey) {
      throw new Error("Connect your wallet first.");
    }
    const metadataPda = findMetadataPda(mintPublicKey);
    const serializedData =
      getCreateMetadataAccountV3InstructionDataSerializer().serialize({
        data,
        isMutable: true,
        collectionDetails: null
      });

    return new TransactionInstruction({
      programId: TOKEN_METADATA_PROGRAM_ID,
      keys: [
        { pubkey: metadataPda, isSigner: false, isWritable: true },
        { pubkey: mintPublicKey, isSigner: false, isWritable: false },
        { pubkey: publicKey, isSigner: true, isWritable: false },
        { pubkey: publicKey, isSigner: true, isWritable: true },
        { pubkey: updateAuthority, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
      ],
      data: Buffer.from(serializedData)
    });
  };

  const createMasterEditionInstruction = (mintPublicKey: PublicKey) => {
    if (!publicKey) {
      throw new Error("Connect your wallet first.");
    }
    const metadataPda = findMetadataPda(mintPublicKey);
    const masterEditionPda = findMasterEditionPda(mintPublicKey);
    const serializedData =
      getCreateMasterEditionV3InstructionDataSerializer().serialize({
        maxSupply: 0
      });

    return new TransactionInstruction({
      programId: TOKEN_METADATA_PROGRAM_ID,
      keys: [
        { pubkey: masterEditionPda, isSigner: false, isWritable: true },
        { pubkey: mintPublicKey, isSigner: false, isWritable: true },
        { pubkey: publicKey, isSigner: true, isWritable: false },
        { pubkey: publicKey, isSigner: true, isWritable: false },
        { pubkey: publicKey, isSigner: true, isWritable: true },
        { pubkey: metadataPda, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
      ],
      data: Buffer.from(serializedData)
    });
  };

  const parseMetadataForMint = async (mintPublicKey: PublicKey) => {
    const metadataPda = findMetadataPda(mintPublicKey);
    const metadataAccountInfo = await connection.getAccountInfo(
      metadataPda,
      "confirmed"
    );
    if (!metadataAccountInfo) {
      throw new Error(`Metadata account not found for mint ${mintPublicKey.toBase58()}.`);
    }

    const [metadata] = getMetadataAccountDataSerializer().deserialize(
      metadataAccountInfo.data
    );
    return {
      metadataPda,
      name: normalizeMetadataValue(metadata.name),
      symbol: normalizeMetadataValue(metadata.symbol),
      uri: normalizeMetadataValue(metadata.uri),
      sellerFeeBasisPoints: Number(metadata.sellerFeeBasisPoints),
      creators: metadata.creators,
      collection: metadata.collection,
      uses: metadata.uses,
      updateAuthority: String(metadata.updateAuthority)
    } satisfies ParsedMetadata;
  };

  const createNft = async (params: {
    name: string;
    symbol: string;
    uri: string;
    recipient: PublicKey;
    sellerFeeBasisPoints: number;
  }) => {
    if (!publicKey) {
      throw new Error("Connect your wallet first.");
    }
    if (!params.name.trim()) {
      throw new Error("Name is required.");
    }
    if (!params.symbol.trim()) {
      throw new Error("Symbol is required.");
    }
    if (!params.uri.trim()) {
      throw new Error("Metadata URI is required.");
    }
    if (params.sellerFeeBasisPoints < 0 || params.sellerFeeBasisPoints > 10_000) {
      throw new Error("Seller fee bps must be between 0 and 10,000.");
    }
    if (params.name.trim().length > 32) {
      throw new Error("Name must be 32 characters or less.");
    }
    if (params.symbol.trim().length > 10) {
      throw new Error("Symbol must be 10 characters or less.");
    }
    if (params.uri.trim().length > 200) {
      throw new Error("URI must be 200 characters or less.");
    }

    const mintKeypair = Keypair.generate();
    const mintPublicKey = mintKeypair.publicKey;
    const rentExempt = await connection.getMinimumBalanceForRentExemption(
      MINT_SIZE
    );
    const destinationAta = getAssociatedTokenAddressSync(
      mintPublicKey,
      params.recipient,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const destinationAtaInfo = await connection.getAccountInfo(
      destinationAta,
      "confirmed"
    );

    const transaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: publicKey,
        newAccountPubkey: mintPublicKey,
        space: MINT_SIZE,
        lamports: rentExempt,
        programId: TOKEN_PROGRAM_ID
      }),
      createInitializeMint2Instruction(
        mintPublicKey,
        0,
        publicKey,
        null,
        TOKEN_PROGRAM_ID
      )
    );

    if (!destinationAtaInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          publicKey,
          destinationAta,
          params.recipient,
          mintPublicKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    transaction.add(
      createMintToInstruction(
        mintPublicKey,
        destinationAta,
        publicKey,
        1,
        [],
        TOKEN_PROGRAM_ID
      ),
      createMetadataInstruction(mintPublicKey, publicKey, {
        name: params.name.trim(),
        symbol: params.symbol.trim(),
        uri: params.uri.trim(),
        sellerFeeBasisPoints: params.sellerFeeBasisPoints,
        creators: null,
        collection: null,
        uses: null
      }),
      createMasterEditionInstruction(mintPublicKey)
    );

    const signature = await runWalletTransaction(transaction, [mintKeypair]);
    return { signature, mint: mintPublicKey.toBase58() };
  };

  const loadManagedNfts = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsLoadingManagedNfts(true);
    setStatus(null);
    try {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID },
        "confirmed"
      );

      const nftCandidateMints = Array.from(
        new Set(
          tokenAccounts.value
            .map((entry) => {
              const parsedInfo = entry.account.data.parsed?.info as
                | {
                    mint?: string;
                    tokenAmount?: { amount?: string; decimals?: number };
                  }
                | undefined;
              if (!parsedInfo?.mint || !parsedInfo.tokenAmount) {
                return null;
              }
              const decimals = Number(parsedInfo.tokenAmount.decimals ?? 0);
              const amountRaw = BigInt(parsedInfo.tokenAmount.amount ?? "0");
              if (decimals !== 0 || amountRaw <= 0n) {
                return null;
              }
              return parsedInfo.mint;
            })
            .filter((mint): mint is string => Boolean(mint))
        )
      );

      if (nftCandidateMints.length === 0) {
        setManagedNfts([]);
        setStatus({
          severity: "info",
          message: "No NFT holdings found for this wallet."
        });
        return;
      }

      const mintPublicKeys = nftCandidateMints.map((mint) => new PublicKey(mint));
      const metadataPdas = mintPublicKeys.map((mint) => findMetadataPda(mint));
      const metadataAccountChunks = chunkArray(metadataPdas, 100);
      const metadataAccountInfos = (
        await Promise.all(
          metadataAccountChunks.map((chunk) =>
            connection.getMultipleAccountsInfo(chunk, "confirmed")
          )
        )
      ).flat();

      const ownedManagedNfts: ManagedNft[] = [];
      metadataAccountInfos.forEach((accountInfo, index) => {
        if (!accountInfo || !accountInfo.owner.equals(TOKEN_METADATA_PROGRAM_ID)) {
          return;
        }

        try {
          const [metadata] = getMetadataAccountDataSerializer().deserialize(
            accountInfo.data
          );
          const updateAuthority = String(metadata.updateAuthority);
          if (updateAuthority !== publicKey.toBase58()) {
            return;
          }

          ownedManagedNfts.push({
            mint: mintPublicKeys[index].toBase58(),
            metadataPda: metadataPdas[index].toBase58(),
            name: normalizeMetadataValue(metadata.name),
            symbol: normalizeMetadataValue(metadata.symbol),
            uri: normalizeMetadataValue(metadata.uri),
            sellerFeeBasisPoints: Number(metadata.sellerFeeBasisPoints)
          });
        } catch {
          // Ignore malformed metadata accounts.
        }
      });

      ownedManagedNfts.sort((left, right) => {
        const leftLabel = `${left.name} ${left.symbol}`.trim().toLowerCase();
        const rightLabel = `${right.name} ${right.symbol}`.trim().toLowerCase();
        if (leftLabel && rightLabel && leftLabel !== rightLabel) {
          return leftLabel.localeCompare(rightLabel);
        }
        return left.mint.localeCompare(right.mint);
      });

      setManagedNfts(ownedManagedNfts);
      setStatus({
        severity: "success",
        message: `Loaded ${ownedManagedNfts.length} NFT(s) where your wallet is update authority.`
      });
    } catch (unknownError) {
      setManagedNfts([]);
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to load managed NFTs."
      });
    } finally {
      setIsLoadingManagedNfts(false);
    }
  };

  const mintNft = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const recipient = new PublicKey(
        (mintRecipient.trim() || publicKey.toBase58()).trim()
      );
      const sellerFeeBasisPoints = Number.parseInt(mintSellerFeeBps, 10);
      const { signature, mint } = await createNft({
        name: mintName.trim(),
        symbol: mintSymbol.trim(),
        uri: mintUri.trim(),
        recipient,
        sellerFeeBasisPoints
      });
      setStatus({
        severity: "success",
        message: `Minted NFT ${mint} to ${recipient.toBase58()}.`,
        signature
      });
      setMintRecipient("");
      void loadManagedNfts();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error ? unknownError.message : "Failed to mint NFT."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendNft = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const mintPublicKey = new PublicKey(sendMintAddress.trim());
      const destinationOwner = new PublicKey(sendDestination.trim());
      const sourceAta = getAssociatedTokenAddressSync(
        mintPublicKey,
        publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const sourceAtaInfo = await connection.getParsedAccountInfo(
        sourceAta,
        "confirmed"
      );
      if (
        !sourceAtaInfo.value ||
        typeof sourceAtaInfo.value.data !== "object" ||
        !("parsed" in sourceAtaInfo.value.data)
      ) {
        throw new Error("Source NFT token account not found.");
      }
      const sourceParsedData = sourceAtaInfo.value.data as ParsedAccountData;
      const sourceTokenAmount = sourceParsedData.parsed?.info?.tokenAmount as
        | { amount?: string; decimals?: number }
        | undefined;
      if (!sourceTokenAmount || Number(sourceTokenAmount.decimals ?? 0) !== 0) {
        throw new Error("Source mint is not a 0-decimal NFT.");
      }
      if (BigInt(sourceTokenAmount.amount ?? "0") < 1n) {
        throw new Error("You do not hold this NFT.");
      }

      const destinationAta = getAssociatedTokenAddressSync(
        mintPublicKey,
        destinationOwner,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const destinationAtaInfo = await connection.getAccountInfo(
        destinationAta,
        "confirmed"
      );

      const transaction = new Transaction();
      if (!destinationAtaInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            destinationAta,
            destinationOwner,
            mintPublicKey,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }
      transaction.add(
        createTransferCheckedInstruction(
          sourceAta,
          mintPublicKey,
          destinationAta,
          publicKey,
          1,
          0,
          [],
          TOKEN_PROGRAM_ID
        )
      );

      const signature = await runWalletTransaction(transaction);
      setStatus({
        severity: "success",
        message: `Sent NFT ${mintPublicKey.toBase58()} to ${destinationOwner.toBase58()}.`,
        signature
      });
      setSendDestination("");
      void loadManagedNfts();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error ? unknownError.message : "Failed to send NFT."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const retangleNft = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const sourceMintPublicKey = new PublicKey(cloneSourceMint.trim());
      const sourceMetadata = await parseMetadataForMint(sourceMintPublicKey);
      const recipient = new PublicKey(
        (cloneRecipient.trim() || publicKey.toBase58()).trim()
      );

      const name = cloneName.trim() || sourceMetadata.name;
      const symbol = cloneSymbol.trim() || sourceMetadata.symbol;
      const uri = cloneUri.trim() || sourceMetadata.uri;

      const { signature, mint } = await createNft({
        name,
        symbol,
        uri,
        recipient,
        sellerFeeBasisPoints: sourceMetadata.sellerFeeBasisPoints
      });

      setStatus({
        severity: "success",
        message: `Retangled ${sourceMintPublicKey.toBase58()} into new mint ${mint}.`,
        signature
      });
      void loadManagedNfts();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to retangle NFT."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const pushBatchMetadataUri = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const uriTemplate = batchUri.trim();
      if (!uriTemplate) {
        throw new Error("Batch URI is required.");
      }

      let targetMints = parseMintLines(batchMintList);
      if (targetMints.length === 0 && managedNfts.length > 0) {
        targetMints = managedNfts.map((nft) => nft.mint);
      }
      if (targetMints.length === 0) {
        throw new Error("Add at least one mint address or load managed NFTs.");
      }

      const instructions = await Promise.all(
        targetMints.map(async (mint) => {
          const mintPublicKey = new PublicKey(mint);
          const metadata = await parseMetadataForMint(mintPublicKey);
          if (metadata.updateAuthority !== publicKey.toBase58()) {
            throw new Error(
              `Wallet is not update authority for mint ${mintPublicKey.toBase58()}.`
            );
          }
          const nextUri = uriTemplate.includes("{mint}")
            ? uriTemplate.replaceAll("{mint}", mintPublicKey.toBase58())
            : uriTemplate;

          const serializedData =
            getUpdateMetadataAccountV2InstructionDataSerializer().serialize({
              data: {
                name: metadata.name,
                symbol: metadata.symbol,
                uri: nextUri,
                sellerFeeBasisPoints: metadata.sellerFeeBasisPoints,
                creators: metadata.creators,
                collection: metadata.collection,
                uses: metadata.uses
              },
              newUpdateAuthority: null,
              primarySaleHappened: null,
              isMutable: null
            });

          return new TransactionInstruction({
            programId: TOKEN_METADATA_PROGRAM_ID,
            keys: [
              {
                pubkey: metadata.metadataPda,
                isSigner: false,
                isWritable: true
              },
              { pubkey: publicKey, isSigner: true, isWritable: false }
            ],
            data: Buffer.from(serializedData)
          });
        })
      );

      const groupedInstructions = chunkArray(instructions, 6);
      const signatures: string[] = [];
      for (const instructionChunk of groupedInstructions) {
        const signature = await runWalletTransaction(
          new Transaction().add(...instructionChunk)
        );
        signatures.push(signature);
      }

      setStatus({
        severity: "success",
        message: `Updated metadata URI for ${targetMints.length} mint(s) in ${signatures.length} transaction(s).`,
        signature: signatures[0]
      });
      void loadManagedNfts();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to push batch metadata URI."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const runCollectionAuthorityAction = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      let targetMints = parseMintLines(collectionTargetMints);
      if (targetMints.length === 0 && managedNfts.length > 0) {
        targetMints = managedNfts.map((item) => item.mint);
      }
      if (targetMints.length === 0) {
        throw new Error("Add target NFT mints or load managed NFTs first.");
      }

      const requiresCollectionMint = collectionAction !== "clear";
      const collectionMintPublicKey = requiresCollectionMint
        ? new PublicKey(collectionMint.trim())
        : null;
      const collectionMetadataPda = collectionMintPublicKey
        ? findMetadataPda(collectionMintPublicKey)
        : null;
      const collectionMasterEditionPda = collectionMintPublicKey
        ? findMasterEditionPda(collectionMintPublicKey)
        : null;

      const walletAddress = publicKey.toBase58();
      const instructions = await Promise.all(
        targetMints.map(async (mintAddress) => {
          const targetMint = new PublicKey(mintAddress);
          const metadata = await parseMetadataForMint(targetMint);

          if (collectionAction === "clear") {
            if (metadata.updateAuthority !== walletAddress) {
              throw new Error(
                `Wallet is not update authority for mint ${targetMint.toBase58()}.`
              );
            }
            const clearData =
              getUpdateMetadataAccountV2InstructionDataSerializer().serialize({
                data: {
                  name: metadata.name,
                  symbol: metadata.symbol,
                  uri: metadata.uri,
                  sellerFeeBasisPoints: metadata.sellerFeeBasisPoints,
                  creators: metadata.creators,
                  collection: null,
                  uses: metadata.uses
                },
                newUpdateAuthority: null,
                primarySaleHappened: null,
                isMutable: null
              });

            return new TransactionInstruction({
              programId: TOKEN_METADATA_PROGRAM_ID,
              keys: [
                { pubkey: metadata.metadataPda, isSigner: false, isWritable: true },
                { pubkey: publicKey, isSigner: true, isWritable: false }
              ],
              data: Buffer.from(clearData)
            });
          }

          if (!collectionMintPublicKey || !collectionMetadataPda || !collectionMasterEditionPda) {
            throw new Error("Collection mint is required for this action.");
          }

          if (collectionAction === "set-verify") {
            if (metadata.updateAuthority !== walletAddress) {
              throw new Error(
                `Set+verify requires NFT update authority. Wallet does not control ${targetMint.toBase58()}.`
              );
            }

            const setAndVerifyData =
              getSetAndVerifyCollectionInstructionDataSerializer().serialize({});
            return new TransactionInstruction({
              programId: TOKEN_METADATA_PROGRAM_ID,
              keys: [
                { pubkey: metadata.metadataPda, isSigner: false, isWritable: true },
                { pubkey: publicKey, isSigner: true, isWritable: true },
                { pubkey: publicKey, isSigner: true, isWritable: true },
                { pubkey: publicKey, isSigner: false, isWritable: false },
                {
                  pubkey: collectionMintPublicKey,
                  isSigner: false,
                  isWritable: false
                },
                { pubkey: collectionMetadataPda, isSigner: false, isWritable: false },
                {
                  pubkey: collectionMasterEditionPda,
                  isSigner: false,
                  isWritable: false
                }
              ],
              data: Buffer.from(setAndVerifyData)
            });
          }

          if (collectionAction === "verify") {
            const verifyData =
              getVerifyCollectionInstructionDataSerializer().serialize({});
            return new TransactionInstruction({
              programId: TOKEN_METADATA_PROGRAM_ID,
              keys: [
                { pubkey: metadata.metadataPda, isSigner: false, isWritable: true },
                { pubkey: publicKey, isSigner: true, isWritable: true },
                { pubkey: publicKey, isSigner: true, isWritable: true },
                {
                  pubkey: collectionMintPublicKey,
                  isSigner: false,
                  isWritable: false
                },
                { pubkey: collectionMetadataPda, isSigner: false, isWritable: false },
                {
                  pubkey: collectionMasterEditionPda,
                  isSigner: false,
                  isWritable: false
                }
              ],
              data: Buffer.from(verifyData)
            });
          }

          const unverifyData =
            getUnverifyCollectionInstructionDataSerializer().serialize({});
          return new TransactionInstruction({
            programId: TOKEN_METADATA_PROGRAM_ID,
            keys: [
              { pubkey: metadata.metadataPda, isSigner: false, isWritable: true },
              { pubkey: publicKey, isSigner: true, isWritable: true },
              { pubkey: collectionMintPublicKey, isSigner: false, isWritable: false },
              { pubkey: collectionMetadataPda, isSigner: false, isWritable: false },
              {
                pubkey: collectionMasterEditionPda,
                isSigner: false,
                isWritable: false
              }
            ],
            data: Buffer.from(unverifyData)
          });
        })
      );

      const groupedInstructions = chunkArray(instructions, 5);
      const signatures: string[] = [];
      for (const instructionChunk of groupedInstructions) {
        const signature = await runWalletTransaction(
          new Transaction().add(...instructionChunk)
        );
        signatures.push(signature);
      }

      const labelByAction: Record<typeof collectionAction, string> = {
        "set-verify": "Set + verified collection",
        verify: "Verified collection",
        unverify: "Unverified collection",
        clear: "Cleared collection field"
      };
      setStatus({
        severity: "success",
        message: `${labelByAction[collectionAction]} for ${targetMints.length} NFT(s) in ${signatures.length} transaction(s).`,
        signature: signatures[0]
      });
      void loadManagedNfts();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to run collection authority action."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 1.75 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle1">NFT Manager</Typography>
            <Chip
              size="small"
              variant="outlined"
              label="Mint / Send / Retangle / Metadata Push"
            />
          </Stack>

          <Typography variant="body2" color="text.secondary">
            Manage NFT minting and metadata operations from your connected wallet.
          </Typography>

          {status ? (
            <Alert
              severity={status.severity}
              action={
                status.signature ? (
                  <Button
                    size="small"
                    color="inherit"
                    href={`https://explorer.solana.com/tx/${status.signature}?cluster=mainnet`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Explorer
                  </Button>
                ) : undefined
              }
            >
              {status.message}
            </Alert>
          ) : null}

          {!connected || !publicKey ? (
            <Alert severity="info">
              Connect your wallet to use NFT management actions.
            </Alert>
          ) : null}

          <Accordion
            expanded={expandedTool === "managed"}
            onChange={(_event, isExpanded) => {
              setExpandedTool(isExpanded ? "managed" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important"
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedTool === "managed" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">Managed NFTs (Update Authority)</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <Stack spacing={1}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      void loadManagedNfts();
                    }}
                    disabled={!connected || isLoadingManagedNfts}
                  >
                    Load Managed NFTs
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      setBatchMintList(managedMintList);
                    }}
                    disabled={!managedMintList}
                  >
                    Use All in Batch Push
                  </Button>
                </Stack>

                {isLoadingManagedNfts ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={16} />
                    <Typography variant="caption" color="text.secondary">
                      Loading managed NFTs...
                    </Typography>
                  </Stack>
                ) : null}

                {managedNfts.length === 0 && !isLoadingManagedNfts ? (
                  <Typography variant="caption" color="text.secondary">
                    No managed NFTs loaded yet.
                  </Typography>
                ) : null}

                {managedNfts.length > 0 ? (
                  <Stack spacing={0.8}>
                    {managedNfts.slice(0, 40).map((nft) => (
                      <Card
                        key={nft.mint}
                        variant="outlined"
                        sx={{ borderRadius: 1.1 }}
                      >
                        <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
                          <Stack spacing={0.6}>
                            <Stack
                              direction="row"
                              justifyContent="space-between"
                              alignItems="center"
                            >
                              <Typography variant="body2">
                                {nft.name || "Unnamed NFT"} {nft.symbol ? `(${nft.symbol})` : ""}
                              </Typography>
                              <Button
                                size="small"
                                href={explorerAddressUrl(nft.mint)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Explorer
                              </Button>
                            </Stack>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                fontFamily: "var(--font-mono), monospace",
                                wordBreak: "break-all"
                              }}
                            >
                              Mint: {nft.mint}
                            </Typography>
                            <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap>
                              <Chip
                                size="small"
                                variant="outlined"
                                label={`Fee ${nft.sellerFeeBasisPoints} bps`}
                              />
                              <Chip size="small" variant="outlined" label="Update Authority: You" />
                            </Stack>
                            {nft.uri ? (
                              <Link
                                href={nft.uri}
                                target="_blank"
                                rel="noreferrer"
                                underline="hover"
                                sx={{ wordBreak: "break-all" }}
                              >
                                {nft.uri}
                              </Link>
                            ) : null}
                          </Stack>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                ) : null}
              </Stack>
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedTool === "mint"}
            onChange={(_event, isExpanded) => {
              setExpandedTool(isExpanded ? "mint" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important"
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedTool === "mint" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">Mint NFT</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <Stack spacing={1}>
                <TextField
                  size="small"
                  label="Name"
                  value={mintName}
                  onChange={(event) => {
                    setMintName(event.target.value);
                  }}
                />
                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                  <TextField
                    size="small"
                    label="Symbol"
                    value={mintSymbol}
                    onChange={(event) => {
                      setMintSymbol(event.target.value);
                    }}
                  />
                  <TextField
                    size="small"
                    label="Seller Fee (bps)"
                    value={mintSellerFeeBps}
                    onChange={(event) => {
                      setMintSellerFeeBps(event.target.value);
                    }}
                  />
                </Stack>
                <TextField
                  size="small"
                  label="Metadata URI"
                  value={mintUri}
                  onChange={(event) => {
                    setMintUri(event.target.value);
                  }}
                />
                <TextField
                  size="small"
                  label="Recipient Wallet (optional)"
                  value={mintRecipient}
                  onChange={(event) => {
                    setMintRecipient(event.target.value);
                  }}
                  placeholder={publicKey?.toBase58() || ""}
                />
                <Button
                  variant="contained"
                  onClick={() => {
                    void mintNft();
                  }}
                  disabled={!connected || isSubmitting}
                >
                  Mint NFT
                </Button>
              </Stack>
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedTool === "candy"}
            onChange={(_event, isExpanded) => {
              setExpandedTool(isExpanded ? "candy" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important"
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedTool === "candy" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">Candy Machine (Create + Claim)</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <CandyMachineManager onRefreshHoldings={refresh} />
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedTool === "send"}
            onChange={(_event, isExpanded) => {
              setExpandedTool(isExpanded ? "send" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important"
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedTool === "send" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">Send NFT</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <Stack spacing={1}>
                <TextField
                  size="small"
                  label="Mint Address"
                  value={sendMintAddress}
                  onChange={(event) => {
                    setSendMintAddress(event.target.value);
                  }}
                />
                <TextField
                  size="small"
                  label="Destination Wallet"
                  value={sendDestination}
                  onChange={(event) => {
                    setSendDestination(event.target.value);
                  }}
                />
                <Button
                  variant="outlined"
                  onClick={() => {
                    void sendNft();
                  }}
                  disabled={!connected || isSubmitting}
                >
                  Send NFT
                </Button>
              </Stack>
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedTool === "retangle"}
            onChange={(_event, isExpanded) => {
              setExpandedTool(isExpanded ? "retangle" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important"
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedTool === "retangle" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">Retangle (Clone to New Mint)</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary">
                  Copy an existing NFT into a new mint. Leave override fields empty to reuse source metadata.
                </Typography>
                <TextField
                  size="small"
                  label="Source Mint"
                  value={cloneSourceMint}
                  onChange={(event) => {
                    setCloneSourceMint(event.target.value);
                  }}
                />
                <TextField
                  size="small"
                  label="Recipient Wallet (optional)"
                  value={cloneRecipient}
                  onChange={(event) => {
                    setCloneRecipient(event.target.value);
                  }}
                  placeholder={publicKey?.toBase58() || ""}
                />
                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                  <TextField
                    size="small"
                    label="Name Override (optional)"
                    value={cloneName}
                    onChange={(event) => {
                      setCloneName(event.target.value);
                    }}
                  />
                  <TextField
                    size="small"
                    label="Symbol Override (optional)"
                    value={cloneSymbol}
                    onChange={(event) => {
                      setCloneSymbol(event.target.value);
                    }}
                  />
                </Stack>
                <TextField
                  size="small"
                  label="URI Override (optional)"
                  value={cloneUri}
                  onChange={(event) => {
                    setCloneUri(event.target.value);
                  }}
                />
                <Button
                  variant="outlined"
                  onClick={() => {
                    void retangleNft();
                  }}
                  disabled={!connected || isSubmitting}
                >
                  Retangle NFT
                </Button>
              </Stack>
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedTool === "batch"}
            onChange={(_event, isExpanded) => {
              setExpandedTool(isExpanded ? "batch" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important"
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedTool === "batch" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">Mass Metadata Push (URI)</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary">
                  Use one URI for all target mints, or include {"{mint}"} placeholder to generate per-mint URIs.
                </Typography>
                <TextField
                  size="small"
                  label="URI or URI Template"
                  value={batchUri}
                  onChange={(event) => {
                    setBatchUri(event.target.value);
                  }}
                  placeholder="https://example.com/metadata/{mint}.json"
                />
                <TextField
                  multiline
                  minRows={6}
                  size="small"
                  label="Target Mints (one per line)"
                  value={batchMintList}
                  onChange={(event) => {
                    setBatchMintList(event.target.value);
                  }}
                  placeholder="Leave empty to use loaded managed NFTs."
                />
                <Button
                  variant="contained"
                  onClick={() => {
                    void pushBatchMetadataUri();
                  }}
                  disabled={!connected || isSubmitting}
                >
                  Push Metadata URI
                </Button>
              </Stack>
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedTool === "collection"}
            onChange={(_event, isExpanded) => {
              setExpandedTool(isExpanded ? "collection" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important"
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedTool === "collection" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">Collection Authority Manager</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary">
                  Set/verify/unverify collection links for NFTs. `Clear` removes collection via update authority.
                </Typography>
                <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap>
                  {[
                    { value: "set-verify", label: "Set + Verify" },
                    { value: "verify", label: "Verify" },
                    { value: "unverify", label: "Unverify" },
                    { value: "clear", label: "Clear" }
                  ].map((option) => (
                    <Chip
                      key={option.value}
                      size="small"
                      clickable
                      label={option.label}
                      color={collectionAction === option.value ? "primary" : "default"}
                      variant={collectionAction === option.value ? "filled" : "outlined"}
                      onClick={() => {
                        setCollectionAction(
                          option.value as "set-verify" | "verify" | "unverify" | "clear"
                        );
                      }}
                    />
                  ))}
                </Stack>
                {collectionAction !== "clear" ? (
                  <TextField
                    size="small"
                    label="Collection Mint"
                    value={collectionMint}
                    onChange={(event) => {
                      setCollectionMint(event.target.value);
                    }}
                  />
                ) : null}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      setCollectionTargetMints(managedMintList);
                    }}
                    disabled={!managedMintList}
                  >
                    Use Loaded Managed NFTs
                  </Button>
                </Stack>
                <TextField
                  multiline
                  minRows={6}
                  size="small"
                  label="Target NFT Mints (one per line)"
                  value={collectionTargetMints}
                  onChange={(event) => {
                    setCollectionTargetMints(event.target.value);
                  }}
                  placeholder="Leave empty to use loaded managed NFTs."
                />
                <Button
                  variant="contained"
                  onClick={() => {
                    void runCollectionAuthorityAction();
                  }}
                  disabled={!connected || isSubmitting}
                >
                  Run Collection Action
                </Button>
              </Stack>
            </AccordionDetails>
          </Accordion>

          {managedNfts.length > 0 ? (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Loaded managed NFTs: {managedNfts.length}
              </Typography>
              <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap sx={{ mt: 0.7 }}>
                {managedNfts.slice(0, 16).map((nft) => (
                  <Chip
                    key={nft.mint}
                    size="small"
                    variant="outlined"
                    label={`${nft.name || shortenAddress(nft.mint)}`}
                    component="a"
                    clickable
                    href={explorerAddressUrl(nft.mint)}
                    target="_blank"
                    rel="noreferrer"
                  />
                ))}
              </Stack>
            </Box>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
