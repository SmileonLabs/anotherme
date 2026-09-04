import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CharacterAvatar } from "@/components/CharacterAvatar";
import { type AvatarCatalogItem, type AvatarSlot, useAvatarCatalog } from "@/hooks/useAvatarCatalog";
import { usePvtWallet } from "@/hooks/usePvtWallet";
import { buildAvatarRecipe, parseAvatarRecipe } from "@/lib/avatarAssets";
import { crossAlert } from "@/lib/crossAlert";

const SLOT_LABEL: Record<AvatarSlot, string> = { background: "배경", base: "베이스", head: "헤어", wear: "의상", effect: "이펙트", full_skin: "클래스 스킨", star_form: "성장 형태" };
const CLASS_LEVEL = [1, 10, 30, 60];

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) return String((error as { data?: { error?: string } }).data?.error ?? "");
  return error instanceof Error ? error.message : "";
}

export default function AvatarCustomizationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  const catalog = useAvatarCatalog(profileId);
  const wallet = usePvtWallet();
  const [slot, setSlot] = React.useState<AvatarSlot>("base");
  const busy = catalog.isPurchasing || catalog.isEquipping;
  const data = catalog.data;
  const slots: AvatarSlot[] = data?.appearance.type === "star" ? ["star_form", "effect"] : ["base", "head", "wear", "effect", "full_skin"];
  React.useEffect(() => { if (data?.appearance.type === "star") setSlot("star_form"); }, [data?.appearance.type]);
  const items = (data?.items ?? []).filter((item) => item.slot === slot && (!item.gender || item.gender === data?.appearance.gender));

  const previewRecipe = (candidate: AvatarCatalogItem) => {
    if (!data) return null;
    const currentKeys = parseAvatarRecipe(data.appearance.recipe)?.keys ?? [];
    const byKey = new Map(data.items.map((item) => [item.itemKey, item]));
    let keys = currentKeys.filter((key) => byKey.get(key)?.slot !== candidate.slot);
    if (candidate.slot === "base" && candidate.gender !== data.appearance.gender) {
      keys = keys.filter((key) => !["head", "wear", "full_skin"].includes(byKey.get(key)?.slot ?? ""));
      keys.push(`fan.head.${candidate.gender}.001`, `fan.wear.${candidate.gender}.001`);
    }
    if (candidate.slot === "full_skin") keys = keys.filter((key) => !["head", "wear", "effect"].includes(byKey.get(key)?.slot ?? ""));
    keys.push(candidate.itemKey);
    keys.sort((a, b) => (byKey.get(a)?.layerOrder ?? 0) - (byKey.get(b)?.layerOrder ?? 0));
    return buildAvatarRecipe(data.appearance.type, keys);
  };

  const equip = async (item: AvatarCatalogItem) => {
    try { await catalog.equipItem(item.itemKey); }
    catch (error) {
      const code = errorCode(error);
      crossAlert("장착할 수 없어요", code.includes("LOCKED") ? "현재 클래스에서 사용할 수 없는 아이템이에요." : "아이템 상태를 확인한 뒤 다시 시도해 주세요.");
    }
  };
  const choose = (item: AvatarCatalogItem) => {
    if (data?.appearance.type === "star") return;
    if (item.classStage > data!.appearance.classStage) { crossAlert("아직 잠겨 있어요", `Class ${item.classStage} 달성 후 사용할 수 있어요.`); return; }
    if (item.owned || item.isDefault || item.priceStarPoint === 0) { void equip(item); return; }
    crossAlert("아바타 아이템 구매", `${item.displayName}을(를) ${item.priceStarPoint.toLocaleString()} STAR Point로 구매할까요?`, [
      { text: "취소", style: "cancel" },
      { text: "구매", onPress: () => void (async () => {
        try { await catalog.purchaseItem(item.itemKey); await catalog.equipItem(item.itemKey); }
        catch (error) { crossAlert("구매할 수 없어요", errorCode(error).includes("INSUFFICIENT") ? "STAR Point가 부족해요." : "잠시 후 다시 시도해 주세요."); }
      })() },
    ]);
  };

  if (catalog.isLoading) return <View style={styles.center}><ActivityIndicator color="#9B57FF" /><Text style={styles.muted}>아바타를 불러오는 중이에요.</Text></View>;
  if (!data) return <View style={styles.center}><Text style={styles.title}>아바타를 불러오지 못했어요.</Text><Pressable onPress={() => void catalog.refetch()} style={styles.primary}><Text style={styles.primaryText}>다시 시도</Text></Pressable></View>;

  return <View style={styles.root}><View style={[styles.header, { paddingTop: insets.top + 8 }]}><Pressable accessibilityLabel="뒤로가기" hitSlop={12} onPress={() => router.back()}><Feather name="arrow-left" size={28} color="#fff" /></Pressable><Text style={styles.headerTitle}>아바타 꾸미기</Text><View style={{ width: 28 }} /></View><ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 36 }]}><View style={styles.balance}><Text style={styles.balanceLabel}>보유 STAR Point</Text><Text style={styles.balanceValue}>{(wallet.data?.balance ?? 0).toLocaleString()}</Text></View><View style={styles.hero}><CharacterAvatar uri={data.appearance.recipe} crop="full" style={StyleSheet.absoluteFillObject} />{busy ? <View style={styles.busy}><ActivityIndicator color="#fff" /></View> : null}</View><View style={styles.stageBadge}><Text style={styles.stageText}>{data.appearance.type.toUpperCase()} · Class {data.appearance.classStage}</Text></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{slots.map((item) => <Pressable key={item} onPress={() => setSlot(item)} style={[styles.tab, slot === item && styles.tabActive]}><Text style={[styles.tabText, slot === item && styles.tabTextActive]}>{SLOT_LABEL[item]}</Text></Pressable>)}</ScrollView>{data.appearance.type === "star" ? <Text style={styles.guide}>STAR 외형은 성장에 따라 자동으로 확정됩니다. Class 1은 Lv.10, Class 2는 Lv.30, Class 3는 Lv.60에 열려요.</Text> : null}<View style={styles.grid}>{items.map((item) => { const locked = item.classStage > data.appearance.classStage; return <Pressable key={item.itemKey} disabled={busy || data.appearance.type === "star"} onPress={() => choose(item)} style={[styles.card, item.equipped && styles.cardActive, locked && styles.cardLocked]}><View style={styles.cardPreview}><CharacterAvatar uri={previewRecipe(item)} crop="full" style={StyleSheet.absoluteFillObject} /></View><Text numberOfLines={1} style={styles.cardName}>{item.displayName}</Text><Text style={[styles.cardMeta, item.equipped && styles.equipped]}>{item.equipped ? "장착 중" : locked ? `Lv.${CLASS_LEVEL[item.classStage] ?? "-"}` : item.owned || item.isDefault ? "보유" : `${item.priceStarPoint.toLocaleString()} STAR`}</Text></Pressable>; })}</View></ScrollView></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#040309" }, center: { flex: 1, backgroundColor: "#040309", alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }, header: { minHeight: 62, paddingHorizontal: 18, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, headerTitle: { color: "#fff", fontSize: 20, fontWeight: "800" }, title: { color: "#fff", fontSize: 18, fontWeight: "800" }, muted: { color: "#A59DB2" }, content: { paddingHorizontal: 18, gap: 14 }, balance: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#382650", backgroundColor: "#0C0915", borderRadius: 14, padding: 14 }, balanceLabel: { color: "#AAA2B7", fontSize: 12 }, balanceValue: { color: "#B774FF", fontSize: 17, fontWeight: "900" }, hero: { alignSelf: "center", width: 252, height: 360, borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: "#5D318D" }, busy: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "center" }, stageBadge: { alignSelf: "center", backgroundColor: "#24103F", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }, stageText: { color: "#C595FF", fontSize: 12, fontWeight: "800" }, tabs: { gap: 8, paddingVertical: 2 }, tab: { borderWidth: 1, borderColor: "#352847", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#0C0A12" }, tabActive: { backgroundColor: "#7132EF", borderColor: "#A55EFF" }, tabText: { color: "#9E96AA", fontSize: 12, fontWeight: "700" }, tabTextActive: { color: "#fff" }, guide: { color: "#A59DB2", fontSize: 12, lineHeight: 19, backgroundColor: "#0C0915", borderRadius: 14, padding: 14 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, card: { width: "48%", borderRadius: 16, borderWidth: 1, borderColor: "#30243F", backgroundColor: "#0C0914", overflow: "hidden", paddingBottom: 11 }, cardActive: { borderColor: "#A951FF", backgroundColor: "#170A27" }, cardLocked: { opacity: 0.48 }, cardPreview: { width: "100%", aspectRatio: 0.82, backgroundColor: "#05050A" }, cardName: { color: "#F6F1FA", fontSize: 13, fontWeight: "800", marginHorizontal: 10, marginTop: 9 }, cardMeta: { color: "#968DA4", fontSize: 11, marginHorizontal: 10, marginTop: 3 }, equipped: { color: "#B86DFF", fontWeight: "800" }, primary: { backgroundColor: "#7132EF", borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 }, primaryText: { color: "#fff", fontWeight: "800" },
});
