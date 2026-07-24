import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { gradients, gradientsDark } from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { usePlayMode } from "@/hooks/usePlayMode";
import { useThemeMode } from "@/hooks/useThemeMode";
import { useWalletVerification, type WalletChallenge } from "@/hooks/useWalletVerification";
import { useNftCollections } from "@/hooks/useNftCollections";
import { useWalletConnection } from "@/lib/walletConnection";

function errorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: unknown } }).data;
    if (typeof data?.message === "string") return data.message;
  }
  if (err instanceof Error) {
    if (err.message === "wallet_connection_pending") return "지갑을 선택한 뒤 이 화면으로 돌아와 주세요.";
    if (err.message === "wallet_app_required") return "연결 가능한 지갑 앱이 없어요. 수동 인증을 이용해 주세요.";
    if (err.message === "wallet_not_connected") return "지갑 연결을 완료해 주세요.";
    if (/reject|denied|cancel/i.test(err.message)) return "지갑에서 서명이 취소됐어요.";
  }
  return fallback;
}

export function StarLockCard({
  onConnect,
  onSummoned,
}: {
  onConnect?: () => void;
  onSummoned?: (profileId: string) => void;
}) {
  const colors = useColors();
  const { scheme } = useThemeMode();
  const isDark = scheme === "dark";
  const { starUnlocked, equippedStar } = usePlayMode();
  const { data: collections = [] } = useNftCollections();
  const walletConnection = useWalletConnection();
  const {
    status,
    inventory,
    createChallenge,
    verifyWallet,
    refreshWallet,
    equipStar,
    isCreatingChallenge,
    isVerifying,
    isRefreshing,
    isEquipping,
    isLoadingInventory,
  } = useWalletVerification();
  const [walletAddress, setWalletAddress] = useState(status?.walletAddress ?? "");
  const [tokenId, setTokenId] = useState(equippedStar?.tokenId ?? "");
  const [signature, setSignature] = useState("");
  const [challenge, setChallenge] = useState<WalletChallenge | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | undefined>(equippedStar?.collectionId ?? undefined);
  const [showManual, setShowManual] = useState(false);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [awaitingWallet, setAwaitingWallet] = useState(false);

  useEffect(() => {
    if (!walletAddress && status?.walletAddress) setWalletAddress(status.walletAddress);
  }, [status?.walletAddress, walletAddress]);
  useEffect(() => {
    if (walletConnection.address) setWalletAddress(walletConnection.address);
  }, [walletConnection.address]);
  useEffect(() => {
    if (!awaitingWallet || !walletConnection.address) return;
    setAwaitingWallet(false);
    void verifyConnectedWallet(walletConnection.address);
  }, [awaitingWallet, walletConnection.address]);
  useEffect(() => {
    if (!challenge) {
      setExpiresIn(null);
      return;
    }
    const update = () =>
      setExpiresIn(Math.max(0, Math.ceil((new Date(challenge.expiresAt).getTime() - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  const canCreateChallenge = walletAddress.trim().length > 0 && !isCreatingChallenge;
  const canVerify = Boolean(challenge && signature.trim().length > 0 && !isVerifying);
  const canEquip = tokenId.trim().length > 0 && !isEquipping && Boolean(selectedCollectionId);
  const title = equippedStar
    ? "새 NFT로 STAR 추가 소환"
    : starUnlocked
      ? "장착할 STAR NFT를 선택해 주세요"
      : "STAR 모드는 STAR NFT 보유자 전용";

  async function requestChallenge() {
    const address = walletAddress.trim();
    if (!address) return;
    onConnect?.();
    setFeedback(null);
    try {
      const next = await createChallenge(address, walletConnection.chainId ?? undefined);
      setChallenge(next);
      setSignature("");
      setFeedback("아래 메시지를 지갑 앱에서 서명한 뒤, 서명값을 붙여넣어 주세요.");
    } catch (err) {
      setFeedback(errorMessage(err, "인증 메시지를 만들지 못했어요."));
    }
  }

  async function verifyConnectedWallet(address: string) {
    try {
      const next = await createChallenge(address, walletConnection.chainId ?? undefined);
      setChallenge(next);
      const signed = await walletConnection.signMessage(next.message, address);
      setSignature(signed);
      const result = await verifyWallet({
        walletAddress: next.walletAddress,
        challengeId: next.id,
        signature: signed,
      });
      setFeedback(
        result.nftOwned
          ? "지갑과 허용 NFT 소유권을 확인했어요. 소환할 캐릭터를 선택해 주세요."
          : "지갑 인증은 완료됐어요. 현재 장착 가능한 NFT는 확인되지 않았어요.",
      );
    } catch (err) {
      setFeedback(errorMessage(err, "지갑 연결 또는 서명을 완료하지 못했어요."));
    }
  }

  async function authenticateWithWallet() {
    onConnect?.();
    setFeedback(null);
    if (walletConnection.address) {
      await verifyConnectedWallet(walletConnection.address);
      return;
    }
    setAwaitingWallet(true);
    try {
      const address = await walletConnection.connect();
      setAwaitingWallet(false);
      await verifyConnectedWallet(address);
    } catch (err) {
      if (err instanceof Error && err.message === "wallet_connection_pending") {
        setFeedback("지갑을 선택하면 서명 요청이 자동으로 이어집니다.");
        return;
      }
      setAwaitingWallet(false);
      setFeedback(errorMessage(err, "지갑 연결을 완료하지 못했어요."));
    }
  }

  async function copyChallenge() {
    if (!challenge) return;
    await Clipboard.setStringAsync(challenge.message);
    setFeedback("인증 메시지를 복사했어요.");
  }

  async function pasteSignature() {
    const value = await Clipboard.getStringAsync();
    setSignature(value.trim());
    setFeedback(value.trim() ? "클립보드의 서명값을 붙여넣었어요." : "클립보드에 서명값이 없어요.");
  }

  async function copyWalletAddress() {
    const value = walletAddress.trim();
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setFeedback("지갑 주소를 복사했어요.");
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
      onSummoned?.(result.equippedStar.id);
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

      <Pressable
        disabled={walletConnection.isBusy || isCreatingChallenge || isVerifying}
        onPress={authenticateWithWallet}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.primary,
            opacity: pressed ? 0.85 : walletConnection.isBusy || isCreatingChallenge || isVerifying ? 0.45 : 1,
          },
        ]}
      >
        {walletConnection.isBusy || isCreatingChallenge || isVerifying ? (
          <ActivityIndicator size="small" color={colors.primaryForeground} />
        ) : (
          <Feather name="link" size={16} color={colors.primaryForeground} />
        )}
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
          {isVerifying
            ? "소유권 확인 중"
            : walletConnection.isConnected
              ? "지갑 서명하고 NFT 확인"
              : "지갑 연결하고 인증하기"}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showManual }}
        onPress={() => setShowManual((value) => !value)}
        style={styles.manualToggle}
      >
        <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
          {showManual ? "수동 인증 닫기" : "지갑 연결이 안 되나요? 수동 인증"}
        </Text>
        <Feather name={showManual ? "chevron-up" : "chevron-down"} size={16} color={colors.primary} />
      </Pressable>

      {showManual ? (
        <View style={styles.challengeBlock}>
          <Text style={[styles.label, { color: colors.foreground }]}>1. 인증할 지갑 주소</Text>
          <View style={styles.inlineRow}>
            <TextInput
              value={walletAddress}
              onChangeText={setWalletAddress}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="0x 지갑 주소"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                styles.flexInput,
                { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground },
              ]}
            />
            <Pressable
              accessibilityLabel="지갑 주소 복사"
              onPress={copyWalletAddress}
              style={[styles.squareButton, { backgroundColor: colors.secondary }]}
            >
              <Feather name="copy" size={16} color={colors.primary} />
            </Pressable>
          </View>
          <Pressable
            disabled={!canCreateChallenge}
            onPress={requestChallenge}
            style={({ pressed }) => [
              styles.secondaryButton,
              { backgroundColor: colors.secondary, opacity: pressed ? 0.8 : canCreateChallenge ? 1 : 0.45 },
            ]}
          >
            <Feather name="file-text" size={15} color={colors.primary} />
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
              {isCreatingChallenge ? "메시지 생성 중" : "2. 서명 메시지 만들기"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {showManual && challenge ? (
        <View style={styles.challengeBlock}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.label, { color: colors.foreground }]}>3. 지갑 앱에서 서명할 메시지</Text>
            <Text style={[styles.expiry, { color: expiresIn === 0 ? colors.destructive : colors.mutedForeground }]}>
              {expiresIn === null ? "" : expiresIn === 0 ? "만료됨" : `${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, "0")}`}
            </Text>
          </View>
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
            onPress={pasteSignature}
            style={[styles.secondaryButton, { backgroundColor: colors.secondary }]}
          >
            <Feather name="clipboard" size={15} color={colors.primary} />
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>4. 서명값 붙여넣기</Text>
          </Pressable>
          <Pressable
            disabled={!canVerify || expiresIn === 0}
            onPress={submitSignature}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : canVerify ? 1 : 0.45 },
            ]}
          >
            <Feather name="check-circle" size={16} color={colors.primaryForeground} />
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
              {isVerifying ? "검증 중" : "5. 서명 검증하고 NFT 확인"}
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

      {status?.walletVerified ? (
        <View style={styles.challengeBlock}>
          <Text style={[styles.label, { color: colors.foreground }]}>소환 가능한 내 NFT</Text>
          {inventory?.partial ? (
            <View style={[styles.notice, { backgroundColor: colors.background }]}>
              <Feather name="alert-circle" size={15} color={colors.primary} />
              <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
                일부 컬렉션의 소유권 조회가 지연되고 있어요. 잠시 후 다시 확인해 주세요.
              </Text>
            </View>
          ) : null}
          {isLoadingInventory ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>허용 컬렉션의 NFT를 확인하고 있어요.</Text>
            </View>
          ) : inventory?.collections.length ? (
            <View style={styles.collectionList}>
              {inventory.collections.flatMap((collection) =>
                collection.tokens.length
                  ? collection.tokens.map((token) => {
                      const selected =
                        selectedCollectionId === token.collectionId && tokenId === token.tokenId;
                      return (
                        <Pressable
                          key={`${token.collectionId}:${token.tokenId}`}
                          onPress={() => {
                            setSelectedCollectionId(token.collectionId);
                            setTokenId(token.tokenId);
                          }}
                          style={[
                            styles.collectionChip,
                            {
                              borderColor: selected ? colors.primary : colors.border,
                              backgroundColor: selected ? colors.primary + "18" : colors.background,
                            },
                          ]}
                        >
                          <Text style={[styles.collectionChipText, { color: selected ? colors.primary : colors.foreground }]}>
                            {token.ipName} #{token.tokenId}
                          </Text>
                          <Text style={[styles.collectionChipMeta, { color: colors.mutedForeground }]}>
                            소유권 확인 완료
                          </Text>
                        </Pressable>
                      );
                    })
                  : [],
              )}
            </View>
          ) : (
            <View style={[styles.notice, { backgroundColor: colors.background }]}>
              <Feather name="search" size={15} color={colors.primary} />
              <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
                자동으로 찾은 장착 가능 NFT가 없어요. 보유 NFT가 맞다면 아래에서 컬렉션과 토큰 번호를 직접 확인할 수 있어요.
              </Text>
            </View>
          )}

          {inventory?.collections.some((collection) => collection.requiresTokenId) || !inventory?.hasEligibleNft ? (
            <View style={styles.collectionPicker}>
              <Text style={[styles.label, { color: colors.foreground }]}>토큰 번호로 직접 확인</Text>
              <View style={styles.collectionList}>
                {(inventory?.collections.length ? inventory.collections : collections).map((collection) => {
                  const id = "collectionId" in collection ? collection.collectionId : collection.id;
                  const selected = selectedCollectionId === id;
                  return (
                    <Pressable key={id} onPress={() => setSelectedCollectionId(id)} style={[styles.collectionChip, { borderColor: selectedCollectionId === id ? colors.primary : colors.border, backgroundColor: selectedCollectionId === id ? colors.primary + "18" : colors.background }]}>
                      <Text style={[styles.collectionChipText, { color: selected ? colors.primary : colors.foreground }]}>{collection.ipName}</Text>
                      <Text style={[styles.collectionChipMeta, { color: colors.mutedForeground }]}>{collection.category}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={tokenId}
                onChangeText={setTokenId}
                keyboardType="number-pad"
                placeholder="NFT token ID"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.input,
                  { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground },
                ]}
              />
            </View>
          ) : null}
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
              {isEquipping ? "소유권 재확인 중" : "선택한 NFT로 STAR 소환"}
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
  inlineRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  flexInput: { flex: 1 },
  squareButton: { alignItems: "center", borderRadius: 14, height: 44, justifyContent: "center", width: 44 },
  manualToggle: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 4, paddingVertical: 4 },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  expiry: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  loadingRow: { alignItems: "center", flexDirection: "row", gap: 8 },
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
