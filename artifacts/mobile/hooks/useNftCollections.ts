import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type NftCollection = {
  id: string;
  chainId: number;
  contractAddress: string;
  name: string;
  ipName: string;
  category: "idol" | "sports" | "comic" | "character" | "other" | string;
  roleName: string | null;
  worldStyle: string | null;
  status: string;
};

export const nftCollectionsQueryKey = ["nft-collections"] as const;

export function useNftCollections() {
  return useQuery({
    queryKey: nftCollectionsQueryKey,
    queryFn: () => customFetch<NftCollection[]>("/api/nft/collections", { responseType: "json" }),
    staleTime: 5 * 60_000,
  });
}

export function useNftEvolutionStages(collectionId: string | null) {
  return useQuery({
    queryKey: ["nft-collections", collectionId, "evolution"],
    enabled: Boolean(collectionId),
    queryFn: () => customFetch<Array<{ id: string; stageKey: string; minLevel: number; maxLevel: number | null; title: string; description: string; imageUrl: string | null }>>(`/api/nft/collections/${collectionId}/evolution`, { responseType: "json" }),
  });
}

export function useNftRpgContent(collectionId: string | null) {
  return useQuery({
    queryKey: ["nft-collections", collectionId, "rpg-content"],
    enabled: Boolean(collectionId),
    queryFn: () => customFetch<{ collectionId: string; ipName: string; category: string; roleName: string; worldStyle: string; missions: Array<{ id: string; title: string; description: string; xp: number }>; story: { opening: string; next: string } }>(`/api/nft/collections/${collectionId}/rpg-content`, { responseType: "json" }),
  });
}
