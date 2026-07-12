import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface KnowledgeAdminState {
  isAdmin: boolean;
}

export interface KnowledgeSource {
  id: string;
  tenantId: string;
  sourceType: string;
  title: string;
  url: string | null;
  body: string | null;
  status: string;
  collectedAt?: string | null;
  createdAt: string;
  documentCount?: number;
  documentChars?: number;
  reviewCount?: number;
  draftReviewCount?: number;
  approvedReviewCount?: number;
  latestJobStatus?: string | null;
  latestJobError?: string | null;
  latestJobCreatedAt?: string | null;
}

export interface KnowledgeReviewItem {
  id: string;
  tenantId: string;
  sourceId: string | null;
  jobId: string | null;
  itemType: string;
  graphId: string;
  title: string;
  body: string;
  status: string;
  reviewedAt: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  createdAt: string;
}

export interface ChatKnowledgeCandidate extends KnowledgeReviewItem {
  userNickname: string | null;
  userEmail: string | null;
  memoryType: string | null;
  confidence: number | null;
  sourceRoomId: string | null;
  sourceMessageId: string | null;
  sourceSnippet: string | null;
}

export interface UserAiMemory {
  id: string;
  memoryType: string;
  text: string;
  privacyScope: string;
  status: string;
  confidence: number;
  createdAt: string;
}

export interface AiCampaign {
  id: string;
  tenantId: string;
  title: string;
  status: string;
  triggerType: string;
  messageTemplate: string;
  cooldownHours: number;
  maxPerUser: number;
  createdAt: string;
}

export interface GoogleKnowledgeSearchResult {
  title: string;
  link: string;
  displayLink: string | null;
  snippet: string | null;
  formattedUrl: string | null;
}

export interface GoogleKnowledgeSearchResponse {
  query: string;
  totalResults: string | null;
  searchTime: number | string | null;
  results: GoogleKnowledgeSearchResult[];
}

export interface KnowledgeOntologyPreview {
  tenantId: string;
  generatedAt: string;
  sources: Array<{
    id: string;
    title: string;
    url: string | null;
    sourceType: string;
    status: string;
    collectedAt: string | null;
    createdAt: string;
    documentCount: number;
    documentChars: number;
    draftReviewCount: number;
    approvedReviewCount: number;
    rejectedReviewCount: number;
  }>;
  reviewCounts: Record<string, number>;
  recentReviewItems: Array<{
    id: string;
    title: string;
    body: string;
    status: string;
    sourceTitle: string | null;
    sourceUrl: string | null;
    createdAt: string;
  }>;
  latestJobs: Array<{
    id: string;
    status: string;
    error: string | null;
    sourceTitle: string | null;
    completedAt: string | null;
    createdAt: string;
  }>;
  graph: {
    available: boolean;
    tenant: Record<string, unknown> | null;
    counts: {
      entities: number;
      sources: number;
      claims: number;
    };
    sources: Array<{
      id: string;
      title: string;
      sourceType: string;
      url: string | null;
      claimCount: number;
    }>;
    entities: Array<{
      id: string;
      type: string;
      name: string;
      aliases: string[];
      relations: Array<Record<string, unknown>>;
    }>;
    claims: Array<{
      id: string;
      entityName: string;
      entityType: string;
      predicate: string;
      text: string;
      status: string;
      visibility: string;
      confidence: number;
      priority: number;
      sources: Array<{
        title: string | null;
        sourceType: string | null;
        url: string | null;
      }>;
    }>;
  };
}

export const knowledgeAdminMeQueryKey = ["knowledge", "admin", "me"] as const;
export const knowledgeSourcesQueryKey = ["knowledge", "admin", "sources"] as const;
export const knowledgeReviewItemsQueryKey = ["knowledge", "admin", "review-items"] as const;
export const knowledgeChatCandidatesQueryKey = ["knowledge", "admin", "chat-candidates"] as const;
export const knowledgeOntologyPreviewQueryKey = ["knowledge", "admin", "ontology-preview"] as const;
export const knowledgeMemoriesQueryKey = ["knowledge", "memories"] as const;
export const knowledgeCampaignsQueryKey = ["knowledge", "admin", "campaigns"] as const;

export function useKnowledgeAdminMe() {
  return useQuery({
    queryKey: knowledgeAdminMeQueryKey,
    queryFn: () => customFetch<KnowledgeAdminState>("/api/knowledge/admin/me", { responseType: "json" }),
  });
}

export function useKnowledgeSources(enabled = true) {
  return useQuery({
    enabled,
    queryKey: knowledgeSourcesQueryKey,
    queryFn: () => customFetch<KnowledgeSource[]>("/api/knowledge/admin/sources", { responseType: "json" }),
  });
}

export function useKnowledgeReviewItems(enabled = true, status = "draft") {
  return useQuery({
    enabled,
    queryKey: [...knowledgeReviewItemsQueryKey, status],
    queryFn: () => customFetch<KnowledgeReviewItem[]>(`/api/knowledge/admin/review-items?status=${encodeURIComponent(status)}`, { responseType: "json" }),
  });
}

export function useChatKnowledgeCandidates(enabled = true, status = "all") {
  return useQuery({
    enabled,
    queryKey: [...knowledgeChatCandidatesQueryKey, status],
    queryFn: () => customFetch<ChatKnowledgeCandidate[]>(`/api/knowledge/admin/chat-candidates?status=${encodeURIComponent(status)}`, { responseType: "json" }),
  });
}

export function useKnowledgeOntologyPreview(enabled = true) {
  return useQuery({
    enabled,
    queryKey: knowledgeOntologyPreviewQueryKey,
    queryFn: () => customFetch<KnowledgeOntologyPreview>("/api/knowledge/admin/ontology-preview", { responseType: "json" }),
  });
}

export function useAiCampaigns(enabled = true) {
  return useQuery({
    enabled,
    queryKey: knowledgeCampaignsQueryKey,
    queryFn: () => customFetch<AiCampaign[]>("/api/knowledge/admin/campaigns", { responseType: "json" }),
  });
}

export function useCreateKnowledgeSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; url?: string; body?: string; sourceType?: string }) =>
      customFetch<KnowledgeSource>("/api/knowledge/admin/sources", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(body),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeSourcesQueryKey });
      queryClient.invalidateQueries({ queryKey: knowledgeOntologyPreviewQueryKey });
    },
  });
}

export function useGoogleKnowledgeSearch() {
  return useMutation({
    mutationFn: (body: { query: string; num?: number; siteSearch?: string }) =>
      customFetch<GoogleKnowledgeSearchResponse>("/api/knowledge/admin/google-search", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(body),
      }),
  });
}

export function useImportGoogleKnowledgeResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; url: string; query?: string; snippet?: string | null; displayLink?: string | null; formattedUrl?: string | null }) =>
      customFetch<KnowledgeSource>("/api/knowledge/admin/google-search/import", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeSourcesQueryKey });
      queryClient.invalidateQueries({ queryKey: knowledgeOntologyPreviewQueryKey });
    },
  });
}

export function useExtractKnowledgeSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) =>
      customFetch(`/api/knowledge/admin/sources/${sourceId}/extract`, { method: "POST", responseType: "json" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeSourcesQueryKey });
      queryClient.invalidateQueries({ queryKey: knowledgeReviewItemsQueryKey });
      queryClient.invalidateQueries({ queryKey: knowledgeOntologyPreviewQueryKey });
    },
  });
}

export function useDeleteKnowledgeSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) =>
      customFetch<KnowledgeSource>(`/api/knowledge/admin/sources/${sourceId}`, { method: "DELETE", responseType: "json" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeSourcesQueryKey });
      queryClient.invalidateQueries({ queryKey: knowledgeReviewItemsQueryKey });
      queryClient.invalidateQueries({ queryKey: knowledgeOntologyPreviewQueryKey });
    },
  });
}

export function useApproveKnowledgeReviewItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customFetch(`/api/knowledge/admin/review-items/${id}/approve`, { method: "POST", responseType: "json" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeReviewItemsQueryKey });
      queryClient.invalidateQueries({ queryKey: knowledgeChatCandidatesQueryKey });
      queryClient.invalidateQueries({ queryKey: knowledgeOntologyPreviewQueryKey });
    },
  });
}

export function useRejectKnowledgeReviewItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customFetch(`/api/knowledge/admin/review-items/${id}/reject`, { method: "POST", responseType: "json" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeReviewItemsQueryKey });
      queryClient.invalidateQueries({ queryKey: knowledgeChatCandidatesQueryKey });
      queryClient.invalidateQueries({ queryKey: knowledgeOntologyPreviewQueryKey });
    },
  });
}

export function useCreateAiCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; messageTemplate: string; triggerType?: string }) =>
      customFetch<AiCampaign>("/api/knowledge/admin/campaigns", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(body),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: knowledgeCampaignsQueryKey }),
  });
}

export function useUserAiMemories() {
  return useQuery({
    queryKey: knowledgeMemoriesQueryKey,
    queryFn: () => customFetch<UserAiMemory[]>("/api/knowledge/memories", { responseType: "json" }),
  });
}

export function useCreateUserAiMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { text: string; memoryType?: string; privacyScope?: string }) =>
      customFetch<UserAiMemory>("/api/knowledge/memories", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(body),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: knowledgeMemoriesQueryKey }),
  });
}

export function useUpdateUserAiMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; text?: string; privacyScope?: string; status?: string }) =>
      customFetch<UserAiMemory>(`/api/knowledge/memories/${id}`, {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify(body),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: knowledgeMemoriesQueryKey }),
  });
}

export function useDeleteUserAiMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customFetch<UserAiMemory>(`/api/knowledge/memories/${id}`, { method: "DELETE", responseType: "json" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: knowledgeMemoriesQueryKey }),
  });
}
