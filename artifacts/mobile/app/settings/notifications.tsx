import React from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { crossAlert } from "@/lib/crossAlert";
import { useGetMe, useUpdateMe, useRegisterPushToken } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import {
  getWebPushState,
  subscribeWebPush,
  webPushSupported,
  type WebPushState,
} from "@/lib/webPush";

export default function NotificationsScreen() {
  const colors = useColors();
  const { data: me, refetch } = useGetMe();
  const updateMe = useUpdateMe();
  const registerPushToken = useRegisterPushToken();
  const [pushState, setPushState] = React.useState<WebPushState | null>(null);

  const refreshPushState = React.useCallback(async () => {
    if (!webPushSupported) {
      setPushState(null);
      return;
    }
    setPushState(await getWebPushState());
  }, []);

  React.useEffect(() => {
    void refreshPushState();
  }, [refreshPushState]);

  const enablePush = React.useCallback(async () => {
    const result = await subscribeWebPush((token) =>
      registerPushToken.mutateAsync({ data: { token } }),
    );
    await refreshPushState();
    if (result !== "granted") {
      crossAlert(
        "알림 권한 필요",
        result === "denied"
          ? "브라우저에서 알림이 차단되어 있습니다. 주소창의 자물쇠 아이콘 → 알림을 '허용'으로 바꾼 뒤 다시 시도해 주세요."
          : "이 브라우저에서는 푸시 알림을 사용할 수 없습니다.",
      );
      return false;
    }
    return true;
  }, [registerPushToken, refreshPushState]);

  const handleToggle = async (value: boolean) => {
    try {
      // On web, secure the push subscription BEFORE persisting "enabled" so the
      // stored flag never claims notifications are on without a usable subscription.
      if (value && webPushSupported) {
        const ok = await enablePush();
        if (!ok) {
          await refetch();
          return;
        }
      }
      await updateMe.mutateAsync({ data: { notificationEnabled: value } });
      await refetch();
    } catch {
      await refetch();
      crossAlert("오류", "설정 변경에 실패했습니다");
    }
  };

  const enabled = me?.notificationEnabled ?? true;
  // True push delivery (sound while the window is minimized/closed) requires an
  // actual browser subscription — not just the stored flag.
  const pushActive = pushState?.supported && pushState.subscribed;
  const needsAttention =
    webPushSupported && enabled && pushState != null && !pushActive;

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <View style={[styles.section, { backgroundColor: colors.background }]}>
        <View style={[styles.row, { borderBottomColor: colors.border }]}>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>푸시 알림</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
              새 메시지 및 친구 요청 알림을 받습니다
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {needsAttention && (
        <View style={[styles.section, { backgroundColor: colors.background }]}>
          <View style={styles.notice}>
            <Text style={[styles.noticeTitle, { color: colors.foreground }]}>
              알림이 아직 활성화되지 않았어요
            </Text>
            <Text style={[styles.noticeBody, { color: colors.mutedForeground }]}>
              {pushState?.permission === "denied"
                ? "브라우저에서 알림이 차단되어 있어, 창을 내려놓으면 소리가 울리지 않습니다. 주소창의 자물쇠 아이콘에서 알림을 '허용'으로 바꿔 주세요."
                : "이 기기에서 푸시 구독이 등록되지 않았습니다. 아래 버튼을 눌러 활성화하면 앱을 내려놓아도 알림 소리가 울립니다."}
            </Text>
            <Pressable
              onPress={enablePush}
              style={[styles.button, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.buttonText}>알림 활성화</Text>
            </Pressable>
          </View>
        </View>
      )}

      {webPushSupported && pushActive && (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          이 기기에서 푸시 알림이 활성화되어 있습니다. 앱을 내려놓아도 새 메시지 알림이
          소리와 함께 표시됩니다.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { marginTop: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowInfo: { flex: 1, marginRight: 12, gap: 2 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  notice: { padding: 16, gap: 8 },
  noticeTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  noticeBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  button: {
    marginTop: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  buttonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_500Medium" },
  hint: {
    marginTop: 16,
    paddingHorizontal: 16,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
