import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFanCommunities, useFanCommunityPrograms } from "@/hooks/useFanCommunities";
import { NeonBackdrop } from "@/components/NeonUI";
import { neon } from "@/constants/colors";

export default function CommunitiesScreen() {
  const { communities, isLoading, toggleMembership, isMutating } = useFanCommunities();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ?? communities[0]?.id ?? null;
  const program = useFanCommunityPrograms(selected);
  const community = communities.find((item) => item.id === selected);
  return <NeonBackdrop style={styles.container}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>팬 커뮤니티</Text>
    {isLoading ? <ActivityIndicator color={neon.purple} /> : communities.length === 0 ? <Text style={styles.empty}>아직 공개된 커뮤니티가 없습니다.</Text> : communities.map((item) => <Pressable key={item.id} onPress={() => setSelectedId(item.id)} style={[styles.community, item.id === selected && styles.selected]}><View style={styles.row}><Feather name="users" size={18} color={neon.purple} /><Text style={styles.name}>{item.name}</Text></View><Text style={styles.description}>{item.description || "STAR와 함께하는 팬 공간"}</Text><Text style={styles.count}>{item.memberCount}명 참여</Text><Pressable disabled={isMutating} onPress={() => void toggleMembership({ id: item.id, joined: false })} style={styles.join}><Text style={styles.joinText}>가입/탈퇴</Text></Pressable></Pressable>)}
    {community ? <><Text style={styles.sectionTitle}>{community.name} 브로드캐스트</Text>{program.broadcasts.map((item) => <View key={item.id} style={styles.card}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardBody}>{item.body}</Text></View>)}<Text style={styles.sectionTitle}>미션</Text>{program.missions.map((item) => <View key={item.id} style={styles.card}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardBody}>{item.description}</Text><Pressable onPress={() => void program.joinMission(item.id)} style={styles.mission}><Text style={styles.joinText}>미션 참여</Text></Pressable></View>)}</> : null}
  </ScrollView></NeonBackdrop>;
}

const styles = StyleSheet.create({ container: { flex: 1 }, content: { padding: 20, gap: 12, paddingBottom: 100 }, title: { color: "#FFF", fontSize: 26, fontFamily: "Inter_700Bold" }, sectionTitle: { color: "#E4C8FF", fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 12 }, community: { padding: 14, borderRadius: 16, backgroundColor: "#141022", borderWidth: 1, borderColor: "#2B2340" }, selected: { borderColor: neon.purple }, row: { flexDirection: "row", gap: 8, alignItems: "center" }, name: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 16 }, description: { color: "#B9B2C1", marginTop: 6 }, count: { color: "#887D99", marginTop: 8, fontSize: 12 }, join: { alignSelf: "flex-end", marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: "#6D2DA7" }, joinText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 12 }, empty: { color: "#B9B2C1" }, card: { padding: 14, borderRadius: 14, backgroundColor: "#171229", borderWidth: 1, borderColor: "#34234D", gap: 6 }, cardTitle: { color: "#FFF", fontFamily: "Inter_700Bold" }, cardBody: { color: "#B9B2C1" }, mission: { alignSelf: "flex-start", marginTop: 6, padding: 8, borderRadius: 8, backgroundColor: "#2E7D65" } });
