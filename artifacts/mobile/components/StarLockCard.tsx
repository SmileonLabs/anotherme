import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { gradients, gradientsDark } from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { usePlayMode } from "@/hooks/usePlayMode";
import { useThemeMode } from "@/hooks/useThemeMode";
import { useWalletVerification, type WalletChallenge } from "@/hooks/useWalletVerification";
import { useNftCollections } from "@/hooks/useNftCollections";

function errorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: unknown } }).data;
    if (typeof data?.message === "string") return data.message;
  }
  return fallback;
}

export function StarLockCard({ onConnect }: { onConnect?: () => void }) {
  const colors = useColors();
  const { scheme } = useThemeMode();
  const isDark = scheme === "dark";
  const { starUnlocked, equippedStar } = usePlayMode();
  const { data: collections = [] } = useNftCollections();
  const {
    status,
    createChallenge,
    verifyWallet,
    refreshWallet,
    equipStar,
    isCreatingChallenge,
    isVerifying,
    isRefreshing,
    isEquipping,
  } = useWalletVerification();
  const [walletAddress, setWalletAddress] = useState(status?.walletAddress ?? "");
  const [tokenId, setTokenId] = useState(equippedStar?.tokenId ?? "");
  const [signature, setSignature] = useState("");
  const [challenge, setChallenge] = useState<WalletChallenge | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | undefined>(equippedStar?.collectionId ?? undefined);

  useEffect(() => {
    if (!walletAddress && status?.walletAddress) setWalletAddress(status.walletAddress);
  }, [status?.walletAddress, walletAddress]);

  const canCreateChallenge = walletAddress.trim().length > 0 && !isCreatingChallenge;
  const canVerify = Boolean(challenge && signature.trim().length > 0 && !isVerifying);
  const canEquip = tokenId.trim().length > 0 && !isEquipping && status?.nftConfigured !== false;
  const title = equippedStar
    ? `${equippedStar.displayName} 장착 완료`
    : starUnlocked
      ? "장착할 STAR NFT를 선택해 주세요"
      : "STAR 모드는 STAR NFT 보유자 전용";

  async function requestChallenge() {
    const address = walletAddress.trim();
    if (!address) return;
    onConnect?.();
    setFeedback(null);
    try {
      const next = await createChallenge(address);
      setChallenge(next);
      setSignature("");
      setFeedback("아래 메시지를 지갑 앱에서 서명한 뒤, 서명값을 붙여넣어 주세요.");
    } catch (err) {
      setFeedback(errorMessage(err, "인증 메시지를 만들지 못했어요."));
    }
  }

  async function copyChallenge() {
    if (!challenge) return;
    await Clipboard.setStringAsync(challenge.message);
    setFeedback("인증 메시지를 복사했어요.");
  }

  async function submitSignature() {
    if (!challenge) return;
    const trimmed = signature.trim();
    if (!trimmed) return;
    setFeedback(null);
    try {
      const result = await verifyWallet({
        walletAddress: challenge.walletAddress,
        challengeId: challenge.id,
        signature: trimmed,
      });
      if (result.nftOwned) {
        setFeedback("NFT 보유가 확인됐어요. 장착할 NFT 번호를 입력해 주세요.");
      } else if (result.configMissing) {
        setFeedback("NFT 컨트랙트 설정 전이라 지갑 인증만 완료됐어요.");
      } else {
        setFeedback("지갑 인증은 완료됐지만 STAR NFT 보유가 확인되지 않았어요.");
      }
    } catch (err) {
      setFeedback(errorMessage(err, "서명을 검증하지 못했어요."));
    }
  }

  async function refreshNft() {
    setFeedback(null);
    try {
      const result = await refreshWallet();
      setFeedback(
        result.nftOwned
          ? "NFT 보유가 확인됐어요. 장착할 NFT 번호를 입력해 주세요."
          : "아직 STAR NFT 보유가 확인되지 않았어요.",
      );
    } catch (err) {
      setFeedback(errorMessage(err, "NFT 보유 여부를 다시 확인하지 못했어요."));
    }
  }

  async function submitEquip() {
    const value = tokenId.trim();
    if (!value) return;
    setFeedback(null);
    try {
      const result = await equipStar(value, selectedCollectionId);
      setFeedback(`${result.equippedStar.displayName} NFT를 장착했어요.`);
    } catch (err) {
      setFeedback(errorMessage(err, "NFT를 장착하지 못했어요."));
    }
  }

  return (
    <LinearGradient
      colors={(isDark ? gradientsDark : gradients).soft}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={[styles.icon, { backgroundColor: colors.background }]}>
        <Feather name="lock" size={22} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        FAN으로 채팅과 토크배틀을 즐기면서, STAR NFT를 인증하고 장착하면 해당 캐릭터의 피드와 육성이 열립니다.
      </Text>

      {equippedStar ? (
        <View style={[styles.notice, { backgroundColor: colors.background }]}>
          <Feather name="check-circle" size={15} color={colors.primary} />
          <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
            token #{equippedStar.tokenId} · Lv.{equippedStar.level} · {equippedStar.displayName}
          </Text>
        </View>
      ) : null}

      {status?.nftConfigured === false ? (
        <View style={[styles.notice, { backgroundColor: colors.background }]}>
          <Feather name="info" size={15} color={colors.primary} />
          <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
            운영 NFT 컨트랙트 설정 전이라 현재는 지갑 서명 인증까지만 진행됩니다.
          </Text>
        </View>
      ) : null}

      <TextInput
        value={walletAddress}
        onChangeText={setWalletAddress}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="0x 지갑 주소"
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground },
        ]}
      />

      <Pressable
        disabled={!canCreateChallenge}
        onPress={requestChallenge}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.primary, opacity: pressed ? 0.85 : canCreateChallenge ? 1 : 0.45 },
        ]}
      >
        <Feather name="link" size={16} color={colors.primaryForeground} />
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
          {isCreatingChallenge ? "인증 메시지 생성 중" : "지갑 인증 메시지 만들기"}
        </Text>
      </Pressable>

      {challenge ? (
        <View style={styles.challengeBlock}>
          <Text style={[styles.label, { color: colors.foreground }]}>서명할 메시지</Text>
          <Text style={[styles.challengeText, { backgroundColor: colors.background, color: colors.mutedForeground }]}>
            {challenge.message}
          </Text>
          <Pressable
            onPress={copyChallenge}
            style={[styles.secondaryButton, { backgroundColor: colors.secondary }]}
          >
            <Feather name="copy" size={15} color={colors.primary} />
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>메시지 복사</Text>
          </Pressable>
          <TextInput
            value={signature}
            onChangeText={setSignature}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            placeholder="지갑 서명값 붙여넣기"
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.signatureInput,
              { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground },
            ]}
          />
          <Pressable
            disabled={!canVerify}
            onPress={submitSignature}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : canVerify ? 1 : 0.45 },
            ]}
          >
            <Feather name="check-circle" size={16} color={colors.primaryForeground} />
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
              {isVerifying ? "검증 중" : "서명 검증하고 STAR 열기"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {status?.walletVerified ? (
        <Pressable
          disabled={isRefreshing}
          onPress={refreshNft}
          style={[styles.secondaryButton, { backgroundColor: colors.secondary, opacity: isRefreshing ? 0.5 : 1 }]}
        >
          <Feather name="refresh-cw" size={15} color={colors.primary} />
          <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
            {isRefreshing ? "다시 확인 중" : "NFT 보유 다시 확인"}
          </Text>
        </Pressable>
      ) : null}

      {starUnlocked && !equippedStar ? (
        <View style={styles.challengeBlock}>
          {collections.length > 0 ? (
            <View style={styles.collectionPicker}>
              <Text style={[styles.label, { color: colors.foreground }]}>소환할 NFT 컬렉션</Text>
              <View style={styles.collectionList}>
                {collections.map((collection) => {
                  const selected = selectedCollectionId === collection.id;
                  return (
                    <Pressable key={collection.id} onPress={() => setSelectedCollectionId(collection.id)} style={[styles.collectionChip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + "18" : colors.background }]}>
                      <Text style={[styles.collectionChipText, { color: selected ? colors.primary : colors.foreground }]}>{collection.ipName}</Text>
                      <Text style={[styles.collectionChipMeta, { color: colors.mutedForeground }]}>{collection.category}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          <Text style={[styles.label, { color: colors.foreground }]}>장착할 NFT 번호</Text>
          <TextInput
            value={tokenId}
            onChangeText={setTokenId}
            keyboardType="number-pad"
            placeholder="예: 1"
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.input,
              { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground },
            ]}
          />
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            token #1은 기본적으로 비비로 매핑됩니다. 다른 번호는 STAR #번호로 표시되고, 운영 매핑이 있으면 해당 이름을 사용합니다.
          </Text>
          <Pressable
            disabled={!canEquip}
            onPress={submitEquip}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : canEquip ? 1 : 0.45 },
            ]}
          >
            <Feather name="box" size={16} color={colors.primaryForeground} />
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
              {isEquipping ? "장착 확인 중" : "NFT 장착하기"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {feedback ? <Text style={[styles.feedback, { color: colors.foreground }]}>{feedback}</Text> : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, padding: 20, gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Inter_700Bold", fontSize: 20, letterSpacing: -0.4 },
  body: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21 },
  notice: { alignItems: "flex-start", borderRadius: 14, flexDirection: "row", gap: 8, padding: 12 },
  noticeText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  input: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  button: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  buttonText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  challengeBlock: { gap: 10 },
  collectionPicker: { gap: 8 },
  collectionList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  collectionChip: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 8 },
  collectionChipText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  collectionChipMeta: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 2 },
  label: { fontFamily: "Inter_700Bold", fontSize: 13 },
  challengeText: { borderRadius: 14, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, padding: 12 },
  secondaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryButtonText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  signatureInput: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
    minHeight: 84,
    paddingHorizontal: 12,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  feedback: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 17 },
});
