import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
export type AdminRoleRow = { id: string; userId: string; nickname: string | null; email: string | null; role: string; createdAt: string };
export function useAdminRoles() { return useQuery({ queryKey: ["admin", "roles"], queryFn: () => customFetch<AdminRoleRow[]>("/api/admin/roles", { responseType: "json" }) }); }
