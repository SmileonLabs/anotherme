import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createPublicClient, getAddress, http } from "viem";

const MAX_METADATA_BYTES = 1 * 1024 * 1024;
const MAX_REFERENCE_IMAGE_BYTES = 12 * 1024 * 1024;
const tokenUriAbi = [{
  type: "function",
  name: "tokenURI",
  stateMutability: "view",
  inputs: [{ name: "tokenId", type: "uint256" }],
  outputs: [{ name: "", type: "string" }],
}] as const;
const erc1155UriAbi = [{
  type: "function",
  name: "uri",
  stateMutability: "view",
  inputs: [{ name: "tokenId", type: "uint256" }],
  outputs: [{ name: "", type: "string" }],
}] as const;

export interface NftReferenceSource {
  chainId: number;
  contractAddress: string;
  rpcUrl?: string | null;
  metadataUrl?: string | null;
  tokenId?: string;
}

export interface NftReferenceImage {
  data: Buffer;
  contentType: "image/png" | "image/jpeg" | "image/webp";
}

function isPrivateIp(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168);
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized === "::" ||
      normalized.startsWith("fc") || normalized.startsWith("fd") ||
      normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
      normalized.startsWith("fea") || normalized.startsWith("feb");
  }
  return true;
}

async function assertPublicHttps(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("NFT reference URL must use HTTPS");
  if (url.username || url.password) throw new Error("NFT reference URL must not include credentials");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) throw new Error("Local NFT reference URL is not allowed");
  const addresses = await lookup(hostname, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("Private NFT reference host is not allowed");
  }
  return url;
}

function normalizeContentUrl(value: string, baseUrl?: string): string {
  if (value.startsWith("ipfs://")) {
    const gateway = (process.env.NFT_IPFS_GATEWAY || "https://ipfs.io/ipfs/").replace(/\/+$/, "");
    return `${gateway}/${value.slice("ipfs://".length).replace(/^ipfs\//, "")}`;
  }
  if (value.startsWith("data:")) return value;
  return baseUrl ? new URL(value, baseUrl).toString() : value;
}

async function readLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("NFT reference response is too large");
  if (!response.body) throw new Error("NFT reference response has no body");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new Error("NFT reference response is too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function fetchPublic(rawUrl: string, maxBytes: number): Promise<{ data: Buffer; contentType: string; finalUrl: string }> {
  let url = rawUrl;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    await assertPublicHttps(url);
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("NFT reference redirect has no location");
      url = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) throw new Error(`NFT reference request failed (${response.status})`);
    return {
      data: await readLimited(response, maxBytes),
      contentType: (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(),
      finalUrl: url,
    };
  }
  throw new Error("NFT reference redirected too many times");
}

function decodeDataUri(value: string, maxBytes: number): { data: Buffer; contentType: string } {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(value);
  if (!match) throw new Error("Invalid NFT data URI");
  const data = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "utf8");
  if (data.length === 0 || data.length > maxBytes) throw new Error("NFT data URI has an invalid size");
  return { data, contentType: match[1].toLowerCase() };
}

async function loadMetadata(metadataUrl: string): Promise<{ metadata: Record<string, unknown>; finalUrl?: string }> {
  if (metadataUrl.startsWith("data:")) {
    const decoded = decodeDataUri(metadataUrl, MAX_METADATA_BYTES);
    return { metadata: JSON.parse(decoded.data.toString("utf8")) as Record<string, unknown> };
  }
  const result = await fetchPublic(metadataUrl, MAX_METADATA_BYTES);
  return { metadata: JSON.parse(result.data.toString("utf8")) as Record<string, unknown>, finalUrl: result.finalUrl };
}

async function resolveTokenMetadataUrl(source: NftReferenceSource): Promise<string> {
  const preferredTokenId = source.tokenId && /^\d{1,78}$/.test(source.tokenId) ? source.tokenId : "1";
  if (source.metadataUrl) {
    return normalizeContentUrl(source.metadataUrl.replace(/\{id\}/gi, preferredTokenId));
  }
  if (!source.rpcUrl) throw new Error("NFT RPC URL is not configured");
  await assertPublicHttps(source.rpcUrl);
  const chain = {
    id: source.chainId,
    name: `NFT chain ${source.chainId}`,
    nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
    rpcUrls: { default: { http: [source.rpcUrl] } },
  } as const;
  const client = createPublicClient({ chain, transport: http(source.rpcUrl) });
  const address = getAddress(source.contractAddress);
  const tokenIds = Array.from(new Set([preferredTokenId, "1", "0"])).map((value) => BigInt(value));
  for (const tokenId of tokenIds) {
    for (const abi of [tokenUriAbi, erc1155UriAbi] as const) {
      try {
        const result = await client.readContract({ address, abi, functionName: abi[0].name, args: [tokenId] });
        if (typeof result === "string" && result.length > 0) {
          return normalizeContentUrl(result.replace(/\{id\}/gi, tokenId.toString()));
        }
      } catch {
        // Try the next standard/token ID.
      }
    }
  }
  throw new Error("Could not resolve an NFT token metadata URL");
}

export async function resolveNftReferenceImage(source: NftReferenceSource): Promise<NftReferenceImage> {
  const metadataUrl = await resolveTokenMetadataUrl(source);
  const { metadata, finalUrl } = await loadMetadata(metadataUrl);
  const imageValue = typeof metadata.image === "string"
    ? metadata.image
    : typeof metadata.image_url === "string"
      ? metadata.image_url
      : null;
  if (!imageValue) throw new Error("NFT metadata has no image");
  const imageUrl = normalizeContentUrl(imageValue, finalUrl);
  const result = imageUrl.startsWith("data:")
    ? decodeDataUri(imageUrl, MAX_REFERENCE_IMAGE_BYTES)
    : await fetchPublic(imageUrl, MAX_REFERENCE_IMAGE_BYTES);
  const contentType = result.contentType === "image/jpg" ? "image/jpeg" : result.contentType;
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) {
    throw new Error("NFT reference image format is not supported");
  }
  return { data: result.data, contentType: contentType as NftReferenceImage["contentType"] };
}
