import { CustomScrollView } from "@/components/CustomScroll";
import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetMe } from "@workspace/api-client-react";
import { crossAlert } from "@/lib/crossAlert";
import { Avatar } from "@/components/Avatar";
import { useColors } from "@/hooks/useColors";
import { useThemeMode, type ThemeMode } from "@/hooks/useThemeMode";
import { gradients, gradientsDark } from "@/constants/colors";

const THEME_OPTIONS: { key: ThemeMode; label: string; icon: string }[] = [
  { key: "light", label: "라이트", icon: "sun" },
  { key: "dark", label: "다크", icon: "moon" },
  { key: "system", label: "시스템", icon: "smartphone" },
];

function ThemeSelector() {
  const colors = useColors();
  const { mode, setMode } = useThemeMode();
  return (
    <View style={[styles.segment, { backgroundColor: colors.muted }]}>
      {THEME_OPTIONS.map((opt) => {
        const active = mode === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => setMode(opt.key)}
            style={[
              styles.segmentItem,
              active && { backgroundColor: colors.background },
            ]}
          >
            <Feather
              name={opt.icon as any}
              size={16}
              color={active ? colors.primary : colors.mutedForeground}
            />
            <Text
              style={[
                styles.segmentLabel,
                { color: active ? colors.foreground : colors.mutedForeground },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SettingsRow({
  icon,
  label,
  sublabel,
  onPress,
  destructive,
  last,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
  destructive?: boolean;
  last?: boolean;
}) {
  const colors = useColors();
  const tint = destructive ? colors.destructive : colors.primary;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        {
          opacity: pressed ? 0.6 : 1,
          borderBottomColor: colors.border,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.rowIcon,
          { backgroundColor: destructive ? colors.destructiveMuted : colors.accent },
        ]}
      >
        <Feather name={icon as any} size={18} color={tint} />
      </View>
      <View style={styles.rowText}>
        <Text
          style={[
            styles.rowLabel,
            { color: destructive ? colors.destructive : colors.foreground },
          ]}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sublabel}</Text>
        ) : null}
      </View>
      {!destructive ? (
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      ) : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const { scheme } = useThemeMode();
  const insets = useSafeAreaInsets();
  const { data: me } = useGetMe();

  const handleLogout = () => {
    crossAlert("로그아웃", "정말 로그아웃하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "로그아웃", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.muted },
        ]}
      >
        <Pressable
          accessibilityLabel="뒤로"
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Feather name="chevron-left" size={26} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>설정</Text>
      </View>

      <CustomScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        {/* Profile card */}
        <Pressable
          onPress={() => router.push("/profile/edit")}
          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
        >
          <LinearGradient
            colors={(scheme === "dark" ? gradientsDark : gradients).soft}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.profile}
          >
            <Avatar uri={me?.profileImageUrl} name={me?.nickname ?? "?"} size={60} />
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.foreground }]} numberOfLines={1}>
                {me?.nickname ?? "내 프로필"}
              </Text>
              <Text style={[styles.profileEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
                {me?.email ?? ""}
              </Text>
              {me?.statusMessage ? (
                <Text style={[styles.profileStatus, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {me.statusMessage}
                </Text>
              ) : null}
            </View>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
          </LinearGradient>
        </Pressable>

        {/* Display section */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>화면</Text>
        <ThemeSelector />

        {/* Another Me section */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>어나더 미</Text>
        <View style={[styles.section, { backgroundColor: colors.background }]}>
          <SettingsRow
            icon="user"
            label="어나더 미"
            sublabel="내 또 다른 자아의 성장 보기"
            onPress={() => router.push("/persona")}
            last
          />
        </View>

        {/* Account section */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>계정</Text>
        <View style={[styles.section, { backgroundColor: colors.background }]}>
          <SettingsRow
            icon="bell"
            label="알림"
            sublabel="메시지 및 알림 설정"
            onPress={() => router.push("/settings/notifications")}
          />
          <SettingsRow
            icon="slash"
            label="차단한 사용자"
            sublabel="차단 목록 관리"
            onPress={() => router.push("/settings/blocked")}
          />
          <SettingsRow
            icon="share-2"
            label="초대 링크 만들기"
            sublabel="친구를 초대해보세요"
            onPress={() => router.push("/friends/add")}
            last
          />
        </View>

        <View style={[styles.section, { backgroundColor: colors.background, marginTop: 16 }]}>
          <SettingsRow icon="log-out" label="로그아웃" onPress={handleLogout} destructive last />
        </View>
      </CustomScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  backBtn: { padding: 6, marginLeft: -6 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    marginHorizontal: 16,
    borderRadius: 18,
  },
  profileInfo: { flex: 1, gap: 2 },
  profileName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  profileEmail: { fontSize: 13, fontFamily: "Inter_400Regular" },
  profileStatus: { fontSize: 13, fontFamily: "Inter_400Regular" },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  section: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  segment: {
    flexDirection: "row",
    gap: 4,
    marginHorizontal: 16,
    padding: 4,
    borderRadius: 14,
  },
  segmentItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 11,
  },
  segmentLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
