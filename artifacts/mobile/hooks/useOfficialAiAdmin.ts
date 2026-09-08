import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type OfficialAiAccount = {
  id: string;
  slug: string;
  displayName: string;
  accountKind: string;
  status: string;
  description: string | null;
  profileImageUrl: string | null;
  ipProfileId: string | null;
  knowledgeTenantId: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

export function useOfficialAiAdmin() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "official-ai-accounts"],
    queryFn: () => customFetch<OfficialAiAccount[]>("/api/admin/official-ai-accounts", { responseType: "json" }),
  });
  const create = useMutation({
    mutationFn: (body: { slug: string; displayName: string; accountKind?: string; description?: string }) => customFetch<OfficialAiAccount>("/api/admin/official-ai-accounts", { method: "POST", responseType: "json", body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "official-ai-accounts"] }),
  });
  const review = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "publish" | "suspend" | "archive" }) => customFetch<OfficialAiAccount>(`/api/admin/official-ai-accounts/${id}/review`, { method: "POST", responseType: "json", body: JSON.stringify({ action }) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "official-ai-accounts"] }),
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; displayName?: string; description?: string | null; knowledgeTenantId?: string | null; personaJson?: Record<string, unknown>; channelConfigJson?: Record<string, unknown>; safetyPolicyJson?: Record<string, unknown> }) => customFetch<OfficialAiAccount>(`/api/admin/official-ai-accounts/${id}`, { method: "PATCH", responseType: "json", body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "official-ai-accounts"] }),
  });
  return { ...query, create, review, update };
}
