import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useKnowledgeAdminMe } from "./useKnowledge";

export type AdminNftCollection = {
  id: string;
  chainId: number;
  contractAddress: string;
  rpcUrl: string | null;
  name: string;
  ipName: string;
  category: string;
  rightsStatus: string;
  status: string;
  roleName: string | null;
  worldStyle: string | null;
  aiAnalysis: Record<string, unknown> | null;
  rpgBlueprint: Record<string, unknown> | null;
  aiAnalyzedAt: string | null;
};

const key = ["admin", "nft-collections"] as const;
const analyzeInFlight = new Map<string, Promise<AdminNftCollection>>();

export function useNftAdmin() {
  const admin = useKnowledgeAdminMe();
  const client = useQueryClient();
  const enabled = admin.data?.isAdmin === true;
  const collections = useQuery({
    queryKey: key,
    enabled,
    queryFn: () => customFetch<AdminNftCollection[]>("/api/admin/nft/collections", { responseType: "json" }),
  });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => customFetch<AdminNftCollection>("/api/admin/nft/collections", { method: "POST", responseType: "json", body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const analyze = useMutation({
    mutationFn: (id: string) => {
      const existing = analyzeInFlight.get(id);
      if (existing) return existing;
      const request = customFetch<AdminNftCollection>(`/api/admin/nft/collections/${id}/analyze`, { method: "POST", responseType: "json" }).finally(() => analyzeInFlight.delete(id));
      analyzeInFlight.set(id, request);
      return request;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const review = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" | "publish" | "suspend" }) => customFetch<AdminNftCollection>(`/api/admin/nft/collections/${id}/review`, { method: "POST", responseType: "json", body: JSON.stringify({ action }) }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  return { admin: admin.data, collections: collections.data ?? [], isLoading: collections.isLoading, create, analyze, review };
}
