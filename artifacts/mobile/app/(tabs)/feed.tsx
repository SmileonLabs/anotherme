import { Feather } from "@expo/vector-icons";
import { Image, type ImageSource } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/Avatar";
import { CustomScrollView } from "@/components/CustomScroll";
import { NeonBackdrop } from "@/components/NeonUI";
import { neon } from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { usePlayMode } from "@/hooks/usePlayMode";
import {
  useStarFeed,
  type StarFeedAuthor,
  type StarFeedPost,
  type StarFeedPostKind,
  type StarFeedWritableKind,
} from "@/hooks/useStarFeed";
import { mediaUri } from "@/lib/apiBase";

type ColorTokens = ReturnType<typeof useColors>;

const KIND_META: Record<StarFeedPostKind, { label: string; tags: string[] }> = {
  official: { label: "STAR", tags: ["공식", "Another Me"] },
  event: { label: "STAR", tags: ["이벤트", "미션"] },
  fan: { label: "FAN", tags: ["응원해요", "비비"] },
  star: { label: "STAR", tags: ["STAR", "성장"] },
  growth: { label: "STAR", tags: ["성장", "기록"] },
  profile_update: { label: "FAN", tags: ["프로필", "새소식"] },
  talk_diary: { label: "FAN", tags: ["대화일기", "오늘"] },
};

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function metadataStringArray(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function errorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: unknown } }).data;
    if (typeof data?.message === "string") return data.message;
  }
  return fallback;
}

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "방금 전";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function postVisualSource(post: StarFeedPost): ImageSource | null {
  const explicit =
    metadataString(post.metadata, "imageUrl") ??
    metadataString(post.metadata, "thumbnailUrl") ??
    metadataString(post.metadata, "coverImageUrl") ??
    metadataString(post.metadata, "newProfileImageUrl");
  return explicit ? { uri: mediaUri(explicit) } : null;
}

function StoryItem({ author, index }: { author: StarFeedAuthor; index: number }) {
  return (
    <Pressable style={({ pressed }) => [styles.storyItem, pressed && styles.pressed]}>
      <LinearGradient colors={["#F044D0", "#7B35FF", "#24D6E8"]} style={styles.storyRing}>
        <View style={styles.storyAvatarInset}>
          <Avatar uri={author.profileImageUrl} name={author.nickname} size={50} />
        </View>
        {index === 0 ? <View style={styles.storyPlus}><Feather name="plus" size={12} color="#FFFFFF" /></View> : null}
      </LinearGradient>
      <View style={styles.storyNameRow}>
        <Text style={styles.storyName} numberOfLines={1}>{index === 0 ? "내 스토리" : author.nickname}</Text>
        {index === 1 ? <View style={styles.verified}><Feather name="check" size={7} color="#FFFFFF" /></View> : null}
      </View>
      {index > 0 ? <Text style={styles.storyRole}>{index < 3 ? "STAR" : "FAN"}</Text> : null}
    </Pressable>
  );
}

function FeedPostCard({
  post,
  colors,
  commentDraft,
  isCheering,
  isCommenting,
  onCheer,
  onCommentDraft,
  onSubmitComment,
}: {
  post: StarFeedPost;
  colors: ColorTokens;
  commentDraft: string;
  isCheering: boolean;
  isCommenting: boolean;
  onCheer: (postId: string) => void;
  onCommentDraft: (postId: string, value: string) => void;
  onSubmitComment: (postId: string) => void;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const meta = KIND_META[post.kind];
  const keywordTags = metadataStringArray(post.metadata, "keywords").slice(0, 2);
  const tags = keywordTags.length ? keywordTags : meta.tags;
  const canComment = commentDraft.trim().length > 0 && !isCommenting;
  const visualSource = postVisualSource(post);

  return (
    <LinearGradient
      colors={["rgba(10,10,26,0.99)", "rgba(4,6,18,0.99)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.feedCard}
    >
      <View pointerEvents="none" style={styles.cardGlow} />
      <View style={styles.feedHeader}>
        <View style={styles.avatarRing}><Avatar uri={post.author.profileImageUrl} name={post.author.nickname} size={44} /></View>
        <View style={styles.feedIdentity}>
          <View style={styles.authorRow}>
            <Text style={styles.feedAuthor} numberOfLines={1}>{post.author.nickname}</Text>
            <View style={styles.verified}><Feather name="check" size={7} color="#FFFFFF" /></View>
            <Text style={styles.feedRole}>{meta.label}</Text>
          </View>
          <Text style={styles.feedTime}>{relativeTime(post.createdAt)}</Text>
        </View>
        <Feather name="more-vertical" size={18} color="#9C98A6" />
      </View>

      <View style={styles.feedMain}>
        <View style={styles.feedCopy}>
          <Text style={styles.feedTitle} numberOfLines={2}>{post.title}</Text>
          <Text style={styles.feedBody} numberOfLines={3}>{post.body}</Text>
          <View style={styles.tagRow}>
            {tags.map((tag) => <Text key={tag} style={styles.tag}>#{tag}</Text>)}
          </View>
        </View>
        {visualSource ? (
          <View style={styles.visualWrap}>
            <Image source={visualSource} style={styles.feedVisual} contentFit="cover" />
            {post.kind === "event" ? <View style={styles.playButton}><Feather name="play" size={18} color="#FFFFFF" /></View> : null}
          </View>
        ) : null}
      </View>

      <View style={styles.actionRow}>
        <Pressable
          disabled={post.reactedByMe || isCheering}
          onPress={() => onCheer(post.id)}
          style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
        >
          <Feather name="heart" size={20} color={post.reactedByMe ? neon.magenta : "#B847FF"} />
          <Text style={styles.actionCount}>{post.reactionCount}</Text>
        </Pressable>
        <Pressable onPress={() => setCommentsOpen((open) => !open)} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
          <Feather name="message-circle" size={19} color="#B9B4C3" />
          <Text style={styles.actionCount}>{post.commentCount}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]} accessibilityLabel="공유">
          <Feather name="share-2" size={18} color="#B9B4C3" />
        </Pressable>
      </View>

      {commentsOpen ? (
        <View style={styles.commentsPanel}>
          {post.recentComments.map((comment) => (
            <View key={comment.id} style={styles.commentRow}>
              <Text style={styles.commentAuthor}>{comment.author.nickname}</Text>
              <Text style={styles.commentBody}>{comment.body}</Text>
            </View>
          ))}
          <View style={styles.commentInputRow}>
            <TextInput
              value={commentDraft}
              onChangeText={(value) => onCommentDraft(post.id, value)}
              placeholder="댓글로 응원하기"
              placeholderTextColor={colors.mutedForeground}
              style={styles.commentInput}
              maxLength={240}
            />
            <Pressable
              disabled={!canComment}
              onPress={() => onSubmitComment(post.id)}
              style={[styles.commentSubmit, { opacity: canComment ? 1 : 0.42 }]}
            >
              <Feather name="send" size={15} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      ) : null}
    </LinearGradient>
  );
}

export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { starUnlocked, equippedStar } = usePlayMode();
  const {
    posts,
    isLoading,
    error,
    refetch,
    createPost,
    cheerPost,
    commentPost,
    isCreatingPost,
    isCheering,
    isCommenting,
  } = useStarFeed();
  const [draft, setDraft] = useState("");
  const [postKind, setPostKind] = useState<StarFeedWritableKind>("fan");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [feedFilter, setFeedFilter] = useState<"recommended" | "following">("recommended");

  const officialStarReady = equippedStar?.stage === "promoted";
  const activePostKind: StarFeedWritableKind = officialStarReady ? postKind : "fan";
  const canPost = draft.trim().length > 0 && !isCreatingPost;
  const starName = equippedStar?.displayName ?? "STAR";
  const storyAuthors = useMemo(() => {
    const unique = new Map<string, StarFeedAuthor>();
    posts.forEach((post) => {
      const key = post.author.id ?? post.author.nickname;
      if (!unique.has(key)) unique.set(key, post.author);
    });
    return [...unique.values()].slice(0, 7);
  }, [posts]);

  async function submitPost() {
    const body = draft.trim();
    if (!body) return;
    setFeedback(null);
    try {
      await createPost({ kind: activePostKind, body });
      setDraft("");
      setComposerOpen(false);
    } catch (err) {
      setFeedback(errorMessage(err, "게시글을 올리지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
  }

  async function cheer(postId: string) {
    try {
      await cheerPost(postId);
    } catch {
      setFeedback("응원 반응을 남기지 못했어요.");
    }
  }

  async function submitComment(postId: string) {
    const body = (commentDrafts[postId] ?? "").trim();
    if (!body) return;
    try {
      await commentPost({ postId, body });
      setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
    } catch {
      setFeedback("댓글을 남기지 못했어요.");
    }
  }

  return (
    <NeonBackdrop style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.feedTabs}>
          {(["recommended", "following"] as const).map((item) => {
            const active = feedFilter === item;
            return (
              <Pressable key={item} onPress={() => setFeedFilter(item)} style={styles.feedTabPressable}>
                {active ? (
                  <LinearGradient colors={["#481378", "#1B0737"]} style={styles.feedTabActive}>
                    <Text style={styles.feedTabActiveText}>{item === "recommended" ? "추천 ·" : "팔로잉"}</Text>
                  </LinearGradient>
                ) : <Text style={styles.feedTabText}>{item === "recommended" ? "추천" : "팔로잉"}</Text>}
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={() => setComposerOpen((open) => !open)} style={({ pressed }) => [styles.writeButton, pressed && styles.pressed]}>
          <Feather name={composerOpen ? "x" : "plus"} size={19} color="#B84CFF" />
          <Text style={styles.writeButtonText}>{composerOpen ? "닫기" : "글쓰기"}</Text>
        </Pressable>
      </View>

      <CustomScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}>
        {composerOpen ? (
          <LinearGradient colors={["#141025", "#090816"]} style={styles.composer}>
            <View style={styles.composerHeader}>
              <View style={styles.composerIcon}><Feather name="edit-3" size={17} color="#A64DFF" /></View>
              <View style={styles.composerTitleBlock}>
                <Text style={styles.composerTitle}>{activePostKind === "star" ? "공식 STAR 기록" : "FAN 응원글"}</Text>
                <Text style={styles.composerSub}>{starUnlocked ? `${starName}에게 전할 이야기를 남겨주세요.` : "STAR 잠금 상태에서도 응원글을 남길 수 있어요."}</Text>
              </View>
            </View>
            <View style={styles.kindSwitch}>
              {(["fan", "star"] as StarFeedWritableKind[]).map((kind) => {
                const active = activePostKind === kind;
                const disabled = kind === "star" && !officialStarReady;
                return (
                  <Pressable key={kind} disabled={disabled} onPress={() => setPostKind(kind)} style={[styles.kindButton, active && styles.kindButtonActive, disabled && styles.kindButtonDisabled]}>
                    {disabled ? <Feather name="lock" size={11} color="#676173" /> : null}
                    <Text style={[styles.kindButtonText, active && styles.kindButtonTextActive]}>{kind === "fan" ? "FAN 응원글" : "공식 STAR 기록"}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={`오늘 ${starName}에게 보내는 이야기를 적어주세요.`}
              placeholderTextColor="#817A8C"
              multiline
              maxLength={500}
              style={styles.composerInput}
            />
            {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
            <Pressable disabled={!canPost} onPress={() => void submitPost()} style={[styles.postButton, { opacity: canPost ? 1 : 0.42 }]}>
              <Text style={styles.postButtonText}>{isCreatingPost ? "올리는 중" : "게시하기"}</Text>
            </Pressable>
          </LinearGradient>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stories}>
          {storyAuthors.map((author, index) => <StoryItem key={author.id ?? `${author.nickname}-${index}`} author={author} index={index} />)}
        </ScrollView>

        {feedback && !composerOpen ? <Text style={styles.feedbackBanner}>{feedback}</Text> : null}

        {isLoading ? (
          <View style={styles.stateBox}><ActivityIndicator color={neon.purple} /><Text style={styles.stateText}>피드를 불러오는 중이에요.</Text></View>
        ) : error ? (
          <Pressable onPress={() => void refetch()} style={styles.stateBox}><Text style={styles.stateTitle}>피드를 불러오지 못했어요</Text><Text style={styles.stateText}>눌러서 다시 시도해 주세요.</Text></Pressable>
        ) : posts.length === 0 ? (
          <View style={styles.stateBox}><Text style={styles.stateTitle}>아직 피드가 비어 있어요</Text><Text style={styles.stateText}>첫 FAN 응원글을 남겨보세요.</Text></View>
        ) : (
          <View style={styles.feedList}>
            {posts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                colors={colors}
                commentDraft={commentDrafts[post.id] ?? ""}
                isCheering={isCheering}
                isCommenting={isCommenting}
                onCheer={(postId) => void cheer(postId)}
                onCommentDraft={(postId, value) => setCommentDrafts((prev) => ({ ...prev, [postId]: value }))}
                onSubmitComment={(postId) => void submitComment(postId)}
              />
            ))}
          </View>
        )}
      </CustomScrollView>
    </NeonBackdrop>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  header: { minHeight: 55, paddingHorizontal: 13, paddingBottom: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  feedTabs: { width: 193, height: 39, padding: 3, borderRadius: 22, borderWidth: 1, borderColor: "rgba(123,53,255,0.26)", backgroundColor: "rgba(6,6,18,0.9)", flexDirection: "row" },
  feedTabPressable: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 19, overflow: "hidden" },
  feedTabActive: { width: "100%", height: "100%", borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(182,75,255,0.62)", shadowColor: "#A64DFF", shadowOpacity: 0.7, shadowRadius: 8 },
  feedTabActiveText: { color: "#F4E9FF", fontFamily: "Inter_600SemiBold", fontSize: 12 },
  feedTabText: { color: "#9A94A6", fontFamily: "Inter_500Medium", fontSize: 12 },
  writeButton: { height: 39, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: "rgba(92,69,157,0.26)", backgroundColor: "rgba(13,13,30,0.94)", flexDirection: "row", alignItems: "center", gap: 8 },
  writeButtonText: { color: "#D8D2E0", fontFamily: "Inter_500Medium", fontSize: 12 },
  content: { paddingHorizontal: 7, gap: 8 },
  stories: { gap: 10, paddingHorizontal: 4, paddingVertical: 7 },
  storyItem: { width: 61, alignItems: "center" },
  storyRing: { width: 58, height: 58, borderRadius: 29, padding: 2, alignItems: "center", justifyContent: "center" },
  storyAvatarInset: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#05040D", padding: 2, alignItems: "center", justifyContent: "center" },
  storyPlus: { position: "absolute", right: -2, bottom: 1, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#8A39FF", borderWidth: 2, borderColor: "#05040D" },
  storyNameRow: { maxWidth: 61, flexDirection: "row", alignItems: "center", gap: 3, marginTop: 6 },
  storyName: { color: "#C4BFCA", fontFamily: "Inter_400Regular", fontSize: 9, maxWidth: 52 },
  storyRole: { color: "#C047FF", fontFamily: "Inter_500Medium", fontSize: 9, marginTop: 2 },
  verified: { width: 11, height: 11, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: "#7B35FF" },
  composer: { borderRadius: 18, borderWidth: 1, borderColor: "rgba(133,75,210,0.34)", padding: 14, gap: 11, overflow: "hidden" },
  composerHeader: { flexDirection: "row", gap: 10, alignItems: "center" },
  composerIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(98,35,174,0.32)" },
  composerTitleBlock: { flex: 1 },
  composerTitle: { color: neon.text, fontFamily: "Inter_700Bold", fontSize: 14 },
  composerSub: { color: neon.muted, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 3 },
  kindSwitch: { height: 38, borderRadius: 20, borderWidth: 1, borderColor: "rgba(130,75,194,0.36)", padding: 3, flexDirection: "row" },
  kindButton: { flex: 1, borderRadius: 17, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  kindButtonActive: { backgroundColor: "#F4F0FF" },
  kindButtonDisabled: { opacity: 0.48 },
  kindButtonText: { color: "#7D7689", fontFamily: "Inter_600SemiBold", fontSize: 11 },
  kindButtonTextActive: { color: "#080611" },
  composerInput: { minHeight: 82, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: "rgba(125,70,180,0.32)", backgroundColor: "rgba(7,7,18,0.82)", color: neon.text, fontFamily: "Inter_400Regular", fontSize: 13, textAlignVertical: "top" },
  feedback: { color: "#FF7770", fontFamily: "Inter_500Medium", fontSize: 11 },
  postButton: { height: 40, borderRadius: 14, backgroundColor: "#6F3EAA", alignItems: "center", justifyContent: "center" },
  postButtonText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 12 },
  feedList: { gap: 8 },
  feedCard: { borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(61,56,113,0.42)", padding: 11, overflow: "hidden" },
  cardGlow: { position: "absolute", right: -80, top: -90, width: 230, height: 190, borderRadius: 120, backgroundColor: "rgba(43,34,126,0.10)" },
  feedHeader: { height: 46, flexDirection: "row", alignItems: "center", gap: 9 },
  avatarRing: { width: 48, height: 48, padding: 2, borderRadius: 24, borderWidth: 1, borderColor: "#A63CFF", alignItems: "center", justifyContent: "center" },
  feedIdentity: { flex: 1 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  feedAuthor: { color: "#E6E2EB", fontFamily: "Inter_500Medium", fontSize: 12, maxWidth: "58%" },
  feedRole: { color: "#C143FF", fontFamily: "Inter_500Medium", fontSize: 9 },
  feedTime: { color: "#777181", fontFamily: "Inter_400Regular", fontSize: 9, marginTop: 3 },
  feedMain: { flexDirection: "row", gap: 10, marginTop: 8 },
  feedCopy: { flex: 1, minWidth: 0, paddingVertical: 2 },
  feedTitle: { color: "#F0EDF4", fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 17 },
  feedBody: { color: "#C0BAC6", fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 5 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 7 },
  tag: { color: "#9563B9", fontFamily: "Inter_400Regular", fontSize: 9 },
  visualWrap: { width: "48%", height: 112, borderRadius: 10, overflow: "hidden", backgroundColor: "#100D23", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(123,53,255,0.24)" },
  feedVisual: { width: "100%", height: "100%" },
  playButton: { position: "absolute", left: 10, bottom: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(5,4,13,0.78)", borderWidth: 1, borderColor: "rgba(83,224,232,0.65)", alignItems: "center", justifyContent: "center" },
  actionRow: { height: 30, flexDirection: "row", alignItems: "center", marginTop: 7, paddingLeft: 2 },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 7, paddingRight: 23 },
  actionCount: { color: "#AAA5B2", fontFamily: "Inter_400Regular", fontSize: 10 },
  shareButton: { marginLeft: 2 },
  commentsPanel: { marginTop: 8, paddingTop: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(112,70,161,0.22)", gap: 7 },
  commentRow: { flexDirection: "row", gap: 7 },
  commentAuthor: { color: neon.text, fontFamily: "Inter_600SemiBold", fontSize: 10 },
  commentBody: { flex: 1, color: neon.muted, fontFamily: "Inter_400Regular", fontSize: 10 },
  commentInputRow: { height: 37, flexDirection: "row", gap: 7 },
  commentInput: { flex: 1, borderRadius: 19, borderWidth: 1, borderColor: "rgba(122,64,168,0.35)", backgroundColor: "#0B0A16", color: neon.text, paddingHorizontal: 12, fontFamily: "Inter_400Regular", fontSize: 11 },
  commentSubmit: { width: 37, height: 37, borderRadius: 19, backgroundColor: "#6A3DA8", alignItems: "center", justifyContent: "center" },
  feedbackBanner: { color: "#FF7770", backgroundColor: "rgba(80,20,32,0.35)", borderRadius: 10, padding: 10, fontFamily: "Inter_500Medium", fontSize: 11 },
  stateBox: { minHeight: 120, borderRadius: 16, borderWidth: 1, borderColor: "rgba(80,62,124,0.35)", backgroundColor: "rgba(9,9,22,0.94)", alignItems: "center", justifyContent: "center", gap: 8 },
  stateTitle: { color: neon.text, fontFamily: "Inter_700Bold", fontSize: 14 },
  stateText: { color: neon.muted, fontFamily: "Inter_400Regular", fontSize: 11 },
});
