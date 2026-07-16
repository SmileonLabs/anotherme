import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type AdminAuditRow = {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  reason: string | null;
  createdAt: string;
};

export function useAdminAudit() {
  return useQuery({ queryKey: ["admin", "audit-logs"], queryFn: () => customFetch<AdminAuditRow[]>("/api/admin/audit-logs", { responseType: "json" }) });
}
