import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  type Address,
} from "viem";

const erc721Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
] as const;

export interface NftConfig {
  configured: boolean;
  rpcUrl: string | null;
  contractAddress: Address | null;
  chainId: number | null;
}

export interface StarIdentity {
  starKey: string;
  displayName: string;
}

export function getNftConfig(): NftConfig {
  const rpcUrl = process.env.STAR_NFT_RPC_URL ?? process.env.NFT_RPC_URL ?? null;
  const rawContract = process.env.STAR_NFT_CONTRACT_ADDRESS ?? process.env.NFT_CONTRACT_ADDRESS ?? null;
  const rawChainId = process.env.STAR_NFT_CHAIN_ID ?? process.env.NFT_CHAIN_ID ?? "1";
  const chainId = Number.parseInt(rawChainId, 10);
  let contractAddress: Address | null = null;
  if (rawContract) {
    try {
      contractAddress = getAddress(rawContract);
    } catch {
      contractAddress = null;
    }
  }

  const configured = Boolean(rpcUrl && contractAddress && Number.isInteger(chainId) && chainId > 0);
  return {
    configured,
    rpcUrl,
    contractAddress,
    chainId: Number.isInteger(chainId) && chainId > 0 ? chainId : null,
  };
}

export function normalizeTokenId(value: string): string {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) throw new Error("invalid_token_id");
  return BigInt(trimmed).toString();
}

export function getStarIdentityForToken(tokenId: string): StarIdentity {
  const normalized = normalizeTokenId(tokenId);
  const rawMap = process.env.STAR_NFT_IDENTITY_MAP;
  if (rawMap) {
    try {
      const map = JSON.parse(rawMap) as Record<string, string | { key?: string; name?: string }>;
      const entry = map[normalized];
      if (typeof entry === "string" && entry.trim()) {
        return { starKey: `star-${normalized}`, displayName: entry.trim() };
      }
      if (entry && typeof entry === "object") {
        const displayName = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : null;
        const starKey = typeof entry.key === "string" && entry.key.trim() ? entry.key.trim() : null;
        if (displayName) return { starKey: starKey ?? `star-${normalized}`, displayName };
      }
    } catch {
      // Invalid env mapping should not break verification; fall back below.
    }
  }

  if (normalized === "1") return { starKey: "bibi", displayName: "비비" };
  return { starKey: `star-${normalized}`, displayName: `STAR #${normalized}` };
}

function getClient(config: NftConfig) {
  if (!config.configured || !config.rpcUrl || !config.contractAddress || !config.chainId) return null;
  const chain = defineChain({
    id: config.chainId,
    name: `Configured NFT Chain ${config.chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  return createPublicClient({ chain, transport: http(config.rpcUrl) });
}

export async function checkNftBalance(walletAddress: Address): Promise<{
  configured: boolean;
  owns: boolean;
  balance: bigint | null;
}> {
  const config = getNftConfig();
  const client = getClient(config);
  if (!client || !config.contractAddress) return { configured: false, owns: false, balance: null };

  const balance = await client.readContract({
    address: config.contractAddress,
    abi: erc721Abi,
    functionName: "balanceOf",
    args: [walletAddress],
  });
  return { configured: true, owns: balance > 0n, balance };
}

export async function checkNftTokenOwner(tokenId: string): Promise<{
  configured: boolean;
  owner: Address | null;
}> {
  const config = getNftConfig();
  const client = getClient(config);
  if (!client || !config.contractAddress) return { configured: false, owner: null };

  const owner = await client.readContract({
    address: config.contractAddress,
    abi: erc721Abi,
    functionName: "ownerOf",
    args: [BigInt(normalizeTokenId(tokenId))],
  });
  return { configured: true, owner: getAddress(owner) };
}

export async function checkNftTokenOwnerWithConfig(tokenId: string, config: NftConfig): Promise<{
  configured: boolean;
  owner: Address | null;
}> {
  const client = getClient(config);
  if (!client || !config.contractAddress) return { configured: false, owner: null };
  const owner = await client.readContract({
    address: config.contractAddress,
    abi: erc721Abi,
    functionName: "ownerOf",
    args: [BigInt(normalizeTokenId(tokenId))],
  });
  return { configured: true, owner: getAddress(owner) };
}

export async function listOwnedErc721TokensWithConfig(
  walletAddress: Address,
  config: NftConfig,
  limit = 50,
): Promise<{
  configured: boolean;
  balance: bigint | null;
  tokenIds: string[];
  enumerable: boolean;
  truncated: boolean;
}> {
  const client = getClient(config);
  if (!client || !config.contractAddress) {
    return { configured: false, balance: null, tokenIds: [], enumerable: false, truncated: false };
  }

  const balance = await client.readContract({
    address: config.contractAddress,
    abi: erc721Abi,
    functionName: "balanceOf",
    args: [walletAddress],
  });
  if (balance === 0n) {
    return { configured: true, balance, tokenIds: [], enumerable: true, truncated: false };
  }

  const count = Number(balance > BigInt(limit) ? BigInt(limit) : balance);
  try {
    const tokenIds = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        client.readContract({
          address: config.contractAddress!,
          abi: erc721Abi,
          functionName: "tokenOfOwnerByIndex",
          args: [walletAddress, BigInt(index)],
        }),
      ),
    );
    return {
      configured: true,
      balance,
      tokenIds: tokenIds.map((tokenId) => tokenId.toString()),
      enumerable: true,
      truncated: balance > BigInt(limit),
    };
  } catch {
    // ERC-721Enumerable is optional. The caller can offer a token-id ownership
    // check without pretending that a non-enumerable collection is empty.
    return { configured: true, balance, tokenIds: [], enumerable: false, truncated: false };
  }
}
