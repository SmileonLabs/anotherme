import { Feather } from "@expo/vector-icons";
import { useListUsers } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/Avatar";
import { CustomScrollView } from "@/components/CustomScroll";
import { NeonBackdrop, NeonCard, NeonSectionTitle } from "@/components/NeonUI";
import { neon } from "@/constants/colors";
import { useStarFeed } from "@/hooks/useStarFeed";

const TRENDING = ["비비", "별빛", "토로미아 문", "STAR 콘텐츠", "대화 미션"];

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const { data: users = [], isLoading: usersLoading } = useListUsers();
  const { posts, isLoading: feedLoading } = useStarFeed();
  const normalized = query.trim().toLocaleLowerCase();

  const matchedUsers = React.useMemo(
    () => users.filter((user) => !normalized || `${user.nickname} ${user.statusMessage ?? ""}`.toLocaleLowerCase().includes(normalized)).slice(0, 8),
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
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandRow}>
          <View>
            <Text style={styles.brand}>Another Me</Text>
            <Text style={styles.subtitle}>STAR, FAN, 콘텐츠와 미션을 탐색하세요</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="친구 추가" onPress={() => router.push("/friends/add")} style={styles.headerButton}>
            <Feather name="user-plus" size={20} color={neon.cyan} />
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Feather name="search" size={22} color={neon.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="비비, 팬아트, 미션 검색"
            placeholderTextColor={neon.muted}
            style={styles.input}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => setQuery("")} hitSlop={12}>
              <Feather name="x" size={20} color={neon.muted} />
            </Pressable>
          ) : null}
        </View>

        {!normalized ? (
          <NeonCard style={styles.hero}>
            <View style={styles.heroIcon}><Feather name="star" size={26} color={neon.cyan} /></View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>비비는 왜 이름이 비비일까?</Text>
              <Text style={styles.heroBody}>Another Me 세계관과 캐릭터의 이야기를 찾아보세요.</Text>
            </View>
          </NeonCard>
        ) : null}

        <NeonSectionTitle>인기 검색어</NeonSectionTitle>
        <View style={styles.chips}>
          {TRENDING.map((term, index) => (
            <Pressable key={term} onPress={() => setQuery(term)} style={styles.chip}>
              <Text style={styles.chipRank}>{index + 1}.</Text><Text style={styles.chipText}>{term}</Text>
            </Pressable>
          ))}
        </View>

        <NeonSectionTitle action={<Pressable onPress={() => router.push("/friends/add")}><Text style={styles.more}>친구 찾기</Text></Pressable>}>
          추천 STAR / FAN
        </NeonSectionTitle>
        {usersLoading ? <ActivityIndicator color={neon.purple} /> : (
          <View style={styles.peopleGrid}>
            {matchedUsers.map((user) => (
              <Pressable key={user.id} onPress={() => router.push("/friends/add")} style={styles.personCard}>
                <Avatar uri={user.profileImageUrl} name={user.nickname} size={48} />
                <Text style={styles.personName} numberOfLines={1}>{user.nickname}</Text>
                <Text style={styles.personRole}>FAN</Text>
              </Pressable>
            ))}
          </View>
        )}

        <NeonSectionTitle>추천 콘텐츠</NeonSectionTitle>
        {feedLoading ? <ActivityIndicator color={neon.purple} /> : matchedPosts.length ? matchedPosts.map((post) => (
          <Pressable key={post.id} onPress={() => router.push("/(tabs)/feed")}>
            <NeonCard style={styles.postCard}>
              <Avatar uri={post.author.profileImageUrl} name={post.author.nickname} size={42} />
              <View style={styles.postCopy}>
                <Text style={styles.postAuthor}>{post.author.nickname}</Text>
                <Text style={styles.postTitle} numberOfLines={1}>{post.title}</Text>
                <Text style={styles.postBody} numberOfLines={2}>{post.body}</Text>
                <Text style={styles.postMeta}>♡ {post.reactionCount}   ◯ {post.commentCount}</Text>
              </View>
              <Feather name="chevron-right" size={20} color={neon.muted} />
            </NeonCard>
          </Pressable>
        )) : <Text style={styles.empty}>검색 결과가 없습니다.</Text>}
      </CustomScrollView>
    </NeonBackdrop>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 16 },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { color: neon.text, fontFamily: "Inter_700Bold", fontSize: 28 },
  subtitle: { color: neon.muted, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  headerButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: neon.line, alignItems: "center", justifyContent: "center", backgroundColor: neon.panel },
  searchBox: { minHeight: 54, borderRadius: 28, borderWidth: 1, borderColor: neon.line, backgroundColor: neon.panel, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 10 },
  input: { flex: 1, color: neon.text, fontFamily: "Inter_400Regular", fontSize: 15, paddingVertical: 12 },
  hero: { flexDirection: "row", alignItems: "center", minHeight: 130, backgroundColor: "rgba(31, 15, 63, 0.86)" },
  heroIcon: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(82, 38, 232, 0.35)", borderWidth: 1, borderColor: neon.line },
  heroCopy: { flex: 1, marginLeft: 16 },
  heroTitle: { color: neon.text, fontFamily: "Inter_700Bold", fontSize: 19 },
  heroBody: { color: neon.muted, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, marginTop: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 38, paddingHorizontal: 13, borderRadius: 19, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: neon.panel, borderWidth: 1, borderColor: "rgba(157, 99, 255, 0.22)" },
  chipRank: { color: neon.magenta, fontFamily: "Inter_700Bold" },
  chipText: { color: neon.text, fontFamily: "Inter_500Medium", fontSize: 13 },
  more: { color: neon.purple, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  peopleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  personCard: { width: "22%", minWidth: 72, flexGrow: 1, alignItems: "center", padding: 10, borderRadius: 18, backgroundColor: neon.panelSoft, borderWidth: 1, borderColor: neon.line },
  personName: { color: neon.text, fontFamily: "Inter_600SemiBold", fontSize: 12, marginTop: 7, maxWidth: "100%" },
  personRole: { color: neon.purple, fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 3 },
  postCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13 },
  postCopy: { flex: 1 },
  postAuthor: { color: neon.text, fontFamily: "Inter_700Bold", fontSize: 13 },
  postTitle: { color: neon.text, fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 4 },
  postBody: { color: neon.muted, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, marginTop: 3 },
  postMeta: { color: neon.purple, fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 7 },
  empty: { color: neon.muted, textAlign: "center", paddingVertical: 24 },
});
