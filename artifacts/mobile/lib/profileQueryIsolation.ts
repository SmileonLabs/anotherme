export interface ProfileQueryDescriptor {
  queryKey: readonly unknown[];
}

export interface ProfileQueryCache {
  cancelQueries(filters: {
    predicate: (query: ProfileQueryDescriptor) => boolean;
  }): Promise<unknown>;
  removeQueries(filters: {
    predicate: (query: ProfileQueryDescriptor) => boolean;
  }): void;
}

export const CHARACTER_PROFILES_ROOT_KEY = "character-profiles";

export function isProfileScopedQuery(query: ProfileQueryDescriptor): boolean {
  return query.queryKey[0] !== CHARACTER_PROFILES_ROOT_KEY;
}

/**
 * Immediately removes data fetched as the previous character before exposing
 * the next profile. Cancellation is still requested for cooperative fetches;
 * the request-context generation rejects any late non-cooperative response.
 */
export function purgeProfileScopedQueries(queryClient: ProfileQueryCache): void {
  void queryClient.cancelQueries({ predicate: isProfileScopedQuery });
  queryClient.removeQueries({ predicate: isProfileScopedQuery });
}

/**
 * Apply the request-context fence before a newly fetched active profile is
 * returned to React Query. This covers server/other-tab profile switches, not
 * only mutations initiated by the current screen.
 */
export function prepareProfileStateTransition(
  queryClient: ProfileQueryCache,
  previousProfileId: string | null | undefined,
  nextProfileId: string,
  setRequestProfile: (profileId: string) => void,
): boolean {
  const switched = previousProfileId !== nextProfileId;
  setRequestProfile(nextProfileId);
  if (switched) purgeProfileScopedQueries(queryClient);
  return switched;
}
