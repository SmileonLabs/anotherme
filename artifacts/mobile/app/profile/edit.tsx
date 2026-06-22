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
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useGetMe, useUpdateMe } from "@workspace/api-client-react";
import { crossAlert } from "@/lib/crossAlert";
import { uploadBlob } from "@/lib/uploadImage";
import { Avatar } from "@/components/Avatar";
import { ImageCropModal } from "@/components/ImageCropModal";
import { useColors } from "@/hooks/useColors";

export default function EditProfileScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: me, refetch } = useGetMe();
  const updateMe = useUpdateMe();

  const [nickname, setNickname] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  // undefined = unchanged, string = new object path, null = removed
  const [imagePath, setImagePath] = useState<string | null | undefined>(undefined);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (me) {
      setNickname(me.nickname);
      setStatusMessage(me.statusMessage ?? "");
    }
  }, [me]);

  const previewUri = imagePath !== undefined ? imagePath : me?.profileImageUrl;

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
    } catch {
      crossAlert("오류", "이미지를 불러오지 못했습니다");
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
    } catch {
      crossAlert("오류", "이미지 업로드에 실패했습니다");
    } finally {
      setUploading(false);
    }
  };

  const saving = uploading || updateMe.isPending;

  const handleSave = async () => {
    if (!nickname.trim()) {
      crossAlert("닉네임을 입력해주세요");
      return;
    }
    try {
      await updateMe.mutateAsync({
        data: {
          nickname: nickname.trim(),
          statusMessage: statusMessage.trim() || null,
          ...(imagePath !== undefined ? { profileImageUrl: imagePath } : {}),
        },
      });
      await refetch();
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
            <Avatar uri={previewUri} name={me?.nickname ?? "?"} size={90} />
            <View style={[styles.cameraBadge, { backgroundColor: colors.primary, borderColor: colors.background }]}>
              {uploading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="camera" size={16} color="#fff" />
              )}
            </View>
          </Pressable>
          <Pressable onPress={handlePickAvatar} disabled={uploading} hitSlop={8}>
            <Text style={[styles.changePhotoText, { color: colors.primary }]}>
              {uploading ? "업로드 중..." : "사진 변경"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.form}>
          <View>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>닉네임</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
              value={nickname}
              onChangeText={setNickname}
              placeholder="닉네임"
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
