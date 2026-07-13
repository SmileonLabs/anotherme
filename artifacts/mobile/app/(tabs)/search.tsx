import { Feather } from "@expo/vector-icons";
import { useListUsers } from "@workspace/api-client-react";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/Avatar";
import { CustomScrollView } from "@/components/CustomScroll";
import { NeonBackdrop } from "@/components/NeonUI";
import { neon } from "@/constants/colors";
import { useStarFeed, type StarFeedPost, type StarFeedPostKind } from "@/hooks/useStarFeed";
import { mediaUri } from "@/lib/apiBase";

const TRENDING = ["비비", "별빛", "토로미아문", "STAR 콘트", "스토리 피드"];

const POST_TAGS: Record<StarFeedPostKind, string[]> = {
  official: ["Another Me", "공식"],
  event: ["이벤트", "미션"],
  fan: ["비비", "팬아트"],
  star: ["STAR", "콘텐츠"],
  growth: ["성장", "기록"],
  profile_update: ["프로필", "성장"],
  talk_diary: ["대화일기", "오늘"],
};

function relativeTime(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "방금 전";
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function postImageUri(post: StarFeedPost) {
  const metadata = post.metadata ?? {};
  const value = ["imageUrl", "thumbnailUrl", "coverImageUrl", "newProfileImageUrl"]
    .map((key) => metadata[key])
    .find((item): item is string => typeof item === "string" && item.trim().length > 0);
  return value ? mediaUri(value) : null;
}

function SearchSection({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <LinearGradient
      colors={["rgba(10,10,25,0.98)", "rgba(5,5,16,0.98)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.sectionCard}
    >
      <View pointerEvents="none" style={styles.sectionGlow} />
      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleRow}>
          <Feather name={icon} size={15} color={neon.magenta} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {action}
      </View>
      {children}
    </LinearGradient>
  );
}

function FeedPreview({ post, onPress }: { post: StarFeedPost; onPress: () => void }) {
  const tags = POST_TAGS[post.kind];
  const imageUri = postImageUri(post);
  const [imageFailed, setImageFailed] = React.useState(false);

  React.useEffect(() => {
    setImageFailed(false);
  }, [imageUri]);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.postPressable, pressed && styles.pressed]}>
      <LinearGradient
        colors={["rgba(12,12,28,0.98)", "rgba(5,6,18,0.98)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.postCard}
      >
        <View pointerEvents="none" style={styles.postGlow} />
        <Avatar uri={post.author.profileImageUrl} name={post.author.nickname} size={58} />
        <View style={styles.postCopy}>
          <View style={styles.postMetaRow}>
            <Text style={styles.postAuthor} numberOfLines={1}>{post.author.nickname}</Text>
            <View style={styles.verified}><Feather name="check" size={8} color="#FFFFFF" /></View>
            <Text style={styles.postTime}>{relativeTime(post.createdAt)}</Text>
          </View>
          <Text style={styles.postTitle} numberOfLines={1}>{post.title}</Text>
          <View style={styles.tagRow}>
            {tags.map((tag) => <Text key={tag} style={styles.tag}># {tag}</Text>)}
          </View>
        </View>
        {imageUri && !imageFailed ? (
          <View style={styles.postVisual}>
            <Image
              source={{ uri: imageUri }}
              style={styles.postImage}
              contentFit="cover"
              onError={() => setImageFailed(true)}
            />
            <View style={styles.postCounts}>
              <Feather name="heart" size={12} color={neon.muted} />
              <Text style={styles.postCount}>{post.reactionCount}</Text>
              <Feather name="message-circle" size={12} color={neon.muted} />
              <Text style={styles.postCount}>{post.commentCount}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.postCountsOnly}>
            <Feather name="heart" size={12} color={neon.muted} />
            <Text style={styles.postCount}>{post.reactionCount}</Text>
            <Feather name="message-circle" size={12} color={neon.muted} />
            <Text style={styles.postCount}>{post.commentCount}</Text>
          </View>
        )}
        <Feather name="more-horizontal" size={16} color={neon.text} style={styles.moreIcon} />
      </LinearGradient>
    </Pressable>
  );
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const { data: users = [], isLoading: usersLoading } = useListUsers();
  const { posts, isLoading: feedLoading } = useStarFeed();
  const normalized = query.trim().toLocaleLowerCase();

  const matchedUsers = React.useMemo(
    () => users.filter((user) => !normalized || `${user.nickname} ${user.statusMessage ?? ""}`.toLocaleLowerCase().includes(normalized)).slice(0, 4),
    [normalized, users],
  );
  const matchedPosts = React.useMemo(
    () => posts.filter((post) => !normalized || `${post.title} ${post.body} ${post.author.nickname}`.toLocaleLowerCase().includes(normalized)).slice(0, 6),
    [normalized, posts],
  );

  return (
    <NeonBackdrop>
      <CustomScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 6 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchBox}>
          <Feather name="search" size={22} color="#8F8C9E" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="비비, 팬아트, 퀸, 미션 검색"
            placeholderTextColor="#777486"
            style={styles.input}
            autoCapitalize="none"
            returnKeyType="search"
          />
          <Pressable accessibilityRole="button" accessibilityLabel="검색 필터" onPress={() => query && setQuery("")} hitSlop={12}>
            <Feather name={query ? "x" : "sliders"} size={19} color="#B14CFF" />
          </Pressable>
        </View>

        {!normalized ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="연습생 STAR 미션으로 이동"
            onPress={() => router.push("/(tabs)/dungeon" as never)}
            style={({ pressed }) => [styles.heroCrop, pressed && styles.pressed]}
          >
            <Image
              source={require("../../assets/images/search-mockup.png")}
              style={styles.heroSprite}
              contentFit="cover"
              contentPosition={{ top: "15%" }}
            />
          </Pressable>
        ) : null}

        <SearchSection
          icon="zap"
          title="인기 검색어"
          action={<Pressable onPress={() => setQuery("")}><Text style={styles.more}>더보기 〉</Text></Pressable>}
        >
          <View style={styles.trendingRow}>
            {TRENDING.map((term, index) => (
              <Pressable key={term} onPress={() => setQuery(term)} style={styles.trendingItem}>
                <Text style={styles.trendingRank}>{index + 1}.</Text>
                <Text style={styles.trendingText} numberOfLines={1}>{term}</Text>
                {index === 3 ? <Feather name="arrow-up-right" size={12} color={neon.magenta} /> : null}
                {index === 4 ? <Feather name="arrow-down" size={12} color={neon.cyan} /> : null}
              </Pressable>
            ))}
          </View>
        </SearchSection>

        <SearchSection
          icon="star"
          title="추천 STAR / FAN"
          action={<Pressable onPress={() => router.push("/friends/add")}><Text style={styles.more}>더보기 〉</Text></Pressable>}
        >
          {usersLoading ? <ActivityIndicator color={neon.purple} style={styles.loader} /> : (
            <View style={styles.peopleRow}>
              {matchedUsers.map((user, index) => (
                <Pressable key={user.id} onPress={() => router.push("/friends/add")} style={({ pressed }) => [styles.personCard, pressed && styles.pressed]}>
                  <Avatar uri={user.profileImageUrl} name={user.nickname} size={46} />
                  <View style={styles.personCopy}>
                    <View style={styles.personNameRow}>
                      <Text style={styles.personName} numberOfLines={1}>{user.nickname}</Text>
                      <View style={styles.verified}><Feather name="check" size={8} color="#FFFFFF" /></View>
                    </View>
                    <Text style={styles.personRole}>{index < 2 ? "STAR" : "FAN"}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </SearchSection>

        {feedLoading ? <ActivityIndicator color={neon.purple} style={styles.loader} /> : matchedPosts.length ? (
          <View style={styles.feedList}>
            {matchedPosts.map((post) => <FeedPreview key={post.id} post={post} onPress={() => router.push("/(tabs)/feed")} />)}
          </View>
        ) : <Text style={styles.empty}>검색 결과가 없습니다.</Text>}
      </CustomScrollView>
    </NeonBackdrop>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 11, paddingBottom: 112, gap: 10 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  searchBox: {
    minHeight: 45,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(136,68,214,0.36)",
    backgroundColor: "rgba(7,7,18,0.94)",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  input: { flex: 1, color: neon.text, fontFamily: "Inter_400Regular", fontSize: 13, paddingVertical: 9 },
  heroCrop: {
    alignSelf: "stretch",
    height: 151,
    marginHorizontal: -11,
    overflow: "hidden",
    backgroundColor: "#050410",
  },
  heroSprite: { width: "100%", height: "100%" },
  sectionCard: {
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(103,65,165,0.28)",
    paddingHorizontal: 11,
    paddingTop: 8,
    paddingBottom: 10,
    overflow: "hidden",
  },
  sectionGlow: { position: "absolute", right: -45, top: -55, width: 130, height: 120, borderRadius: 65, backgroundColor: "rgba(66,29,149,0.10)" },
  sectionHead: { minHeight: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  sectionTitle: { color: neon.text, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  more: { color: "#918B9E", fontFamily: "Inter_400Regular", fontSize: 10 },
  trendingRow: { flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(126,79,185,0.18)", paddingTop: 8, marginTop: 3 },
  trendingItem: { minWidth: 0, flex: 1, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 2 },
  trendingRank: { color: neon.magenta, fontFamily: "Inter_700Bold", fontSize: 11 },
  trendingText: { color: "#B9B5C1", fontFamily: "Inter_400Regular", fontSize: 10, flexShrink: 1 },
  peopleRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  personCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 57,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 12,
    backgroundColor: "rgba(6,6,18,0.78)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(126,72,198,0.25)",
  },
  personCopy: { flex: 1, minWidth: 0 },
  personNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  personName: { color: neon.text, fontFamily: "Inter_500Medium", fontSize: 10, flexShrink: 1 },
  personRole: { color: neon.magenta, fontFamily: "Inter_500Medium", fontSize: 9, marginTop: 4 },
  verified: { width: 12, height: 12, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: "#7B35FF" },
  loader: { minHeight: 56, justifyContent: "center" },
  feedList: { gap: 8 },
  postPressable: { borderRadius: 13 },
  postCard: {
    minHeight: 100,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(82,68,142,0.28)",
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    overflow: "hidden",
  },
  postGlow: { position: "absolute", left: 40, top: -70, width: 150, height: 120, borderRadius: 70, backgroundColor: "rgba(77,38,177,0.08)" },
  postCopy: { flex: 1, minWidth: 0, alignSelf: "stretch", justifyContent: "center" },
  postMetaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  postAuthor: { color: neon.text, fontFamily: "Inter_500Medium", fontSize: 12, maxWidth: "56%" },
  postTime: { color: "#777283", fontFamily: "Inter_400Regular", fontSize: 9 },
  postTitle: { color: "#D8D4DF", fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 8 },
  tagRow: { flexDirection: "row", gap: 5, marginTop: 8 },
  tag: { color: "#A16BCF", fontFamily: "Inter_400Regular", fontSize: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(129,67,189,0.30)", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  postVisual: { width: 119, alignSelf: "stretch", justifyContent: "space-between", paddingTop: 2 },
  postImage: { width: "100%", height: 61, borderRadius: 9, backgroundColor: "#111020" },
  postCounts: { height: 18, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  postCountsOnly: { position: "absolute", right: 8, bottom: 7, height: 18, flexDirection: "row", alignItems: "center", gap: 4 },
  postCount: { color: neon.muted, fontFamily: "Inter_400Regular", fontSize: 9, marginRight: 7 },
  moreIcon: { position: "absolute", right: 9, top: 7 },
  empty: { color: neon.muted, textAlign: "center", paddingVertical: 28 },
});
