import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { customFetch, useGetMe } from "@workspace/api-client-react";

import { Avatar } from "@/components/Avatar";
import { NeonBackdrop } from "@/components/NeonUI";

const PROFILE_TABS = [
  ["posts", "게시물"],
  ["star", "STAR 활동"],
  ["battle", "배틀 결과"],
  ["growth", "성장 기록"],
] as const;

type Profile = { id: string; nickname: string; profileImageUrl: string | null; profileType?: "fan" | "star" | "official_ai"; statusMessage: string | null; fan: { level: number; xp: number }; stars: Array<{ id: string; displayName: string; imageUrl: string | null; stage: string; level: number; xp: number }>; followerCount: number; followingCount: number; followedStarIds?: string[] };
type Post = { id: string; title: string; body: string; kind: string; createdAt: string; };
type GrowthRecord = { id: string; eventType: string; xpDelta: number; reason: string | null; createdAt: string };
type BattleResult = { roomId: string; topic: string; category: string; outcome: "win" | "loss" | "draw"; myScore: number; opponentScore: number; opponentName: string; completedAt: string };
type Page<T> = { items: T[]; nextCursor: string | null };

export default function PublicProfileScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { data: me } = useGetMe();
  const profileQuery = useQuery({ queryKey: ["public-profile", userId], enabled: !!userId, queryFn: () => customFetch<Profile>(`/api/users/${userId}/profile`, { responseType: "json" }) });
  const [selectedStarId, setSelectedStarId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<"posts" | "star" | "battle" | "growth">("posts");
  const profile = profileQuery.data;
  const isMe = !!profile && profile.id === me?.id;
  const [following, setFollowing] = React.useState(false);
  React.useEffect(() => { if (profile?.stars[0]) setFollowing(profile.followedStarIds?.includes(profile.stars[0].id) ?? false); }, [profile]);
  React.useEffect(() => { if (profile && selectedStarId && !profile.stars.some((star) => star.id === selectedStarId)) setSelectedStarId(null); }, [profile, selectedStarId]);
  const postsQuery = useQuery({ queryKey: ["public-profile-posts", userId, selectedStarId], enabled: !!userId, queryFn: () => customFetch<Page<Post>>(`/api/users/${userId}/posts${selectedStarId ? `?starId=${selectedStarId}` : ""}`, { responseType: "json" }) });
  const growthQuery = useQuery({ queryKey: ["public-profile-growth", userId], enabled: !!userId && activeTab === "growth", queryFn: () => customFetch<Page<GrowthRecord>>(`/api/users/${userId}/growth-records`, { responseType: "json" }) });
  const battleQuery = useQuery({ queryKey: ["public-profile-battles", userId], enabled: !!userId && activeTab === "battle", queryFn: () => customFetch<Page<BattleResult>>(`/api/users/${userId}/battle-results`, { responseType: "json" }) });
  if (profileQuery.isError) return <NeonBackdrop style={styles.center}><Text style={styles.title}>프로필을 불러오지 못했어요.</Text><Pressable onPress={() => void profileQuery.refetch()} style={styles.button}><Text style={styles.buttonText}>다시 시도</Text></Pressable></NeonBackdrop>;
  if (profileQuery.isLoading || !profile) return <NeonBackdrop style={styles.center}><ActivityIndicator color="#B84CFF" /><Text style={styles.muted}>프로필을 불러오는 중이에요.</Text></NeonBackdrop>;
  return <NeonBackdrop style={styles.container}>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.back}><Feather name="arrow-left" size={21} color="#F0EDF4" /></Pressable>
      <View style={styles.hero}><View style={styles.avatar}><Avatar uri={profile.profileImageUrl} name={profile.nickname} size={86} crop="face" characterType={profile.profileType} /></View><Text style={styles.name}>{profile.nickname}</Text>{profile.statusMessage ? <Text style={styles.status}>{profile.statusMessage}</Text> : null}<View style={styles.counts}><Text style={styles.count}><Text style={styles.countStrong}>{profile.followerCount}</Text> 팔로워</Text><Text style={styles.count}><Text style={styles.countStrong}>{profile.followingCount}</Text> 팔로잉</Text><Text style={styles.count}><Text style={styles.countStrong}>{profile.stars.length}</Text> STAR</Text></View></View>
      <View style={styles.actions}>{isMe ? <Pressable onPress={() => router.push("/profile/edit")} style={styles.button}><Text style={styles.buttonText}>프로필 수정</Text></Pressable> : profile.stars[0] ? <Pressable onPress={async () => { const id = profile.stars[0].id; await customFetch(`/api/star-feed/star-profiles/${id}/follow`, { method: following ? "DELETE" : "POST", responseType: "json" }); setFollowing((value) => !value); }} style={styles.button}><Text style={styles.buttonText}>{following ? "팔로잉" : "팔로우"}</Text></Pressable> : null}</View>
      <View style={styles.section}><Text style={styles.sectionTitle}>FAN 성장</Text><Text style={styles.muted}>Lv.{profile.fan.level} · {profile.fan.xp} XP</Text></View>
      {profile.stars.length ? <View style={styles.section}><Text style={styles.sectionTitle}>콘텐츠 주체 선택</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.starTabs}><Pressable onPress={() => setSelectedStarId(null)} style={[styles.starTab, !selectedStarId && styles.starTabActive]}><Text style={styles.starTabText}>FAN 전체</Text></Pressable>{profile.stars.map((star) => <Pressable key={star.id} onPress={() => setSelectedStarId(star.id)} style={[styles.starTab, selectedStarId === star.id && styles.starTabActive]}><Text style={styles.starTabText}>{star.displayName}</Text></Pressable>)}</ScrollView>{profile.stars.map((star) => <View key={star.id} style={styles.starRow}><Avatar uri={star.imageUrl} name={star.displayName} size={42} crop="face" characterType="star" /><View style={styles.starCopy}><Text style={styles.starName}>{star.displayName}</Text><Text style={styles.muted}>{star.stage.toUpperCase()} · Lv.{star.level} · {star.xp} XP</Text></View></View>)}</View> : null}
      <View style={styles.tabs}>{PROFILE_TABS.map(([key,label]) => <Pressable key={key} onPress={() => setActiveTab(key)} style={[styles.tab, activeTab === key && styles.tabActive]}><Text style={styles.tabText}>{label}</Text></Pressable>)}</View>
      <View style={styles.section}>{activeTab === "posts" ? <><Text style={styles.sectionTitle}>{selectedStarId ? "STAR 공개 게시물" : "공개 게시물"}</Text>{postsQuery.isLoading ? <ActivityIndicator color="#B84CFF" /> : postsQuery.data?.items.length ? postsQuery.data.items.map((post) => <Pressable key={post.id} onPress={() => router.push({ pathname: "/post/[postId]", params: { postId: post.id } } as never)} style={styles.post} accessibilityRole="button" accessibilityLabel="게시물 상세 보기"><Text style={styles.postTitle}>{post.title}</Text><Text style={styles.postBody}>{post.body}</Text></Pressable>) : <Text style={styles.muted}>아직 공개 게시물이 없어요.</Text>}</> : activeTab === "star" ? <><Text style={styles.sectionTitle}>STAR 활동</Text><Text style={styles.muted}>{selectedStarId ? "선택한 STAR의 활동 기록입니다." : "STAR를 선택하면 해당 활동을 확인할 수 있어요."}</Text></> : activeTab === "battle" ? <><Text style={styles.sectionTitle}>배틀 결과</Text>{battleQuery.isLoading ? <ActivityIndicator color="#B84CFF" /> : battleQuery.data?.items.length ? battleQuery.data.items.map((battle) => <View key={battle.roomId} style={styles.post}><Text style={styles.postTitle}>{battle.outcome === "win" ? "승리" : battle.outcome === "loss" ? "패배" : "무승부"} · {battle.topic}</Text><Text style={styles.postBody}>{battle.opponentName} · {battle.myScore} : {battle.opponentScore}</Text></View>) : <Text style={styles.muted}>아직 공개 배틀 결과가 없어요.</Text>}</> : <><Text style={styles.sectionTitle}>성장 기록</Text>{growthQuery.isLoading ? <ActivityIndicator color="#B84CFF" /> : growthQuery.data?.items.length ? growthQuery.data.items.map((record) => <View key={record.id} style={styles.post}><Text style={styles.postTitle}>{record.eventType}</Text><Text style={styles.postBody}>{record.reason ?? "STAR 성장 활동"} · +{record.xpDelta} XP</Text></View>) : <Text style={styles.muted}>아직 공개 성장 기록이 없어요.</Text>}</>}</View>
    </ScrollView>
  </NeonBackdrop>;
}

const styles = StyleSheet.create({ container:{flex:1}, center:{flex:1,alignItems:"center",justifyContent:"center",gap:12}, content:{padding:20,paddingBottom:48}, back:{paddingVertical:8}, hero:{alignItems:"center",marginTop:8}, avatar:{width:96,height:96,borderRadius:48,padding:4,borderWidth:1,borderColor:"#B84CFF"}, name:{color:"#F0EDF4",fontSize:22,fontFamily:"Inter_700Bold",marginTop:12}, title:{color:"#F0EDF4",fontFamily:"Inter_700Bold",fontSize:15}, status:{color:"#AAA5B2",fontSize:12,marginTop:5}, counts:{flexDirection:"row",gap:20,marginTop:14}, count:{color:"#AAA5B2",fontSize:11}, countStrong:{color:"#F0EDF4",fontFamily:"Inter_700Bold"}, actions:{alignItems:"center",marginTop:18}, button:{backgroundColor:"#7E36D7",borderRadius:999,paddingHorizontal:28,paddingVertical:10}, buttonText:{color:"#FFF",fontFamily:"Inter_600SemiBold",fontSize:12}, tabs:{flexDirection:"row",gap:6,marginTop:24,borderBottomWidth:1,borderBottomColor:"rgba(123,53,255,0.24)",paddingBottom:8}, tab:{flex:1,alignItems:"center",paddingVertical:8,borderRadius:8}, tabActive:{backgroundColor:"rgba(126,54,215,0.48)"}, tabText:{color:"#EDE5FA",fontFamily:"Inter_600SemiBold",fontSize:10}, section:{marginTop:16,gap:10}, sectionTitle:{color:"#F0EDF4",fontFamily:"Inter_700Bold",fontSize:15}, muted:{color:"#AAA5B2",fontSize:11}, starTabs:{gap:8,paddingVertical:2}, starTab:{borderRadius:999,borderWidth:1,borderColor:"rgba(123,53,255,0.35)",paddingHorizontal:13,paddingVertical:7}, starTabActive:{backgroundColor:"#7E36D7",borderColor:"#B84CFF"}, starTabText:{color:"#EDE5FA",fontFamily:"Inter_600SemiBold",fontSize:11}, starRow:{flexDirection:"row",alignItems:"center",gap:10,borderRadius:12,backgroundColor:"rgba(30,18,55,0.72)",padding:10}, starCopy:{gap:3}, starName:{color:"#EDE5FA",fontFamily:"Inter_600SemiBold",fontSize:13}, post:{borderRadius:12,borderWidth:1,borderColor:"rgba(123,53,255,0.24)",padding:12,gap:5}, postTitle:{color:"#EDE5FA",fontFamily:"Inter_600SemiBold",fontSize:12}, postBody:{color:"#B9B1C7",fontSize:11,lineHeight:16} });
