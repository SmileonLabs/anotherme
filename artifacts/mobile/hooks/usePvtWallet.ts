import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface PvtWallet {
  balance: number;
  updatedAt: string | null;
}

export interface PvtTransaction {
  id: string;
  amount: number;
  type: "EARN" | "SPEND" | "ADJUST";
  source: "DAILY_TALK_REWARD" | "EVENT" | "ADMIN" | "MISSION" | "AVATAR_ITEM";
  sourceId: string;
  description: string | null;
  balanceAfter: number;
  createdAt: string;
}

export const pvtWalletQueryKey = ["pvt", "wallet"] as const;
export const pvtTransactionsQueryKey = ["pvt", "transactions"] as const;

export function usePvtWallet() {
  return useQuery({
    queryKey: pvtWalletQueryKey,
    queryFn: () => customFetch<PvtWallet>("/api/pvt/wallet", { responseType: "json" }),
  });
}

export function usePvtTransactions() {
  return useQuery({
    queryKey: pvtTransactionsQueryKey,
    queryFn: () => customFetch<PvtTransaction[]>("/api/pvt/transactions", { responseType: "json" }),
  });
}
