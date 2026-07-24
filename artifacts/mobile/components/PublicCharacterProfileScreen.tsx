import { Feather } from "@expo/vector-icons";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CustomScrollView } from "@/components/CustomScroll";
import { FAN_STAT_META, readFanStat } from "@/constants/fanStats";
import { useMediaUri } from "@/hooks/useMediaUri";
import type { StarFeedPost } from "@/hooks/useStarFeed";
import { mediaUri } from "@/lib/apiBase";

const FAN_CHARACTER_FALLBACK = require("../assets/images/home-v2/fan-character-scene.png");
const STAR_CHARACTER_FALLBACK = require("../assets/images/star-character-cutout.png");

interface PublicCharacterProfile {
  id: string;
  type: "fan" | "star" | "official_ai";
  handle: string;
  displayName: string;
  profileImageUrl: string | null;
  characterImageUrl?: string | null;
  statusMessage: string | null;
  level: number;
  xp: number;
  jobKey?: string | null;
  jobStage?: number;
  jobLabel?: string;
  stats: Record<string, number>;
  metadata: Record<string, unknown>;
  isMine: boolean;
  followedByMe: boolean;
  followerCount: number;
  followingCount: number;
  postCount: number;
}

interface PublicCharacterProfileResponse {
  profile: PublicCharacterProfile;
  posts: { items: StarFeedPost[]; nextCursor: string | null };
}

const STAR_STATS = [
  { key: "charm", label: "매력", icon: "heart" as const, color: "#F062D7" },
  { key: "stagePresence", label: "스타성", icon: "star" as const, color: "#20E4E5" },
  { key: "bond", label: "유대감", icon: "message-circle" as const, color: "#20E4E5" },
  { key: "lore", label: "영향력", icon: "award" as const, color: "#F6D21F" },
] as const;

function levelFloor(level: number): number {
  return level <= 1 ? 0 : 50 * (level - 1) * level;
}

function levelProgress(level: number, xp: number) {
  const floor = levelFloor(level);
  const target = Math.max(1, levelFloor(level + 1) - floor);
  const current = Math.max(0, xp - floor);
  return { current, target, percent: Math.min(100, Math.max(0, (current / target) * 100)) };
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function firstImage(post: StarFeedPost): string | null {
  return (post.media ?? []).find((item) => item.mediaType === "image")?.objectPath ?? null;
}

function GridTile({ post, size, onPress }: { post: StarFeedPost; size: number; onPress: () => void }) {
  const objectPath = firstImage(post);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${post.author.nickname}의 공개 게시물 열기`}
      onPress={onPress}
      style={({ pressed }) => [styles.gridTile, { width: size, height: size }, pressed && styles.pressed]}
    >
      {objectPath ? (
        <Image source={{ uri: mediaUri(objectPath) }} contentFit="cover" transition={180} style={StyleSheet.absoluteFill} />
      ) : (
        <LinearGradient colors={["#231242", "#0D0A1B", "#05040C"]} style={styles.textTile}>
          <Feather name="message-circle" size={20} color="#BD79FF" />
          <Text numberOfLines={5} style={styles.textTileBody}>{post.body || post.title}</Text>
        </LinearGradient>
      )}
      {(post.media?.length ?? 0) > 1 ? (
        <View style={styles.multiBadge}><Feather name="copy" size={13} color="#FFFFFF" /></View>
      ) : null}
    </Pressable>
  );
}

export function PublicCharacterProfileScreen({ profileId }: { profileId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const queryKey = ["public-character-profile", profileId] as const;
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as string | undefined,
    enabled: !!profileId,
    queryFn: ({ pageParam }) =>
      customFetch<PublicCharacterProfileResponse>(
        `/api/profiles/${profileId}?limit=30${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        { responseType: "json" },
      ),
    getNextPageParam: (lastPage) => lastPage.posts?.nextCursor ?? undefined,
  });
  const follow = useMutation({
    mutationFn: (following: boolean) =>
      customFetch<{ following: boolean }>(`/api/profiles/${profileId}/follow`, {
        method: following ? "POST" : "DELETE",
        responseType: "json",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const profile = query.data?.pages[0]?.profile;
  const posts = React.useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages.flatMap((page) => page.posts?.items ?? []) ?? []).filter((post) => {
      if (seen.has(post.id)) return false;
      seen.add(post.id);
      return true;
    });
  }, [query.data?.pages]);
  const resolvedCharacterImage = useMediaUri(
    profile?.type === "fan"
      ? profile?.characterImageUrl
      : profile?.characterImageUrl ?? profile?.profileImageUrl,
  );
  const contentWidth = Math.min(width, 520) - 24;
  const gridGap = 6;
  const tileSize = Math.floor((contentWidth - gridGap * 2) / 3);
  const level = Math.max(1, safeNumber(profile?.level) || 1);
  const xp = safeNumber(profile?.xp);
  const followerCount = safeNumber(profile?.followerCount);
  const followingCount = safeNumber(profile?.followingCount);
  const postCount = profile?.postCount == null ? posts.length : safeNumber(profile.postCount);
  const progress = levelProgress(level, xp);
  const isFan = profile?.type === "fan";
  const jobLabel = profile?.jobLabel?.trim()
    || profile?.jobKey?.split(/[:_-]/g).filter(Boolean).join(" ")
    || (isFan ? "팬클럽 회원" : profile?.type === "official_ai" ? "공식 AI" : "STAR");
  const stats = isFan
    ? FAN_STAT_META.map((item) => ({ ...item, value: readFanStat(profile?.stats, item.key) }))
    : STAR_STATS.map((item) => ({ ...item, value: safeNumber(profile?.stats?.[item.key]) }));
  const characterSource = resolvedCharacterImage
    ? { uri: resolvedCharacterImage }
    : isFan ? FAN_CHARACTER_FALLBACK : STAR_CHARACTER_FALLBACK;

  const goBack = React.useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/feed" as never);
  }, [router]);

  if (query.isLoading) {
    return <View style={styles.loadingScreen}><ActivityIndicator size="large" color="#A64DFF" /><Text style={styles.loadingText}>프로필을 불러오는 중이에요.</Text></View>;
  }
  if (!profile) {
    return (
      <View style={[styles.loadingScreen, { paddingTop: insets.top }]}>
        <Feather name="alert-circle" size={42} color="#8E879A" />
        <Text style={styles.errorTitle}>프로필을 불러오지 못했어요.</Text>
        <Pressable onPress={() => void query.refetch()} style={styles.retryButton}><Text style={styles.retryText}>다시 시도</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CustomScrollView
        refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} tintColor="#A64DFF" />}
        onScroll={({ nativeEvent }) => {
          const remaining = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y;
          if (remaining < 420 && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 8), paddingBottom: Math.max(insets.bottom, 8) + 26 }]}
      >
        <View style={[styles.content, { width: contentWidth }]}>
          <View style={styles.hero}>
            <View pointerEvents="none" style={styles.starGlowLeft} />
            <View pointerEvents="none" style={styles.starGlowRight} />
            <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" hitSlop={12} onPress={goBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <Feather name="arrow-left" size={29} color="#F8F6F4" />
            </Pressable>

            <View style={styles.characterSide}>
              <Image source={characterSource} contentFit="contain" contentPosition="bottom center" transition={180} style={styles.characterImage} />
            </View>

            <View style={styles.profileSide}>
              <View style={styles.nameRow}>
                <Text numberOfLines={1} style={styles.name}>{profile.displayName}</Text>
                {profile.type === "official_ai" ? <View style={styles.officialBadge}><Text style={styles.officialBadgeText}>OFFICIAL</Text></View> : null}
              </View>
              <Text style={styles.level}>Lv.{level}</Text>
              <View style={styles.xpTrack}><View style={[styles.xpFill, { width: `${progress.percent}%` }]} /></View>
              <Text style={styles.xpLabel}>{progress.current.toLocaleString()} / {progress.target.toLocaleString()} {isFan ? "FAN XP" : "STAR XP"}</Text>
              <Text numberOfLines={1} style={styles.identity}>
                이름: {profile.displayName}<Text style={styles.identityDivider}>　│　</Text>직업: {jobLabel}
              </Text>

              <View style={styles.followCounts}>
                <Pressable style={styles.followCount}><Feather name="user" size={18} color="#D7D1DC" /><Text style={styles.followCountText}>{followerCount.toLocaleString()} 팔로워</Text></Pressable>
                <View style={styles.followDivider} />
                <Pressable style={styles.followCount}><Feather name="user" size={18} color="#D7D1DC" /><Text style={styles.followCountText}>{followingCount.toLocaleString()} 팔로잉</Text></Pressable>
              </View>

              <View style={styles.statsPanel}>
                {stats.map((item, index) => (
                  <View key={item.key} style={[styles.statItem, index > 0 && styles.statItemBorder]}>
                    <Feather name={item.icon} size={27} color={item.color} strokeWidth={1.7} />
                    <Text style={styles.statLabel}>{item.label}</Text>
                    <Text style={styles.statValue}>{item.value.toLocaleString()}</Text>
                  </View>
                ))}
              </View>

              <Pressable
                disabled={follow.isPending}
                onPress={() => profile.isMine ? router.push("/profiles" as never) : follow.mutate(!profile.followedByMe)}
                style={({ pressed }) => [styles.actionButton, profile.followedByMe && styles.actionButtonFollowing, (pressed || follow.isPending) && styles.pressed]}
              >
                <Text style={styles.actionButtonText}>{profile.isMine ? "프로필 관리" : profile.followedByMe ? "팔로잉" : "팔로우"}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>공개 게시물</Text>
            <Text style={styles.postCount}>{postCount.toLocaleString()}</Text>
          </View>
          {posts.length ? (
            <View style={[styles.grid, { gap: gridGap }]}>
              {posts.map((post) => (
                <GridTile key={post.id} post={post} size={tileSize} onPress={() => router.push({ pathname: "/post/[postId]", params: { postId: post.id } } as never)} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Feather name="image" size={32} color="#756E80" />
              <Text style={styles.emptyTitle}>아직 공개 게시물이 없어요.</Text>
              <Text style={styles.emptyBody}>이 캐릭터가 공개한 이야기가 여기에 모입니다.</Text>
            </View>
          )}
          {query.isFetchingNextPage ? <ActivityIndicator color="#A64DFF" style={styles.moreLoader} /> : null}
        </View>
      </CustomScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#020208" },
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 24, backgroundColor: "#020208" },
  loadingText: { color: "#9D96A7", fontFamily: "Inter_500Medium", fontSize: 14 },
  errorTitle: { color: "#F6F3F8", fontFamily: "Inter_700Bold", fontSize: 18 },
  retryButton: { minWidth: 128, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#7D35F4" },
  retryText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 14 },
  scrollContent: { flexGrow: 1, alignItems: "center", backgroundColor: "#020208" },
  content: { maxWidth: 520 },
  hero: { height: 410, overflow: "hidden", position: "relative", flexDirection: "row", backgroundColor: "#020208" },
  starGlowLeft: { position: "absolute", left: -80, top: 80, width: 260, height: 260, borderRadius: 130, backgroundColor: "rgba(73,25,143,0.18)" },
  starGlowRight: { position: "absolute", right: -110, top: -30, width: 300, height: 300, borderRadius: 150, backgroundColor: "rgba(39,14,100,0.17)" },
  backButton: { position: "absolute", zIndex: 10, left: 8, top: 11, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  characterSide: { width: "48%", height: "100%", justifyContent: "flex-end", paddingTop: 30 },
  characterImage: { width: "100%", height: "96%" },
  profileSide: { width: "52%", zIndex: 3, paddingTop: 45, paddingRight: 7, paddingLeft: 5 },
  nameRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7 },
  name: { flexShrink: 1, color: "#FFFFFF", fontFamily: "Inter_800ExtraBold", fontSize: 31, letterSpacing: -1.2 },
  officialBadge: { borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: "#6F2BCA" },
  officialBadgeText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 8 },
  level: { marginTop: 4, color: "#A348FF", fontFamily: "Inter_800ExtraBold", fontSize: 22 },
  xpTrack: { width: "100%", height: 10, marginTop: 9, overflow: "hidden", borderRadius: 5, borderWidth: 1, borderColor: "rgba(143,65,234,0.65)", backgroundColor: "#090713" },
  xpFill: { minWidth: 8, height: "100%", borderRadius: 5, backgroundColor: "#852EFF" },
  xpLabel: { marginTop: 8, color: "#B7B0BC", fontFamily: "Inter_400Regular", fontSize: 12 },
  identity: { marginTop: 17, color: "#DDD8E0", fontFamily: "Inter_400Regular", fontSize: 12 },
  identityDivider: { color: "#61586B" },
  followCounts: { height: 47, marginTop: 14, flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(134,109,156,0.34)" },
  followCount: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  followCountText: { color: "#D6D1D9", fontFamily: "Inter_400Regular", fontSize: 10.5 },
  followDivider: { width: 1, height: 18, backgroundColor: "rgba(126,93,153,0.45)" },
  statsPanel: { height: 94, flexDirection: "row", overflow: "hidden", borderRadius: 16, borderWidth: 1, borderColor: "rgba(139,67,203,0.48)", backgroundColor: "rgba(9,7,19,0.92)" },
  statItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  statItemBorder: { borderLeftWidth: 1, borderLeftColor: "rgba(113,82,137,0.42)" },
  statLabel: { color: "#DAD4DE", fontFamily: "Inter_400Regular", fontSize: 10 },
  statValue: { color: "#FFFFFF", fontFamily: "Inter_500Medium", fontSize: 15 },
  actionButton: { alignSelf: "flex-end", minWidth: 92, height: 32, marginTop: 10, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#7D35F4" },
  actionButtonFollowing: { borderWidth: 1, borderColor: "rgba(159,102,219,0.56)", backgroundColor: "#191323" },
  actionButtonText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 11 },
  sectionHeader: { minHeight: 58, flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 6, paddingBottom: 11 },
  sectionTitle: { color: "#F7F4F8", fontFamily: "Inter_700Bold", fontSize: 22 },
  postCount: { color: "#8F8798", fontFamily: "Inter_500Medium", fontSize: 12, marginBottom: 3 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  gridTile: { overflow: "hidden", borderRadius: 7, backgroundColor: "#0B0913" },
  textTile: { flex: 1, padding: 11, justifyContent: "center", gap: 8 },
  textTileBody: { color: "#E4DCEB", fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 15 },
  multiBadge: { position: "absolute", top: 7, right: 7, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(4,3,10,0.72)" },
  emptyState: { minHeight: 190, alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 16, borderWidth: 1, borderColor: "rgba(109,75,144,0.25)", backgroundColor: "#08070F" },
  emptyTitle: { color: "#E7E2EA", fontFamily: "Inter_700Bold", fontSize: 15 },
  emptyBody: { color: "#817A88", fontFamily: "Inter_400Regular", fontSize: 12 },
  moreLoader: { marginVertical: 24 },
  pressed: { opacity: 0.68 },
});
