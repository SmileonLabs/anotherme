import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type AdminMember = { id: string; nickname: string; email: string; profileImageUrl: string | null; statusMessage: string | null; createdAt: string; updatedAt: string };
export function useAdminMembers(query = "") {
  return useQuery({ queryKey: ["admin", "members", query], queryFn: () => customFetch<AdminMember[]>(`/api/admin/members${query ? `?q=${encodeURIComponent(query)}` : ""}`, { responseType: "json" }) });
}
