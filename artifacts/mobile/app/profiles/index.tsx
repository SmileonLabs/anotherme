import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetMe } from "@workspace/api-client-react";
import { NeonBackdrop } from "@/components/NeonUI";
import {
  type CharacterProfileType,
  type CharacterProfileView,
  useCharacterProfiles,
} from "@/hooks/useCharacterProfiles";
import { useMediaUri } from "@/hooks/useMediaUri";
import { crossAlert } from "@/lib/crossAlert";

const FAN_FALLBACK = require("../../assets/images/home-v2/fan-character-scene.png");
const STAR_FALLBACK = require("../../assets/images/star-character-cutout.png");
type ProfileMode = Extract<CharacterProfileType, "fan" | "star">;

function ProfileRow({
  profile,
  accountProfileImageUrl,
  busy,
  onActivate,
  onEdit,
  onArchive,
}: {
  profile: CharacterProfileView;
  accountProfileImageUrl?: string | null;
  busy: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const characterImageUrl =
    profile.profileImageUrl &&
    profile.profileImageUrl !== accountProfileImageUrl
      ? profile.profileImageUrl
      : null;
  const imageUri = useMediaUri(characterImageUrl);
  const fallback = profile.type === "star" ? STAR_FALLBACK : FAN_FALLBACK;
  const usesFallback = !imageUri;
  const status =
    profile.status === "torimia"
      ? "토르미아"
      : profile.status === "locked"
        ? "사용 잠김"
        : profile.isActive
          ? "현재 사용 중"
          : "사용 가능";

  return (
    <View style={[styles.profileCard, profile.isActive && styles.profileCardActive]}>
      <View style={styles.profileMain}>
        <View style={[styles.avatarRing, profile.isActive && styles.avatarRingActive]}>
          <Image
            source={imageUri ? { uri: imageUri } : fallback}
            style={[
              styles.avatar,
              usesFallback && profile.type === "fan" && styles.fanAvatarFaceCrop,
            ]}
            contentFit="cover"
            contentPosition="top center"
          />
        </View>
        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={styles.profileName} numberOfLines={1}>{profile.displayName}</Text>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{profile.type.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.handle}>@{profile.handle}</Text>
          <Text style={styles.meta}>Lv.{profile.level} · {status}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          disabled={
            busy ||
            profile.isActive ||
            (profile.status !== "active" && profile.status !== "torimia")
          }
          onPress={onActivate}
          style={({ pressed }) => [
            styles.primaryAction,
            (busy ||
              profile.isActive ||
              (profile.status !== "active" && profile.status !== "torimia")) &&
              styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryActionText}>{profile.isActive ? "사용 중" : "이 프로필 사용"}</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={onEdit} style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}>
          <Feather name="edit-2" size={17} color="#C8B7E5" />
        </Pressable>
        <Pressable disabled={busy} onPress={onArchive} style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}>
          <Feather name="archive" size={17} color="#B4AABD" />
        </Pressable>
      </View>
    </View>
  );
}

export default function ProfilesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: me } = useGetMe();
  const {
    activeProfile,
    profiles,
    isLoading,
    isActivating,
    isArchiving,
    activateProfile,
    archiveProfile,
    refetch,
  } = useCharacterProfiles();
  const [mode, setMode] = React.useState<ProfileMode>(activeProfile?.type === "star" ? "star" : "fan");
  const [refreshing, setRefreshing] = React.useState(false);
  const busy = isActivating || isArchiving;
  const goBack = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)" as never);
  }, [router]);

  React.useEffect(() => {
    if (activeProfile?.type === "fan" || activeProfile?.type === "star") setMode(activeProfile.type);
  }, [activeProfile?.type]);

  const visibleProfiles = profiles.filter((profile) => profile.type === mode && profile.status !== "archived");
  const canAddFan =
    profiles.every((profile) => profile.type !== "fan") ||
    profiles.some(
      (profile) =>
        profile.type === "fan" &&
        (profile.status === "torimia" || profile.level >= 50),
    );
  const openCreation = () => {
    if (mode === "fan" && !canAddFan) {
      crossAlert(
        "FAN 추가 잠김",
        "기존 FAN이 토르미아 또는 Lv.50에 도달하면 새 FAN을 추가할 수 있어요. 기존 프로필은 변경되지 않습니다.",
      );
      return;
    }
    router.push((mode === "fan" ? "/profile/create-fan" : "/profiles/summon-star") as never);
  };
  const refresh = async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  };
  const activate = async (profile: CharacterProfileView) => {
    try { await activateProfile(profile.id); }
    catch { crossAlert("프로필 전환 실패", "현재 사용할 수 있는 프로필인지 확인해 주세요."); }
  };
  const archive = (profile: CharacterProfileView) => {
    crossAlert(
      "프로필 보관",
      `${profile.displayName} 프로필을 보관할까요?\n게시물과 채팅 기록은 삭제되지 않습니다.`,
      [
        {
          text: "보관",
          style: "destructive",
          onPress: () => void archiveProfile(profile.id).catch(() =>
            crossAlert("보관 실패", "마지막 프로필은 보관할 수 없어요."),
          ),
        },
        { text: "취소", style: "cancel" },
      ],
    );
  };

  return (
    <NeonBackdrop style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="홈으로 돌아가기"
          hitSlop={12}
          onPress={goBack}
        >
          <Feather name="arrow-left" size={29} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.title}>프로필 관리</Text>
        <View style={{ width: 29 }} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#9B57FF" />}
      >
        <Text style={styles.lead}>활동할 모드를 선택한 뒤, 그 모드 안에서 캐릭터 프로필을 전환하세요.</Text>
        <View style={styles.tabs}>
          {(["fan", "star"] as const).map((item) => (
            <Pressable key={item} onPress={() => setMode(item)} style={[styles.tab, mode === item && styles.tabActive]}>
              <Feather name={item === "fan" ? "heart" : "star"} size={17} color={mode === item ? "#FFFFFF" : "#837A90"} />
              <Text style={[styles.tabText, mode === item && styles.tabTextActive]}>{item.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>{mode.toUpperCase()} 프로필</Text>
            <Text style={styles.sectionSub}>
              {mode === "fan" ? "응원과 소셜 활동을 위한 독립 캐릭터" : "NFT 소유권으로 소환한 성장 캐릭터"}
            </Text>
          </View>
          <Pressable
            onPress={openCreation}
            style={({ pressed }) => [
              styles.addButton,
              mode === "fan" && !canAddFan && styles.addButtonLocked,
              pressed && styles.pressed,
            ]}
          >
            <Feather
              name={mode === "fan" && !canAddFan ? "lock" : "plus"}
              size={16}
              color="#FFFFFF"
            />
            <Text style={styles.addButtonText}>
              {mode === "fan"
                ? canAddFan
                  ? "FAN 추가"
                  : "추가 잠김"
                : "STAR 소환"}
            </Text>
          </Pressable>
        </View>
        {isLoading ? (
          <View style={styles.center}><ActivityIndicator color="#9B57FF" /></View>
        ) : visibleProfiles.length ? (
          <View style={styles.list}>
            {visibleProfiles.map((profile) => (
              <ProfileRow
                key={profile.id}
                profile={profile}
                accountProfileImageUrl={me?.profileImageUrl}
                busy={busy}
                onActivate={() => void activate(profile)}
                onEdit={() => router.push({ pathname: "/profile/edit", params: { profileId: profile.id } } as never)}
                onArchive={() => archive(profile)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Feather name={mode === "fan" ? "heart" : "star"} size={29} color="#8D43FF" />
            <Text style={styles.emptyTitle}>{mode.toUpperCase()} 프로필이 없어요</Text>
            <Text style={styles.emptyBody}>
              {mode === "fan"
                ? "새 FAN 캐릭터를 만들어 활동을 시작하세요."
                : "지갑을 연결하고 허용 NFT의 소유권을 확인하면 STAR를 소환할 수 있어요."}
            </Text>
          </View>
        )}
      </ScrollView>
    </NeonBackdrop>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#030309" },
  header: { minHeight: 62, paddingHorizontal: 18, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#FFFFFF", fontSize: 21, fontFamily: "Inter_700Bold" },
  content: { paddingHorizontal: 18, gap: 18 },
  lead: { color: "#A8A0B4", fontSize: 13, lineHeight: 20 },
  tabs: { padding: 4, borderRadius: 16, borderWidth: 1, borderColor: "#34234D", backgroundColor: "#090812", flexDirection: "row" },
  tab: { flex: 1, minHeight: 46, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  tabActive: { backgroundColor: "#6F31EE" },
  tabText: { color: "#837A90", fontFamily: "Inter_700Bold", fontSize: 14 },
  tabTextActive: { color: "#FFFFFF" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 18 },
  sectionSub: { color: "#8E879A", fontSize: 11, marginTop: 4 },
  addButton: { minHeight: 40, paddingHorizontal: 13, borderRadius: 12, backgroundColor: "#7838F4", flexDirection: "row", alignItems: "center", gap: 5 },
  addButtonLocked: { backgroundColor: "#3B3150" },
  addButtonText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 12 },
  list: { gap: 12 },
  profileCard: { padding: 14, borderRadius: 18, borderWidth: 1, borderColor: "#272032", backgroundColor: "#0B0A13", gap: 13 },
  profileCardActive: { borderColor: "#7E3CEB", backgroundColor: "#100B1D" },
  profileMain: { flexDirection: "row", alignItems: "center", gap: 13 },
  avatarRing: { width: 66, height: 66, borderRadius: 33, overflow: "hidden", borderWidth: 1, borderColor: "#493267", backgroundColor: "#05050A" },
  avatarRingActive: { borderColor: "#BB54FF", borderWidth: 2 },
  avatar: { width: "100%", height: "100%" },
  fanAvatarFaceCrop: {
    position: "absolute",
    width: "175%",
    height: "175%",
    left: "-37.5%",
    top: 0,
  },
  identity: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  profileName: { flexShrink: 1, color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 17 },
  typeBadge: { borderRadius: 7, backgroundColor: "#4C218C", paddingHorizontal: 7, paddingVertical: 3 },
  typeBadgeText: { color: "#E8D7FF", fontFamily: "Inter_700Bold", fontSize: 10 },
  handle: { color: "#B3A9C2", fontSize: 12, marginTop: 4 },
  meta: { color: "#8E839D", fontSize: 11, marginTop: 4 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  primaryAction: { flex: 1, minHeight: 40, borderRadius: 11, backgroundColor: "#6F31EE", alignItems: "center", justifyContent: "center" },
  primaryActionText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 12 },
  iconAction: { width: 40, height: 40, borderRadius: 11, borderWidth: 1, borderColor: "#342A43", alignItems: "center", justifyContent: "center" },
  center: { minHeight: 180, alignItems: "center", justifyContent: "center" },
  empty: { minHeight: 210, padding: 28, borderRadius: 20, borderWidth: 1, borderColor: "#2D2440", backgroundColor: "#0A0912", alignItems: "center", justifyContent: "center", gap: 9 },
  emptyTitle: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 16 },
  emptyBody: { color: "#968EA0", fontSize: 12, lineHeight: 18, textAlign: "center" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
