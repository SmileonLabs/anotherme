import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface FanCommunity { id: string; starProfileId: string; name: string; description: string; memberCount: number; }
export interface FanBroadcast { id: string; communityId: string; title: string; body: string; createdAt: string; }
export interface FanMission { id: string; communityId: string; title: string; description: string; status: string; createdAt: string; }

export function useFanCommunities() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["fan-communities"], queryFn: () => customFetch<FanCommunity[]>("/api/fan-communities", { responseType: "json" }) });
  const create = useMutation({ mutationFn: (body: { starProfileId: string; name: string; description?: string }) => customFetch<FanCommunity>("/api/fan-communities", { method: "POST", responseType: "json", body: JSON.stringify(body) }), onSuccess: () => client.invalidateQueries({ queryKey: ["fan-communities"] }) });
  const join = useMutation({ mutationFn: ({ id, joined }: { id: string; joined: boolean }) => customFetch<{ joined: boolean }>(`/api/fan-communities/${id}/join`, { method: joined ? "DELETE" : "POST", responseType: "json" }), onSuccess: () => client.invalidateQueries({ queryKey: ["fan-communities"] }) });
  return { communities: query.data ?? [], isLoading: query.isLoading, refetch: query.refetch, createCommunity: create.mutateAsync, toggleMembership: join.mutateAsync, isMutating: create.isPending || join.isPending };
}

export function useFanCommunityPrograms(communityId: string | null) {
  const client = useQueryClient();
  const enabled = Boolean(communityId);
  const broadcasts = useQuery({ queryKey: ["fan-community", communityId, "broadcasts"], enabled, queryFn: () => customFetch<FanBroadcast[]>(`/api/fan-communities/${communityId}/broadcasts`, { responseType: "json" }) });
  const missions = useQuery({ queryKey: ["fan-community", communityId, "missions"], enabled, queryFn: () => customFetch<FanMission[]>(`/api/fan-communities/${communityId}/missions`, { responseType: "json" }) });
  const createBroadcast = useMutation({ mutationFn: (body: { title: string; body: string }) => customFetch<FanBroadcast>(`/api/fan-communities/${communityId}/broadcasts`, { method: "POST", responseType: "json", body: JSON.stringify(body) }), onSuccess: () => client.invalidateQueries({ queryKey: ["fan-community", communityId, "broadcasts"] }) });
  const createMission = useMutation({ mutationFn: (body: { title: string; description: string }) => customFetch<FanMission>(`/api/fan-communities/${communityId}/missions`, { method: "POST", responseType: "json", body: JSON.stringify(body) }), onSuccess: () => client.invalidateQueries({ queryKey: ["fan-community", communityId, "missions"] }) });
  const joinMission = useMutation({ mutationFn: (missionId: string) => customFetch<{ joined: boolean }>(`/api/fan-missions/${missionId}/join`, { method: "POST", responseType: "json" }) });
  return { broadcasts: broadcasts.data ?? [], missions: missions.data ?? [], isLoading: broadcasts.isLoading || missions.isLoading, createBroadcast: createBroadcast.mutateAsync, createMission: createMission.mutateAsync, joinMission: joinMission.mutateAsync };
}
