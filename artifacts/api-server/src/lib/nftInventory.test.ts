import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const collectionsTable = {
    status: "collection.status",
    contractAddress: "collection.contractAddress",
  };
  return {
    collectionsTable,
    state: {
      collections: [] as Array<Record<string, any>>,
      results: new Map<string, { balance: bigint | null; tokenIds?: string[] } | Error>(),
    },
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
  isNotNull: (value: unknown) => value,
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => mocks.state.collections,
        }),
      }),
    }),
  },
  nftCollectionsTable: mocks.collectionsTable,
  userWalletsTable: {
    userId: "wallet.userId",
    verifiedAt: "wallet.verifiedAt",
    walletAddress: "wallet.walletAddress",
  },
}));

vi.mock("./nft", () => ({
  listOwnedErc721TokensWithConfig: async (
    _walletAddress: string,
    config: { contractAddress: string },
  ) => {
    const result = mocks.state.results.get(config.contractAddress);
    if (result instanceof Error) throw result;
    return {
      configured: true,
      balance: result?.balance ?? 0n,
      tokenIds: result?.tokenIds ?? [],
      enumerable: true,
      truncated: false,
    };
  },
}));

import { listAddressNftInventory } from "./nftInventory";

const walletAddress = "0x1111111111111111111111111111111111111111";
const firstContract = "0x2222222222222222222222222222222222222222";
const secondContract = "0x3333333333333333333333333333333333333333";

function collection(id: string, contractAddress: string) {
  return {
    id,
    chainId: 56,
    contractAddress,
    rpcUrl: "https://rpc.invalid",
    name: `Collection ${id}`,
    ipName: `IP ${id}`,
    category: "character",
    status: "published",
  };
}

beforeEach(() => {
  mocks.state.collections = [];
  mocks.state.results.clear();
});

describe("NFT inventory RPC failure handling", () => {
  it("returns a complete empty inventory when configured RPC checks succeed", async () => {
    mocks.state.collections = [collection("one", firstContract)];
    mocks.state.results.set(firstContract, { balance: 0n });

    const result = await listAddressNftInventory(walletAddress);

    expect(result.hasEligibleNft).toBe(false);
    expect(result.failedCollectionCount).toBe(0);
    expect(result.partial).toBe(false);
  });

  it("does not misreport an RPC outage as no NFT ownership", async () => {
    mocks.state.collections = [collection("one", firstContract)];
    mocks.state.results.set(firstContract, new Error("rpc unavailable"));

    await expect(listAddressNftInventory(walletAddress)).rejects.toThrow(
      "nft_inventory_unavailable",
    );
  });

  it("returns owned NFTs with a partial flag when another collection RPC fails", async () => {
    mocks.state.collections = [
      collection("one", firstContract),
      collection("two", secondContract),
    ];
    mocks.state.results.set(firstContract, { balance: 1n, tokenIds: ["7"] });
    mocks.state.results.set(secondContract, new Error("rpc unavailable"));

    const result = await listAddressNftInventory(walletAddress);

    expect(result.hasEligibleNft).toBe(true);
    expect(result.collections[0]?.tokens[0]?.tokenId).toBe("7");
    expect(result.failedCollectionCount).toBe(1);
    expect(result.partial).toBe(true);
  });
});
