import { CustomScrollView } from "@/components/CustomScroll";
import { useSignIn } from "@clerk/expo";
import { useRouter, type Href } from "expo-router";
import React, { useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function ForgotPasswordScreen() {
  const { signIn } = useSignIn();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const getErrorMessage = (error: any) =>
    error?.longMessage ?? error?.message ?? error?.errors?.[0]?.longMessage ?? error?.errors?.[0]?.message ?? "오류가 발생했습니다";

  const finalizeReset = async () => {
    const { error } = await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) return;
        const url = decorateUrl("/");
        if (url.startsWith("http")) {
          if (typeof window !== "undefined") window.location.href = url;
        } else {
          router.replace(url as Href);
        }
      },
    });
    if (error) setErrorMsg(getErrorMessage(error));
  };

  const handleSendCode = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      await signIn.reset();
      const createResult = await signIn.create({ identifier: email.trim() });
      if (createResult.error) {
        setErrorMsg(getErrorMessage(createResult.error));
        return;
      }
      const sendResult = await signIn.resetPasswordEmailCode.sendCode();
      if (sendResult.error) {
        setErrorMsg(getErrorMessage(sendResult.error));
        return;
      }
      setStep("code");
    } catch (e: any) {
      setErrorMsg(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const verifyResult = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (verifyResult.error) {
        setErrorMsg(getErrorMessage(verifyResult.error));
        return;
      }
      const submitResult = await signIn.resetPasswordEmailCode.submitPassword({ password: newPassword });
      if (submitResult.error) {
        setErrorMsg(getErrorMessage(submitResult.error));
        return;
      }
      await finalizeReset();
    } catch (e: any) {
      setErrorMsg(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <CustomScrollView
        contentContainerStyle={[
          styles.container,
          { backgroundColor: colors.background, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.foreground }]}>비밀번호 재설정</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {step === "email"
            ? "가입한 이메일 주소를 입력하면 인증 코드를 보내드립니다"
            : "이메일로 받은 코드와 새 비밀번호를 입력하세요"}
        </Text>

        {step === "email" ? (
          <View style={styles.form}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
              value={email}
              onChangeText={setEmail}
              placeholder="이메일 주소"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {errorMsg ? <Text style={[styles.error, { color: colors.destructive }]}>{errorMsg}</Text> : null}
            <Pressable
              style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: !email.trim() || loading || pressed ? 0.7 : 1 }]}
              onPress={handleSendCode}
              disabled={!email.trim() || loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>코드 전송</Text>}
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
              value={code}
              onChangeText={setCode}
              placeholder="인증 코드"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              autoFocus
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="새 비밀번호"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
            />
            {errorMsg ? <Text style={[styles.error, { color: colors.destructive }]}>{errorMsg}</Text> : null}
            <Pressable
              style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: !code.trim() || !newPassword || loading || pressed ? 0.7 : 1 }]}
              onPress={handleReset}
              disabled={!code.trim() || !newPassword || loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>비밀번호 변경</Text>}
            </Pressable>
          </View>
        )}

        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: colors.mutedForeground }]}>뒤로 가기</Text>
        </Pressable>
      </CustomScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, gap: 24 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  form: { gap: 16 },
  input: { height: 52, borderRadius: 12, paddingHorizontal: 16, fontSize: 15, fontFamily: "Inter_400Regular", borderWidth: 1 },
  error: { fontSize: 12, fontFamily: "Inter_400Regular" },
  button: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  back: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
