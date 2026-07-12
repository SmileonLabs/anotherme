import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CustomScrollView } from "@/components/CustomScroll";
import { ModeSwitch } from "@/components/ModeSwitch";
import { useColors } from "@/hooks/useColors";
import { usePlayMode } from "@/hooks/usePlayMode";
import {
  useStarFeed,
  type StarFeedPost,
  type StarFeedPostKind,
  type StarFeedWritableKind,
} from "@/hooks/useStarFeed";
import { mediaUri } from "@/lib/apiBase";

type FeatherName = React.ComponentProps<typeof Feather>["name"];
type ColorTokens = ReturnType<typeof useColors>;

const KIND_META: Record<
  StarFeedPostKind,
  { label: string; icon: FeatherName }
> = {
  official: { label: "OFFICIAL", icon: "star" },
  event: { label: "EVENT", icon: "calendar" },
  fan: { label: "FAN 응원", icon: "heart" },
  star: { label: "공식 STAR", icon: "zap" },
  growth: { label: "GROWTH", icon: "trending-up" },
  profile_update: { label: "PROFILE", icon: "user" },
  talk_diary: { label: "TALK DIARY", icon: "book-open" },
};

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function metadataBoolean(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  return metadata?.[key] === true;
}

function metadataNumber(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metadataStringArray(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string[] {
  const value = metadata?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function errorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: unknown } }).data;
    if (typeof data?.message === "string") return data.message;
  }
  return fallback;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}.${day} ${hour}:${minute}`;
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
  const meta = KIND_META[post.kind];
  const canComment = commentDraft.trim().length > 0 && !isCommenting;
  const isProfileUpdate = post.kind === "profile_update";
  const isTalkDiary = post.kind === "talk_diary";
  const profileImageChanged = metadataBoolean(
    post.metadata,
    "profileImageChanged",
  );
  const statusMessageChanged = metadataBoolean(
    post.metadata,
    "statusMessageChanged",
  );
  const profileImageUrl =
    metadataString(post.metadata, "newProfileImageUrl") ??
    post.author.profileImageUrl;
  const statusMessage = metadataString(post.metadata, "newStatusMessage");
  const talkMood = metadataString(post.metadata, "mood");
  const talkKeywords = metadataStringArray(post.metadata, "keywords");
  const talkQualityScore = metadataNumber(post.metadata, "qualityScore");
  const talkPvtAmount = metadataNumber(post.metadata, "pvtAmount");

  return (
    <View
      style={[
        styles.feedCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.feedTopRow}>
        <View style={[styles.feedIcon, { backgroundColor: colors.accent }]}>
          <Feather name={meta.icon} size={19} color={colors.primary} />
        </View>
        <View style={styles.feedTitleBlock}>
          <View style={styles.feedMetaRow}>
            <Text style={[styles.feedType, { color: colors.primary }]}>
              {meta.label}
            </Text>
            <Text style={[styles.feedDate, { color: colors.mutedForeground }]}>
              {formatDate(post.createdAt)}
            </Text>
          </View>
          <Text style={[styles.feedAuthor, { color: colors.mutedForeground }]}>
            {post.author.nickname}
          </Text>
        </View>
      </View>

      <Text style={[styles.feedTitle, { color: colors.foreground }]}>
        {post.title}
      </Text>
      {isProfileUpdate ? (
        <View
          style={[
            styles.profileUpdateCard,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          {profileImageChanged ? (
            <View style={styles.profileUpdateImageBlock}>
              <View
                style={[
                  styles.profileImagePreview,
                  { backgroundColor: colors.card },
                ]}
              >
                {profileImageUrl ? (
                  <Image
                    source={{ uri: mediaUri(profileImageUrl) }}
                    style={styles.profileImagePreviewImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.profileImagePlaceholder}>
                    <Feather
                      name="image"
                      size={24}
                      color={colors.mutedForeground}
                    />
                  </View>
                )}
              </View>
              <View style={styles.profileUpdateBody}>
                <Text
                  style={[
                    styles.profileUpdateLabel,
                    { color: colors.foreground },
                  ]}
                >
                  프로필 사진
                </Text>
                <Text
                  style={[
                    styles.profileUpdateDesc,
                    { color: colors.mutedForeground },
                  ]}
                >
                  새 사진으로 변경했어요.
                </Text>
              </View>
            </View>
          ) : null}
          {statusMessageChanged ? (
            <View
              style={[
                styles.statusMessageBox,
                { backgroundColor: colors.card },
              ]}
            >
              <Feather name="message-square" size={15} color={colors.primary} />
              <Text
                style={[styles.statusMessageText, { color: colors.foreground }]}
              >
                {statusMessage || "상태 메시지를 비웠습니다."}
              </Text>
            </View>
          ) : null}
        </View>
      ) : isTalkDiary ? (
        <View
          style={[
            styles.talkDiaryCard,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <View style={styles.talkDiaryTopRow}>
            <View
              style={[styles.talkDiaryIcon, { backgroundColor: colors.card }]}
            >
              <Feather name="book-open" size={18} color={colors.primary} />
            </View>
            <View style={styles.talkDiaryTitleBlock}>
              <Text style={[styles.talkDiaryLabel, { color: colors.primary }]}>
                오늘의 대화 일기
              </Text>
              {talkMood ? (
                <Text
                  style={[
                    styles.talkDiaryMood,
                    { color: colors.mutedForeground },
                  ]}
                >
                  오늘의 감정 · {talkMood}
                </Text>
              ) : null}
            </View>
          </View>
          <Text style={[styles.talkDiaryBody, { color: colors.foreground }]}>
            {post.body}
          </Text>
          {talkKeywords.length > 0 ? (
            <View style={styles.talkKeywordRow}>
              {talkKeywords.map((keyword) => (
                <View
                  key={keyword}
                  style={[
                    styles.talkKeywordPill,
                    { backgroundColor: colors.card },
                  ]}
                >
                  <Text
                    style={[styles.talkKeywordText, { color: colors.primary }]}
                  >
                    {keyword}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {talkQualityScore !== null || talkPvtAmount !== null ? (
            <View
              style={[styles.talkRewardRow, { backgroundColor: colors.card }]}
            >
              {talkQualityScore !== null ? (
                <Text
                  style={[styles.talkRewardText, { color: colors.foreground }]}
                >
                  대화 품질 {talkQualityScore}점
                </Text>
              ) : null}
              {talkPvtAmount !== null ? (
                <Text
                  style={[styles.talkRewardText, { color: colors.primary }]}
                >
                  {talkPvtAmount} PVT 획득
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.feedText, { color: colors.mutedForeground }]}>
          {post.body}
        </Text>
      )}

      <View style={styles.actionRow}>
        <Pressable
          disabled={post.reactedByMe || isCheering}
          onPress={() => onCheer(post.id)}
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: post.reactedByMe
                ? colors.primary
                : colors.secondary,
              opacity: pressed ? 0.75 : post.reactedByMe ? 0.9 : 1,
            },
          ]}
        >
          <Feather
            name="heart"
            size={15}
            color={post.reactedByMe ? colors.primaryForeground : colors.primary}
          />
          <Text
            style={[
              styles.actionText,
              {
                color: post.reactedByMe
                  ? colors.primaryForeground
                  : colors.primary,
              },
            ]}
          >
            응원 {post.reactionCount}
          </Text>
        </Pressable>
        <View
          style={[styles.commentCountPill, { backgroundColor: colors.muted }]}
        >
          <Feather
            name="message-circle"
            size={15}
            color={colors.mutedForeground}
          />
          <Text
            style={[styles.commentCountText, { color: colors.mutedForeground }]}
          >
            댓글 {post.commentCount}
          </Text>
        </View>
      </View>

      {post.recentComments.length > 0 ? (
        <View style={[styles.commentsBox, { backgroundColor: colors.muted }]}>
          {post.recentComments.map((comment) => (
            <View key={comment.id} style={styles.commentRow}>
              <Text
                style={[styles.commentAuthor, { color: colors.foreground }]}
              >
                {comment.author.nickname}
              </Text>
              <Text
                style={[styles.commentBody, { color: colors.mutedForeground }]}
              >
                {comment.body}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.commentInputRow}>
        <TextInput
          value={commentDraft}
          onChangeText={(value) => onCommentDraft(post.id, value)}
          placeholder="댓글로 응원하기"
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.commentInput,
            {
              backgroundColor: colors.input,
              color: colors.foreground,
              borderColor: colors.border,
            },
          ]}
          maxLength={240}
        />
        <Pressable
          disabled={!canComment}
          onPress={() => onSubmitComment(post.id)}
          style={({ pressed }) => [
            styles.commentSubmit,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.75 : canComment ? 1 : 0.45,
            },
          ]}
        >
          <Feather name="send" size={16} color={colors.primaryForeground} />
        </Pressable>
      </View>
    </View>
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
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [feedback, setFeedback] = useState<string | null>(null);

  const officialStarReady = equippedStar?.stage === "promoted";
  const activePostKind: StarFeedWritableKind = officialStarReady
    ? postKind
    : "fan";
  const composerTitle =
    activePostKind === "star" ? "공식 STAR 기록" : "FAN 응원글";
  const canPost = draft.trim().length > 0 && !isCreatingPost;
  const starName = equippedStar?.displayName ?? "STAR";

  async function submitPost() {
    const body = draft.trim();
    if (!body) return;
    setFeedback(null);
    try {
      await createPost({ kind: activePostKind, body });
      setDraft("");
    } catch (err) {
      setFeedback(
        errorMessage(
          err,
          activePostKind === "star"
            ? "공식 STAR 기록을 올리지 못했어요. 잠시 후 다시 시도해 주세요."
            : "응원글을 올리지 못했어요. 잠시 후 다시 시도해 주세요.",
        ),
      );
    }
  }

  async function cheer(postId: string) {
    try {
      await cheerPost(postId);
    } catch {
      setFeedback("응원 반응을 남기지 못했어요.");
    }
  }

  function updateCommentDraft(postId: string, value: string) {
    setCommentDrafts((prev) => ({ ...prev, [postId]: value }));
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.titleBlock}>
          <Text style={[styles.kicker, { color: colors.primary }]}>
            STAR SNS
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>피드</Text>
        </View>
        <ModeSwitch />
      </View>

      <CustomScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 100,
        }}
      >
        <View
          style={[
            styles.composer,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.composerHeader}>
            <View
              style={[styles.composerIcon, { backgroundColor: colors.accent }]}
            >
              <Feather
                name={activePostKind === "star" ? "zap" : "edit-3"}
                size={18}
                color={colors.primary}
              />
            </View>
            <View style={styles.composerTitleBlock}>
              <Text
                style={[styles.composerTitle, { color: colors.foreground }]}
              >
                {composerTitle}
              </Text>
              <Text
                style={[styles.composerSub, { color: colors.mutedForeground }]}
              >
                {activePostKind === "star"
                  ? `${starName}의 공식 활동과 팬클럽 소식을 STAR 이름으로 기록해요.`
                  : starUnlocked
                    ? equippedStar
                      ? officialStarReady
                        ? "FAN 응원글 또는 공식 STAR 기록 중 하나를 선택해 남길 수 있어요."
                        : `${starName}는 아직 연습생 STAR예요. 토르미아 개방 후 공식 STAR 기록을 남길 수 있어요.`
                      : "마이페이지에서 STAR NFT를 장착하면 캐릭터 성장 기록이 열려요."
                    : "STAR 잠금 상태여도 피드 보기, 응원, 댓글은 가능해요."}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.kindSwitch,
              { backgroundColor: colors.muted, borderColor: colors.border },
            ]}
          >
            {(["fan", "star"] as StarFeedWritableKind[]).map((kind) => {
              const active = activePostKind === kind;
              const disabled = kind === "star" && !officialStarReady;
              return (
                <Pressable
                  key={kind}
                  disabled={disabled}
                  onPress={() => setPostKind(kind)}
                  style={[
                    styles.kindButton,
                    {
                      backgroundColor: active
                        ? colors.foreground
                        : "transparent",
                      opacity: disabled ? 0.45 : 1,
                    },
                  ]}
                >
                  {disabled ? (
                    <Feather
                      name="lock"
                      size={12}
                      color={colors.mutedForeground}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.kindButtonText,
                      {
                        color: active
                          ? colors.background
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    {kind === "star" ? "공식 STAR 기록" : "FAN 응원글"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={
              activePostKind === "star"
                ? `오늘 ${starName}의 공식 STAR 활동을 기록해 주세요.`
                : `오늘 ${starName}에게 보내는 응원을 적어주세요.`
            }
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={500}
            style={[
              styles.composerInput,
              {
                backgroundColor: colors.input,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
          />
          {feedback ? (
            <Text style={[styles.feedback, { color: colors.destructive }]}>
              {feedback}
            </Text>
          ) : null}
          <Pressable
            disabled={!canPost}
            onPress={submitPost}
            style={({ pressed }) => [
              styles.postButton,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.75 : canPost ? 1 : 0.45,
              },
            ]}
          >
            <Text
              style={[
                styles.postButtonText,
                { color: colors.primaryForeground },
              ]}
            >
              {isCreatingPost
                ? "올리는 중"
                : activePostKind === "star"
                  ? "공식 기록 올리기"
                  : "응원글 올리기"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {starName} 월드 타임라인
          </Text>
          <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
            FAN은 보고 응원하고, 공식 STAR는 성장 기록을 남깁니다.
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              피드를 불러오는 중이에요.
            </Text>
          </View>
        ) : error ? (
          <Pressable
            onPress={() => void refetch()}
            style={[
              styles.stateBox,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>
              피드를 불러오지 못했어요
            </Text>
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              눌러서 다시 시도해 주세요.
            </Text>
          </Pressable>
        ) : posts.length === 0 ? (
          <View
            style={[
              styles.stateBox,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>
              아직 피드가 비어 있어요
            </Text>
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              첫 FAN 응원글을 남겨보세요.
            </Text>
          </View>
        ) : (
          posts.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              colors={colors}
              commentDraft={commentDrafts[post.id] ?? ""}
              isCheering={isCheering}
              isCommenting={isCommenting}
              onCheer={(postId) => void cheer(postId)}
              onCommentDraft={updateCommentDraft}
              onSubmitComment={(postId) => void submitComment(postId)}
            />
          ))
        )}
      </CustomScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  titleBlock: { gap: 2 },
  kicker: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.2 },
  title: { fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: -0.7 },
  composer: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    marginTop: 10,
    padding: 16,
  },
  composerHeader: { flexDirection: "row", gap: 12 },
  composerIcon: {
    alignItems: "center",
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  composerTitleBlock: { flex: 1, gap: 3 },
  composerTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  composerSub: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  kindSwitch: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    padding: 3,
  },
  kindButton: {
    alignItems: "center",
    borderRadius: 999,
    flex: 1,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 10,
  },
  kindButtonText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  composerInput: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
    minHeight: 96,
    paddingHorizontal: 14,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  feedback: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  postButton: { alignItems: "center", borderRadius: 14, paddingVertical: 12 },
  postButtonText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  sectionHeader: { gap: 4, marginTop: 22, marginBottom: 12 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  sectionSub: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  stateBox: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    marginBottom: 12,
    padding: 20,
  },
  stateTitle: { fontFamily: "Inter_700Bold", fontSize: 15 },
  stateText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
  },
  feedCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    marginBottom: 12,
    padding: 16,
  },
  feedTopRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  feedIcon: {
    alignItems: "center",
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  feedTitleBlock: { flex: 1, gap: 2 },
  feedMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  feedType: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.8 },
  feedDate: { fontFamily: "Inter_400Regular", fontSize: 11 },
  feedAuthor: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  feedTitle: { fontFamily: "Inter_700Bold", fontSize: 17, letterSpacing: -0.2 },
  feedText: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21 },
  profileUpdateCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    padding: 14,
  },
  profileUpdateImageBlock: { gap: 10 },
  profileImagePreview: {
    borderRadius: 16,
    height: 220,
    overflow: "hidden",
    width: "100%",
  },
  profileImagePreviewImage: { height: "100%", width: "100%" },
  profileImagePlaceholder: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  profileUpdateBody: { flex: 1, gap: 2 },
  profileUpdateLabel: { fontFamily: "Inter_700Bold", fontSize: 14 },
  profileUpdateDesc: { fontFamily: "Inter_400Regular", fontSize: 12 },
  talkDiaryCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    padding: 14,
  },
  talkDiaryTopRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  talkDiaryIcon: {
    alignItems: "center",
    borderRadius: 14,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  talkDiaryTitleBlock: { flex: 1, gap: 2 },
  talkDiaryLabel: { fontFamily: "Inter_700Bold", fontSize: 13 },
  talkDiaryMood: { fontFamily: "Inter_500Medium", fontSize: 12 },
  talkDiaryBody: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    lineHeight: 21,
  },
  talkKeywordRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  talkKeywordPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  talkKeywordText: { fontFamily: "Inter_700Bold", fontSize: 11 },
  talkRewardRow: {
    borderRadius: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    padding: 10,
  },
  talkRewardText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  statusMessageBox: {
    alignItems: "flex-start",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    padding: 12,
  },
  statusMessageText: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    lineHeight: 20,
  },
  actionRow: { flexDirection: "row", gap: 8 },
  actionButton: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  commentCountPill: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  commentCountText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  commentsBox: { borderRadius: 14, gap: 8, padding: 12 },
  commentRow: { gap: 2 },
  commentAuthor: { fontFamily: "Inter_700Bold", fontSize: 12 },
  commentBody: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  commentInputRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  commentInput: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  commentSubmit: {
    alignItems: "center",
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
});
