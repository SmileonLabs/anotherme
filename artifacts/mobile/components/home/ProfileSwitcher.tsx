import type { CharacterProfileView } from "@/hooks/useCharacterProfiles";
import { Avatar } from "@/components/Avatar";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface ProfileSwitcherProps {
  visible: boolean;
  profiles: CharacterProfileView[];
  profileType: "fan" | "star";
  activeProfileId: string | null;
  switchingProfileId: string | null;
  topInset: number;
  onClose: () => void;
  onSelect: (profile: CharacterProfileView) => void;
  onAdd: () => void;
  onManage: () => void;
}

export function ProfileSwitcher({
  visible,
  profiles,
  profileType,
  activeProfileId,
  switchingProfileId,
  topInset,
  onClose,
  onSelect,
  onAdd,
  onManage,
}: ProfileSwitcherProps) {
  const availableProfiles = profiles.filter(
    (profile) => profile.status !== "archived" && profile.type === profileType,
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="프로필 전환 닫기"
        style={styles.dismissLayer}
        onPress={onClose}
      >
        <View
          pointerEvents="box-none"
          style={[styles.anchor, { paddingTop: Math.max(topInset, 8) + 66 }]}
        >
          <Pressable
            accessibilityRole="menu"
            style={styles.popover}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.pointer} />
            {availableProfiles.length > 0 ? (
              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={availableProfiles.length > 4}
              >
                {availableProfiles.map((profile, index) => (
                  <ProfileSwitcherRow
                    key={profile.id}
                    profile={profile}
                    isActive={profile.id === activeProfileId}
                    isSwitching={profile.id === switchingProfileId}
                    disabled={
                      switchingProfileId !== null ||
                      (profile.status !== "active" && profile.status !== "torimia")
                    }
                    showDivider={index < availableProfiles.length - 1}
                    onPress={() => onSelect(profile)}
                  />
                ))}
              </ScrollView>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>사용할 수 있는 프로필이 없어요.</Text>
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              onPress={onAdd}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            >
              <Feather name="plus-circle" size={16} color="#C99AFF" />
              <Text style={styles.addText}>
                {profileType === "fan" ? "새 FAN 추가" : "NFT로 STAR 소환"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onManage}
              style={({ pressed }) => [styles.manageButton, pressed && styles.pressed]}
            >
              <Feather name="settings" size={15} color="#B997FF" />
              <Text style={styles.manageText}>프로필 관리</Text>
              <Feather name="chevron-right" size={16} color="#8E849E" />
            </Pressable>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function ProfileSwitcherRow({
  profile,
  isActive,
  isSwitching,
  disabled,
  showDivider,
  onPress,
}: {
  profile: CharacterProfileView;
  isActive: boolean;
  isSwitching: boolean;
  disabled: boolean;
  showDivider: boolean;
  onPress: () => void;
}) {
  const buttonLabel =
    profile.status === "active" || profile.status === "torimia" ? "바꾸기" : "잠김";

  return (
    <View style={[styles.row, showDivider && styles.rowDivider]}>
      <View style={styles.rowIdentity}>
        <View style={[styles.rowAvatarRing, isActive && styles.rowAvatarRingActive]}>
          <Avatar
            uri={profile.profileImageUrl}
            name={profile.displayName}
            size={50}
            crop="face"
            characterType={profile.type}
          />
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.rowName} numberOfLines={1}>
            {profile.displayName}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="menuitem"
        accessibilityLabel={`${profile.displayName} 프로필 ${buttonLabel}`}
        accessibilityState={{ selected: isActive, disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.switchButton,
          isActive && styles.activeButton,
          disabled && !isActive && styles.disabledButton,
          pressed && styles.pressed,
        ]}
      >
        {isSwitching ? (
          <ActivityIndicator size="small" color="#DCC8FF" />
        ) : (
          <Text style={styles.switchText}>{buttonLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  dismissLayer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  anchor: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: 15,
    alignItems: "flex-end",
  },
  popover: {
    width: 310,
    maxWidth: "92%",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(133,113,169,0.50)",
    backgroundColor: "#11101A",
    paddingHorizontal: 17,
    paddingVertical: 6,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.46,
    shadowRadius: 20,
    elevation: 18,
  },
  pointer: {
    position: "absolute",
    right: 27,
    top: -8,
    width: 16,
    height: 16,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: "rgba(133,113,169,0.50)",
    backgroundColor: "#11101A",
    transform: [{ rotate: "45deg" }],
  },
  list: { maxHeight: 302 },
  listContent: { paddingBottom: 2 },
  row: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(157,147,174,0.22)",
  },
  rowIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  rowAvatarRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    padding: 1.5,
    borderWidth: 1,
    borderColor: "rgba(146,91,230,0.66)",
    backgroundColor: "#08070D",
    overflow: "hidden",
  },
  rowAvatarRingActive: {
    borderColor: "#C94CFF",
    shadowColor: "#9F39FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
  },
  rowAvatarFaceCrop: {
    position: "absolute",
    width: "170%",
    height: "170%",
    left: "-35%",
    top: 0,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  rowName: {
    color: "#F4F0F6",
    fontFamily: "Inter_500Medium",
    fontSize: 16,
  },
  rowMeta: {
    color: "#8F8899",
    fontFamily: "Inter_400Regular",
    fontSize: 10.5,
  },
  switchButton: {
    minWidth: 67,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(164,86,237,0.72)",
    backgroundColor: "rgba(70,33,99,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  activeButton: {
    borderColor: "rgba(101,92,119,0.40)",
    backgroundColor: "rgba(73,67,84,0.30)",
  },
  disabledButton: { opacity: 0.45 },
  switchText: {
    color: "#D7B6F8",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  activeText: { color: "#9991A3" },
  empty: { height: 88, alignItems: "center", justifyContent: "center" },
  emptyText: {
    color: "#AAA3B1",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  manageButton: {
    height: 44,
    marginHorizontal: -17,
    paddingHorizontal: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(157,147,174,0.22)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  addButton: {
    height: 44,
    marginHorizontal: -17,
    paddingHorizontal: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(157,147,174,0.22)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  addText: {
    color: "#D8BFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  manageText: {
    color: "#BDB5C6",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  pressed: { opacity: 0.72 },
});
