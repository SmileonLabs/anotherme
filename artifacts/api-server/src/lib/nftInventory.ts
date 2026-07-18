import { and, eq, isNotNull } from "drizzle-orm";
import { db, nftCollectionsTable, userWalletsTable } from "@workspace/db";
import { getAddress, type Address } from "viem";
import { listOwnedErc721TokensWithConfig, type NftConfig } from "./nft";

export interface WalletNftTokenView {
  collectionId: string;
  chainId: number;
  contractAddress: string;
  collectionName: string;
  ipName: string;
  category: string;
  tokenId: string;
}

export interface WalletNftCollectionView {
  collectionId: string;
  chainId: number;
  contractAddress: string;
  collectionName: string;
  ipName: string;
  category: string;
  balance: string;
  enumerable: boolean;
  truncated: boolean;
  requiresTokenId: boolean;
  tokens: WalletNftTokenView[];
}

export interface WalletNftInventoryView {
  walletAddress: string;
  collections: WalletNftCollectionView[];
  totalOwned: number;
  hasEligibleNft: boolean;
  configuredCollectionCount: number;
  failedCollectionCount: number;
  partial: boolean;
  checkedAt: string;
}

type InventoryCheckResult =
  | { kind: "owned"; collection: WalletNftCollectionView }
  | { kind: "empty" }
  | { kind: "skipped" }
  | { kind: "failed" };

export async function getVerifiedWalletAddress(userId: string): Promise<Address | null> {
  const [wallet] = await db
    .select({ walletAddress: userWalletsTable.walletAddress })
    .from(userWalletsTable)
    .where(and(eq(userWalletsTable.userId, userId), isNotNull(userWalletsTable.verifiedAt)))
    .limit(1);
  return wallet ? getAddress(wallet.walletAddress) : null;
}

export async function listWalletNftInventory(
  userId: string,
  options: { failFast?: boolean } = {},
): Promise<WalletNftInventoryView> {
  const walletAddress = await getVerifiedWalletAddress(userId);
  if (!walletAddress) throw new Error("wallet_required");
  return listAddressNftInventory(walletAddress, options);
}

export async function listAddressNftInventory(
  walletAddress: Address,
  options: { failFast?: boolean } = {},
): Promise<WalletNftInventoryView> {
  const collections = await db
    .select()
    .from(nftCollectionsTable)
    .where(eq(nftCollectionsTable.status, "published"))
    .limit(50);
  const configuredCollectionCount = collections.filter((collection) => {
    if (!collection.rpcUrl) return false;
    try {
      getAddress(collection.contractAddress);
      return true;
    } catch {
      return false;
    }
  }).length;

  const results = await Promise.all(
    collections.map(async (collection): Promise<InventoryCheckResult> => {
      let contractAddress: Address;
      try {
        contractAddress = getAddress(collection.contractAddress);
      } catch {
        return { kind: "skipped" };
      }
      const config: NftConfig = {
        configured: Boolean(collection.rpcUrl),
        rpcUrl: collection.rpcUrl,
        contractAddress,
        chainId: collection.chainId,
      };
      if (!config.configured) return { kind: "skipped" };

      try {
        const ownership = await listOwnedErc721TokensWithConfig(walletAddress, config);
        if (!ownership.configured) return { kind: "failed" };
        if (ownership.balance == null || ownership.balance === 0n) return { kind: "empty" };
        return {
          kind: "owned",
          collection: {
            collectionId: collection.id,
            chainId: collection.chainId,
            contractAddress,
            collectionName: collection.name,
            ipName: collection.ipName,
            category: collection.category,
            balance: ownership.balance.toString(),
            enumerable: ownership.enumerable,
            truncated: ownership.truncated,
            requiresTokenId: !ownership.enumerable,
            tokens: ownership.tokenIds.map((tokenId) => ({
              collectionId: collection.id,
              chainId: collection.chainId,
              contractAddress,
              collectionName: collection.name,
              ipName: collection.ipName,
              category: collection.category,
              tokenId,
            })),
          },
        };
      } catch (error) {
        if (options.failFast) throw error;
        return { kind: "failed" };
      }
    }),
  );

  const ownedCollections = results.flatMap((result) =>
    result.kind === "owned" ? [result.collection] : [],
  );
  const failedCollectionCount = results.filter((result) => result.kind === "failed").length;
  if (failedCollectionCount > 0 && ownedCollections.length === 0) {
    throw new Error("nft_inventory_unavailable");
  }
  return {
    walletAddress,
    collections: ownedCollections,
    totalOwned: ownedCollections.reduce((sum, collection) => sum + Number(collection.balance), 0),
    hasEligibleNft: ownedCollections.length > 0,
    configuredCollectionCount,
    failedCollectionCount,
    partial: failedCollectionCount > 0,
    checkedAt: new Date().toISOString(),
  };
}
