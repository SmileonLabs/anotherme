import { randomBytes } from "node:crypto";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import {
  db,
  userPlayModesTable,
  userWalletsTable,
  walletVerificationChallengesTable,
  type UserWallet,
} from "@workspace/db";
import { getAddress, verifyMessage, type Address, type Hex } from "viem";
import { ensurePlayModeState } from "./fanStar";
import { checkNftBalance, getNftConfig } from "./nft";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export interface WalletStatus {
  walletAddress: string | null;
  chainId: number | null;
  walletVerified: boolean;
  nftVerified: boolean;
  lastCheckedAt: string | null;
  nftContractAddress: string | null;
  nftChainId: number | null;
  nftConfigured: boolean;
  starUnlocked: boolean;
}

export interface WalletChallengeView {
  id: string;
  walletAddress: string;
  message: string;
  expiresAt: string;
  nftContractAddress: string | null;
  nftChainId: number | null;
}

export interface VerifyWalletResult {
  ok: true;
  status: WalletStatus;
  nftOwned: boolean;
  balance: string | null;
  configMissing: boolean;
}

export class WalletVerificationError extends Error {
  constructor(
    readonly code:
      | "invalid_wallet"
      | "invalid_signature"
      | "challenge_not_found"
      | "challenge_expired"
      | "wallet_claimed"
      | "nft_check_failed",
    message: string,
  ) {
    super(message);
  }
}

function normalizeWalletAddress(value: string): Address {
  try {
    return getAddress(value.trim());
  } catch {
    throw new WalletVerificationError("invalid_wallet", "올바른 EVM 지갑 주소를 입력해 주세요.");
  }
}

function buildChallengeMessage(params: {
  walletAddress: string;
  userId: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}) {
  return [
    "Another Me STAR NFT verification",
    "",
    "Sign this message to prove that you control this wallet.",
    "This does not grant token transfer permission and costs no gas.",
    "",
    `Wallet: ${params.walletAddress}`,
    `User: ${params.userId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${params.issuedAt.toISOString()}`,
    `Expires At: ${params.expiresAt.toISOString()}`,
  ].join("\n");
}

function serializeWalletStatus(row: UserWallet | undefined, starUnlocked: boolean): WalletStatus {
  const config = getNftConfig();
  return {
    walletAddress: row?.walletAddress ?? null,
    chainId: row?.chainId ?? config.chainId,
    walletVerified: row?.verifiedAt != null,
    nftVerified: row?.nftVerifiedAt != null,
    lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
    nftContractAddress: config.contractAddress,
    nftChainId: config.chainId,
    nftConfigured: config.configured,
    starUnlocked,
  };
}

export async function getWalletStatus(userId: string): Promise<WalletStatus> {
  const [wallet] = await db
    .select()
    .from(userWalletsTable)
    .where(eq(userWalletsTable.userId, userId))
    .orderBy(desc(userWalletsTable.updatedAt))
    .limit(1);
  const playMode = await ensurePlayModeState(userId);
  return serializeWalletStatus(wallet, playMode.starUnlocked);
}

export async function createWalletChallenge(params: {
  userId: string;
  walletAddress: string;
}): Promise<WalletChallengeView> {
  const walletAddress = normalizeWalletAddress(params.walletAddress);
  const config = getNftConfig();
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
  const message = buildChallengeMessage({
    walletAddress,
    userId: params.userId,
    nonce,
    issuedAt,
    expiresAt,
  });

  const [challenge] = await db
    .insert(walletVerificationChallengesTable)
    .values({
      userId: params.userId,
      walletAddress,
      nonce,
      message,
      expiresAt,
    })
    .returning();

  if (!challenge) throw new Error("wallet challenge create failed");
  return {
    id: challenge.id,
    walletAddress,
    message,
    expiresAt: expiresAt.toISOString(),
    nftContractAddress: config.contractAddress,
    nftChainId: config.chainId,
  };
}

async function syncStarUnlock(userId: string, unlock: boolean | null) {
  await db.insert(userPlayModesTable).values({ userId }).onConflictDoNothing();
  if (unlock === null) return;
  await db
    .update(userPlayModesTable)
    .set({ starUnlocked: unlock, currentMode: unlock ? "star" : "fan" })
    .where(eq(userPlayModesTable.userId, userId));
}

export async function verifyWalletChallenge(params: {
  userId: string;
  walletAddress: string;
  challengeId: string;
  signature: string;
}): Promise<VerifyWalletResult> {
  const walletAddress = normalizeWalletAddress(params.walletAddress);
  const [challenge] = await db
    .select()
    .from(walletVerificationChallengesTable)
    .where(
      and(
        eq(walletVerificationChallengesTable.id, params.challengeId),
        eq(walletVerificationChallengesTable.userId, params.userId),
        eq(walletVerificationChallengesTable.walletAddress, walletAddress),
        isNull(walletVerificationChallengesTable.consumedAt),
      ),
    )
    .limit(1);

  if (!challenge) {
    throw new WalletVerificationError("challenge_not_found", "인증 메시지를 다시 생성해 주세요.");
  }
  if (challenge.expiresAt.getTime() <= Date.now()) {
    throw new WalletVerificationError("challenge_expired", "인증 메시지가 만료됐어요. 다시 생성해 주세요.");
  }

  const signature = params.signature.trim() as Hex;
  let valid = false;
  try {
    valid = await verifyMessage({ address: walletAddress, message: challenge.message, signature });
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new WalletVerificationError("invalid_signature", "서명이 지갑 주소와 일치하지 않아요.");
  }

  const [existing] = await db
    .select()
    .from(userWalletsTable)
    .where(eq(userWalletsTable.walletAddress, walletAddress))
    .limit(1);
  if (existing && existing.userId !== params.userId) {
    throw new WalletVerificationError("wallet_claimed", "이미 다른 계정에 연결된 지갑이에요.");
  }

  let nft;
  try {
    nft = await checkNftBalance(walletAddress);
  } catch {
    throw new WalletVerificationError("nft_check_failed", "NFT 보유 여부를 확인하지 못했어요.");
  }

  const now = new Date();
  const config = getNftConfig();
  await db.transaction(async (tx) => {
    await tx
      .insert(userWalletsTable)
      .values({
        userId: params.userId,
        walletAddress,
        chainId: config.chainId ?? 1,
        verifiedAt: now,
        nftVerifiedAt: nft.owns ? now : null,
        lastCheckedAt: now,
      })
      .onConflictDoUpdate({
        target: userWalletsTable.walletAddress,
        set: {
          verifiedAt: now,
          nftVerifiedAt: nft.owns ? now : null,
          lastCheckedAt: now,
          updatedAt: now,
        },
      });

    await tx
      .update(walletVerificationChallengesTable)
      .set({ consumedAt: now })
      .where(eq(walletVerificationChallengesTable.id, challenge.id));
  });

  await syncStarUnlock(params.userId, nft.configured ? nft.owns : null);

  return {
    ok: true,
    status: await getWalletStatus(params.userId),
    nftOwned: nft.owns,
    balance: nft.balance?.toString() ?? null,
    configMissing: !nft.configured,
  };
}

export async function refreshWalletNft(userId: string): Promise<VerifyWalletResult> {
  const [wallet] = await db
    .select()
    .from(userWalletsTable)
    .where(and(eq(userWalletsTable.userId, userId), isNotNull(userWalletsTable.verifiedAt)))
    .orderBy(desc(userWalletsTable.updatedAt))
    .limit(1);
  if (!wallet) {
    throw new WalletVerificationError("challenge_not_found", "먼저 지갑을 인증해 주세요.");
  }

  let nft;
  try {
    nft = await checkNftBalance(normalizeWalletAddress(wallet.walletAddress));
  } catch {
    throw new WalletVerificationError("nft_check_failed", "NFT 보유 여부를 확인하지 못했어요.");
  }

  const now = new Date();
  await db
    .update(userWalletsTable)
    .set({
      nftVerifiedAt: nft.owns ? now : null,
      lastCheckedAt: now,
      updatedAt: now,
    })
    .where(eq(userWalletsTable.id, wallet.id));
  await syncStarUnlock(userId, nft.configured ? nft.owns : null);

  return {
    ok: true,
    status: await getWalletStatus(userId),
    nftOwned: nft.owns,
    balance: nft.balance?.toString() ?? null,
    configMissing: !nft.configured,
  };
}
