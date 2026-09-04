import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { characterProfilesQueryKey } from "./useCharacterProfiles";
import { pvtTransactionsQueryKey, pvtWalletQueryKey } from "./usePvtWallet";

export type AvatarSlot = "background" | "base" | "head" | "wear" | "effect" | "full_skin" | "star_form";

export interface AvatarCatalogItem {
  itemKey: string;
  avatarType: "fan" | "star";
  collectionKey: string | null;
  gender: "man" | "woman" | null;
  slot: AvatarSlot;
  classStage: number;
  jobKey: string | null;
  displayName: string;
  assetPath: string;
  layerOrder: number;
  priceStarPoint: number;
  purchasable: boolean;
  isDefault: boolean;
  status: string;
  metadata: Record<string, unknown>;
  owned: boolean;
  equipped: boolean;
}

export interface AvatarAppearance {
  profileId: string;
  type: "fan" | "star";
  gender: "man" | "woman" | null;
  classStage: number;
  recipe: string;
  layers: AvatarCatalogItem[];
  loadout: Record<string, unknown>;
}

export interface AvatarCatalogResponse {
  appearance: AvatarAppearance;
  items: AvatarCatalogItem[];
}

export const avatarCatalogQueryKey = (profileId: string) => ["avatar-catalog", profileId] as const;

export function useAvatarCatalog(profileId: string | null | undefined) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: avatarCatalogQueryKey(profileId ?? ""),
    queryFn: () => customFetch<AvatarCatalogResponse>(`/api/users/me/profiles/${profileId}/avatar`, { responseType: "json" }),
    enabled: !!profileId,
  });
  const applyResult = async (result: AvatarCatalogResponse) => {
    client.setQueryData(avatarCatalogQueryKey(result.appearance.profileId), result);
    await Promise.all([
      client.invalidateQueries({ queryKey: characterProfilesQueryKey }),
      client.invalidateQueries({ queryKey: pvtWalletQueryKey }),
      client.invalidateQueries({ queryKey: pvtTransactionsQueryKey }),
    ]);
  };
  const purchase = useMutation({
    mutationFn: (itemKey: string) => customFetch<AvatarCatalogResponse>(`/api/users/me/profiles/${profileId}/avatar/purchase`, { method: "POST", responseType: "json", body: JSON.stringify({ itemKey }) }),
    onSuccess: applyResult,
  });
  const equip = useMutation({
    mutationFn: (itemKey: string) => customFetch<AvatarCatalogResponse>(`/api/users/me/profiles/${profileId}/avatar/equipment`, { method: "PATCH", responseType: "json", body: JSON.stringify({ itemKey }) }),
    onSuccess: applyResult,
  });
  return {
    ...query,
    purchaseItem: purchase.mutateAsync,
    equipItem: equip.mutateAsync,
    isPurchasing: purchase.isPending,
    isEquipping: equip.isPending,
  };
}
