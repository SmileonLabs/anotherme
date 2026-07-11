import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { playModeQueryKey, type PlayModeState } from "@/hooks/usePlayMode";

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

export const walletStatusQueryKey = ["wallet-status"] as const;

export function useWalletVerification() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: walletStatusQueryKey,
    queryFn: () =>
      customFetch<WalletStatus>("/api/users/me/wallet", {
        responseType: "json",
      }),
  });

  const challengeMutation = useMutation({
    mutationFn: (walletAddress: string) =>
      customFetch<WalletChallenge>("/api/users/me/wallet/challenge", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ walletAddress }),
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
      queryClient.invalidateQueries({ queryKey: playModeQueryKey });
    },
  });

  const equipMutation = useMutation({
    mutationFn: (tokenId: string) =>
      customFetch<EquipStarResult>("/api/users/me/star-nft/equip", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ tokenId }),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(playModeQueryKey, result.state);
      queryClient.invalidateQueries({ queryKey: walletStatusQueryKey });
    },
  });

  return {
    status: statusQuery.data,
    isLoadingStatus: statusQuery.isLoading,
    refetchStatus: statusQuery.refetch,
    createChallenge: challengeMutation.mutateAsync,
    verifyWallet: verifyMutation.mutateAsync,
    refreshWallet: refreshMutation.mutateAsync,
    equipStar: equipMutation.mutateAsync,
    isCreatingChallenge: challengeMutation.isPending,
    isVerifying: verifyMutation.isPending,
    isRefreshing: refreshMutation.isPending,
    isEquipping: equipMutation.isPending,
  };
}
