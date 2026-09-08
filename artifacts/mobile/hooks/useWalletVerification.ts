import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { playModeQueryKey, type PlayModeState } from "@/hooks/usePlayMode";
import { characterProfilesQueryKey } from "@/hooks/useCharacterProfiles";

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

export interface WalletChallenge {
  id: string;
  walletAddress: string;
  message: string;
  expiresAt: string;
  nftContractAddress: string | null;
  nftChainId: number | null;
  chainId: number;
  domain: string;
  uri: string;
}

export interface VerifyWalletResult {
  ok: true;
  status: WalletStatus;
  nftOwned: boolean;
  balance: string | null;
  configMissing: boolean;
}

export interface EquipStarResult {
  equippedStar: NonNullable<PlayModeState["equippedStar"]>;
  state: PlayModeState;
}

export interface WalletNftToken {
  collectionId: string;
  chainId: number;
  contractAddress: string;
  collectionName: string;
  ipName: string;
  category: string;
  tokenId: string;
}

export interface WalletNftCollection {
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
  tokens: WalletNftToken[];
}

export interface WalletNftInventory {
  walletAddress: string;
  collections: WalletNftCollection[];
  totalOwned: number;
  hasEligibleNft: boolean;
  configuredCollectionCount: number;
  failedCollectionCount: number;
  partial: boolean;
  checkedAt: string;
}

export const walletStatusQueryKey = ["wallet-status"] as const;
export const walletNftInventoryQueryKey = ["wallet-nft-inventory"] as const;

export function useWalletVerification() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: walletStatusQueryKey,
    queryFn: () =>
      customFetch<WalletStatus>("/api/users/me/wallet", {
        responseType: "json",
      }),
  });
  const inventoryQuery = useQuery({
    queryKey: walletNftInventoryQueryKey,
    queryFn: () =>
      customFetch<WalletNftInventory>("/api/users/me/wallet/nfts", {
        responseType: "json",
      }),
    enabled: statusQuery.data?.walletVerified === true,
  });

  const challengeMutation = useMutation({
    mutationFn: ({ walletAddress, chainId }: { walletAddress: string; chainId?: number }) =>
      customFetch<WalletChallenge>("/api/users/me/wallet/challenge", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ walletAddress, chainId }),
      }),
  });

  const verifyMutation = useMutation({
    mutationFn: ({
      walletAddress,
      challengeId,
      signature,
    }: {
      walletAddress: string;
      challengeId: string;
      signature: string;
    }) =>
      customFetch<VerifyWalletResult>("/api/users/me/wallet/verify", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ walletAddress, challengeId, signature }),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(walletStatusQueryKey, result.status);
      queryClient.invalidateQueries({ queryKey: walletNftInventoryQueryKey });
      queryClient.invalidateQueries({ queryKey: playModeQueryKey });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () =>
      customFetch<VerifyWalletResult>("/api/users/me/wallet/refresh", {
        method: "POST",
        responseType: "json",
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(walletStatusQueryKey, result.status);
      queryClient.invalidateQueries({ queryKey: walletNftInventoryQueryKey });
      queryClient.invalidateQueries({ queryKey: playModeQueryKey });
    },
  });

  const equipMutation = useMutation({
    mutationFn: ({ tokenId, collectionId }: { tokenId: string; collectionId?: string }) =>
      customFetch<EquipStarResult>("/api/users/me/star-nft/equip", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ tokenId, collectionId }),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(playModeQueryKey, result.state);
      queryClient.invalidateQueries({ queryKey: walletStatusQueryKey });
      queryClient.invalidateQueries({ queryKey: walletNftInventoryQueryKey });
      queryClient.invalidateQueries({ queryKey: characterProfilesQueryKey });
    },
  });

  return {
    status: statusQuery.data,
    inventory: inventoryQuery.data,
    isLoadingStatus: statusQuery.isLoading,
    isLoadingInventory: inventoryQuery.isLoading,
    refetchStatus: statusQuery.refetch,
    refetchInventory: inventoryQuery.refetch,
    createChallenge: (walletAddress: string, chainId?: number) =>
      challengeMutation.mutateAsync({ walletAddress, chainId }),
    verifyWallet: verifyMutation.mutateAsync,
    refreshWallet: refreshMutation.mutateAsync,
    equipStar: (tokenId: string, collectionId?: string) => equipMutation.mutateAsync({ tokenId, collectionId }),
    isCreatingChallenge: challengeMutation.isPending,
    isVerifying: verifyMutation.isPending,
    isRefreshing: refreshMutation.isPending,
    isEquipping: equipMutation.isPending,
  };
}
