import { CustomScrollView } from "@/components/CustomScroll";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useGetMe } from "@workspace/api-client-react";
import { crossAlert } from "@/lib/crossAlert";
import { ImageTooLargeError, uploadBlob } from "@/lib/uploadImage";
import { Avatar } from "@/components/Avatar";
import { ImageCropModal } from "@/components/ImageCropModal";
import { useColors } from "@/hooks/useColors";
import { profileHistoryQueryKey } from "@/hooks/useProfileHistory";
import { starFeedQueryKey } from "@/hooks/useStarFeed";
import { useCharacterProfiles } from "@/hooks/useCharacterProfiles";

export default function EditProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: me } = useGetMe();
  const { activeProfile, updateProfile, isUpdating } = useCharacterProfiles();

  const [nickname, setNickname] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  // undefined = unchanged, string = new object path, null = removed
  const [imagePath, setImagePath] = useState<string | null | undefined>(undefined);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (activeProfile) {
      setNickname(activeProfile.displayName);
      setStatusMessage(activeProfile.statusMessage ?? "");
    }
  }, [activeProfile]);

  const previewUri = imagePath !== undefined ? imagePath : activeProfile?.profileImageUrl;

  const handlePickAvatar = async () => {
    if (uploading) return;
    try {
      if (Platform.OS === "web") {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
        });
        if (result.canceled || !result.assets?.length) return;
        setCropUri(result.assets[0].uri);
        return;
      }

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        crossAlert("권한 필요", "사진 접근 권한을 허용해주세요");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      setUploading(true);
      const blob = await (await fetch(result.assets[0].uri)).blob();
      const path = await uploadBlob(blob);
      setImagePath(path);
    } catch (e) {
      if (e instanceof ImageTooLargeError) {
        crossAlert("사진 크기 초과", "사진 크기는 10MB를 초과할 수 없습니다.");
      } else {
        crossAlert("오류", "이미지를 불러오지 못했습니다");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleCropConfirm = async (blob: Blob) => {
    setUploading(true);
    try {
      const path = await uploadBlob(blob);
      setImagePath(path);
      setCropUri(null);
    } catch (e) {
      if (e instanceof ImageTooLargeError) {
        crossAlert("사진 크기 초과", "사진 크기는 10MB를 초과할 수 없습니다.");
      } else {
        crossAlert("오류", "이미지 업로드에 실패했습니다");
      }
    } finally {
      setUploading(false);
    }
  };

  const saving = uploading || isUpdating;

  const handleSave = async () => {
    if (!nickname.trim()) {
      crossAlert("닉네임을 입력해주세요");
      return;
    }
    if (!activeProfile) {
      crossAlert("오류", "활성 프로필을 불러오지 못했습니다.");
      return;
    }
    try {
      await updateProfile({
        profileId: activeProfile.id,
        displayName: nickname.trim(),
        statusMessage: statusMessage.trim() || null,
        ...(imagePath !== undefined ? { profileImageUrl: imagePath } : {}),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: starFeedQueryKey }),
        queryClient.invalidateQueries({ queryKey: profileHistoryQueryKey }),
      ]);
      router.back();
    } catch {
      crossAlert("오류", "저장에 실패했습니다");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <CustomScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.avatarSection}>
          <Pressable onPress={handlePickAvatar} disabled={uploading} style={styles.avatarPress}>
            <Avatar uri={previewUri} name={activeProfile?.displayName ?? "?"} size={90} />
            <View style={[styles.cameraBadge, { backgroundColor: colors.primary, borderColor: colors.background }]}>
              {uploading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="camera" size={16} color="#fff" />
              )}
            </View>
          </Pressable>
          <Pressable onPress={handlePickAvatar} disabled={uploading} hitSlop={8}>
            <Text style={[styles.changePhotoText, { color: colors.primary }]}>{uploading ? "업로드 중..." : "사진 변경"}</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/profile/history" as never)} hitSlop={8}>
            <Text style={[styles.historyLink, { color: colors.mutedForeground }]}>프로필 히스토리 보기</Text>
          </Pressable>
        </View>

        <View style={styles.form}>
          <View>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>활동 프로필 이름</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
              value={nickname}
              onChangeText={setNickname}
              placeholder="프로필 이름"
              placeholderTextColor={colors.mutedForeground}
              maxLength={30}
            />
          </View>
          <View>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>상태 메시지</Text>
            <TextInput
              style={[styles.input, styles.multiline, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
              value={statusMessage}
              onChangeText={setStatusMessage}
              placeholder="상태 메시지 (선택)"
              placeholderTextColor={colors.mutedForeground}
              maxLength={100}
              multiline
              numberOfLines={3}
            />
          </View>
          <View>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>이메일</Text>
            <View style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, justifyContent: "center" }]}>
              <Text style={[styles.disabledText, { color: colors.mutedForeground }]}>{me?.email ?? ""}</Text>
            </View>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: colors.primary, opacity: saving || pressed ? 0.8 : 1 },
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.saveBtnText, { color: "#fff" }]}>저장</Text>
          )}
        </Pressable>
      </CustomScrollView>

      <ImageCropModal
        imageUri={cropUri}
        onCancel={() => setCropUri(null)}
        onConfirm={handleCropConfirm}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  avatarSection: { alignItems: "center", paddingVertical: 28, gap: 12 },
  avatarPress: { position: "relative" },
  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  changePhotoText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  historyLink: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  form: { paddingHorizontal: 20, gap: 20 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  input: { height: 52, borderRadius: 12, paddingHorizontal: 16, fontSize: 15, fontFamily: "Inter_400Regular", borderWidth: 1 },
  multiline: { height: 90, paddingTop: 14, textAlignVertical: "top" },
  disabledText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  saveBtn: {
    marginHorizontal: 20,
    marginTop: 32,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
