import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
export type AdminOperationsOverview = { posts: number; reports: number; rooms: number; calls: number; searches: number; generatedAt: string };
export function useAdminOperations() { return useQuery({ queryKey: ["admin", "operations"], queryFn: () => customFetch<AdminOperationsOverview>("/api/admin/operations/overview", { responseType: "json" }) }); }
