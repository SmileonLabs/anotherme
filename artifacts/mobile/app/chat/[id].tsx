import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  getFetchRoomMessagesQueryKey,
  getGetDungeonStateQueryKey,
  getListRoomsQueryKey,
  useFetchRoomMessages,
  useGetDungeonState,
  useGetMe,
  useGetRoom,
  useGetTypingUsers,
  useLeaveRoom,
  useSendMessage,
  useSetTyping,
  useMarkRoomRead,
  type Message,
} from "@workspace/api-client-react";
import { MessageBubble } from "@/components/MessageBubble";
import { DungeonPartyStrip } from "@/components/DungeonPartyStrip";
import { FadeInView } from "@/components/FadeInView";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { MessageComposer } from "@/components/MessageComposer";
import { useColors } from "@/hooks/useColors";
import { useCall } from "@/components/CallProvider";
import { crossAlert } from "@/lib/crossAlert";
import { mediaUri } from "@/lib/apiBase";
import { pickAndUploadImage, PermissionDeniedError } from "@/lib/uploadImage";
import { pickAndUploadFile, FileTooLargeError } from "@/lib/uploadFile";
import { encodeFileContent } from "@/lib/fileMessage";

const DM_EMAIL = "dungeon-master@todotalk.system";

// Delay between each staggered dungeon line ("당~ 당~ 당~").
const REVEAL_INTERVAL = 480;

// Rotating flavor text shown while the AI dungeon master generates a turn.
const DM_THINKING_LINES = [
  "던전 마스터가 주사위를 굴리는 중...",
  "운명의 실을 엮는 중...",
  "어둠 속에서 무언가 움직인다...",
  "다음 장면을 그리는 중...",
  "주변의 공기가 무거워진다...",
];

function formatMsgTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function formatDayLabel(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: me } = useGetMe();
  const { data: room } = useGetRoom(id);
  const { data: messages = [], refetch } = useFetchRoomMessages(id);
  const { data: typingUsers = [], refetch: refetchTyping } = useGetTypingUsers(id);
  const sendMessage = useSendMessage();
  const setTyping = useSetTyping();
  const markRead = useMarkRoomRead();
  const leaveRoom = useLeaveRoom();
  const { startCall, joinFromCard, supported: callSupported } = useCall();

  const [uploading, setUploading] = useState<"image" | "file" | null>(null);
  const [listReady, setListReady] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const flatRef = useRef<FlatList>(null);
  const didInitialScrollRef = useRef(false);
  // Custom scroll indicator: a slim thumb that appears instantly while scrolling
  // and fades out shortly after the user stops. Driven entirely by setValue on
  // these Animated values (no per-frame re-render); only the opacity is animated.
  const [scrollTrack, setScrollTrack] = useState({ top: 0, height: 0 });
  const scrollThumbHeight = useRef(new Animated.Value(0)).current;
  const scrollThumbY = useRef(new Animated.Value(0)).current;
  const scrollbarOpacity = useRef(new Animated.Value(0)).current;
  const scrollbarVisibleRef = useRef(false);
  const scrollbarHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Telegram-style "stick to bottom": only auto-follow new content when the user
  // is already near the bottom. If they've scrolled up to read history, never yank
  // them down — show a scroll-to-bottom pill instead. Defaults true so a fresh
  // room opens pinned to the latest message.
  const stickToBottomRef = useRef(true);
  // On re-entry, anchor the view at the first unread message (with a "새 메시지"
  // divider) instead of always snapping to the latest — captured once per room
  // BEFORE markRead advances the server pointer. anchorMsgId is the id of the
  // first unread message; null means "no unread → open at the bottom".
  const entryCapturedRef = useRef(false);
  const [captured, setCaptured] = useState(false);
  const [anchorMsgId, setAnchorMsgId] = useState<string | null>(null);

  // --- Dungeon: sequential message reveal + DM "thinking" loader ---
  const [dmThinking, setDmThinking] = useState(false);
  const [thinkIdx, setThinkIdx] = useState(0);
  const [revealTick, setRevealTick] = useState(0);
  const revealedIdsRef = useRef<Set<string>>(new Set());
  const staggeredIdsRef = useRef<Set<string>>(new Set());
  // Maps a server message id -> the temp id we first rendered it under, so the
  // optimistic→real swap keeps a stable React key (no row remount = no scroll
  // jump / "팅김" when refetch replaces the temp message with the persisted one).
  const clientKeyRef = useRef<Map<string, string>>(new Map());
  const revealQueueRef = useRef<string[]>([]);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);
  const dmThinkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDmThinking = React.useCallback(() => {
    setDmThinking(false);
    if (dmThinkTimeoutRef.current) {
      clearTimeout(dmThinkTimeoutRef.current);
      dmThinkTimeoutRef.current = null;
    }
  }, []);

  // Reveals queued DM/system lines one at a time so a turn "lands" gradually
  // (시스템 메시지 당~ 당~ 당~ → DM 내러티브) instead of all at once.
  const pumpReveal = React.useCallback(() => {
    if (revealTimerRef.current) return;
    const step = () => {
      const next = revealQueueRef.current.shift();
      if (next === undefined) {
        revealTimerRef.current = null;
        return;
      }
      revealedIdsRef.current.add(next);
      staggeredIdsRef.current.add(next);
      clearDmThinking();
      setRevealTick((t) => t + 1);
      // Stop animating this id once its entrance finishes so FlatList recycling
      // (scrolling through history) doesn't re-fade an already-seen line.
      setTimeout(() => staggeredIdsRef.current.delete(next), 1200);
      revealTimerRef.current = setTimeout(step, REVEAL_INTERVAL);
    };
    revealTimerRef.current = setTimeout(step, REVEAL_INTERVAL);
  }, [clearDmThinking]);

  const isGroupRoom = room?.type === "group";
  const isDungeon = room?.type === "dungeon";
  const isMultiParty = isGroupRoom || isDungeon;
  const otherCount = Math.max(0, ((room?.members as any[])?.length ?? 1) - 1);

  const { data: dungeon, refetch: refetchDungeon } = useGetDungeonState(id, {
    query: { enabled: isDungeon, queryKey: getGetDungeonStateQueryKey(id) },
  });

  const flashOpacity = useRef(new Animated.Value(0)).current;
  const enemyFlashOpacity = useRef(new Animated.Value(0)).current;
  const [enemyShakeToken, setEnemyShakeToken] = useState(0);
  const prevTurnRef = useRef<number | null>(null);

  // Reset combat-animation state when switching rooms so a stale turn counter
  // from a previous room can't suppress (or misfire) the next room's effects.
  useEffect(() => {
    prevTurnRef.current = null;
    // Reset reveal state when switching rooms.
    revealedIdsRef.current = new Set();
    staggeredIdsRef.current = new Set();
    clientKeyRef.current.clear();
    revealQueueRef.current = [];
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    initializedRef.current = false;
    setRevealTick((t) => t + 1);
    clearDmThinking();
  }, [id, clearDmThinking]);

  useEffect(() => {
    if (!isDungeon) return;
    const timer = setInterval(() => refetchDungeon(), 3000);
    return () => clearInterval(timer);
  }, [isDungeon, refetchDungeon]);

  // When a new turn arrives, replay combat feedback from that turn's events:
  // a red screen flash + bubble shake on player hits, an enemy-card shake on
  // monster hits.
  useEffect(() => {
    if (!isDungeon || !dungeon) return;
    const turn = dungeon.turn;
    if (prevTurnRef.current === null) {
      prevTurnRef.current = turn;
      return;
    }
    if (turn <= prevTurnRef.current) return;
    prevTurnRef.current = turn;

    const events = dungeon.lastTurnEvents ?? [];
    let playerHurt = false;
    let enemyStruck = false;
    for (const ev of events) {
      if (ev.kind === "playerHit") {
        playerHurt = true;
      } else if (ev.kind === "enemyHit") {
        enemyStruck = true;
      } else if (ev.kind === "death") {
        // A death with a targetUserId is a party member dying (player hurt);
        // without one it's a monster dying (a hit we landed).
        if (ev.targetUserId) playerHurt = true;
        else enemyStruck = true;
      }
    }

    if (playerHurt) {
      // Player took damage: the red screen flash is the whole signal. We no
      // longer jolt the player's message bubble — the shake landed on their own
      // action text and read as "my message shook" rather than "I got hit".
      const useNative = Platform.OS !== "web";
      flashOpacity.setValue(0);
      Animated.sequence([
        Animated.timing(flashOpacity, { toValue: 0.5, duration: 80, useNativeDriver: useNative }),
        Animated.timing(flashOpacity, { toValue: 0, duration: 340, useNativeDriver: useNative }),
      ]).start();
    }
    if (enemyStruck) {
      // Same feedback as a player hit, but a green flash to signal we struck the
      // monster (an attack landing) rather than the party taking damage.
      const useNative = Platform.OS !== "web";
      enemyFlashOpacity.setValue(0);
      Animated.sequence([
        Animated.timing(enemyFlashOpacity, { toValue: 0.5, duration: 80, useNativeDriver: useNative }),
        Animated.timing(enemyFlashOpacity, { toValue: 0, duration: 340, useNativeDriver: useNative }),
      ]).start();
      setEnemyShakeToken((t) => t + 1);
    }
  }, [isDungeon, dungeon, flashOpacity, enemyFlashOpacity]);

  const handleLeave = React.useCallback(() => {
    if (leaveRoom.isPending) return;
    const isGroup = room?.type === "group";
    const message = isGroup
      ? "이 그룹 채팅방에서 나가시겠습니까?\n다시 들어오려면 초대가 필요합니다."
      : "이 대화방을 목록에서 숨기시겠습니까?\n상대가 새 메시지를 보내거나 다시 대화를 시작하면 다시 나타납니다.";

    const doLeave = async () => {
      try {
        await leaveRoom.mutateAsync({ id });
        await queryClient.invalidateQueries({ queryKey: getListRoomsQueryKey() });
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(tabs)/chats");
        }
      } catch {
        if (Platform.OS === "web") {
          window.alert("채팅방을 나가지 못했습니다. 다시 시도해주세요.");
        } else {
          Alert.alert("오류", "채팅방을 나가지 못했습니다. 다시 시도해주세요.");
        }
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(message)) void doLeave();
    } else {
      Alert.alert("채팅방 나가기", message, [
        { text: "취소", style: "cancel" },
        { text: "나가기", style: "destructive", onPress: () => void doLeave() },
      ]);
    }
  }, [id, leaveRoom, room?.type, router, queryClient]);

  useEffect(() => {
    const timer = setInterval(() => refetch(), 3000);
    return () => clearInterval(timer);
  }, [refetch]);

  useEffect(() => {
    const timer = setInterval(() => refetchTyping(), 2000);
    return () => clearInterval(timer);
  }, [refetchTyping]);

  // Progressive reveal: the first load shows existing history at once; after
  // that, new dungeon DM/system lines stagger in one by one while the player's
  // own messages (and every non-dungeon message) appear immediately.
  useEffect(() => {
    if (messages.length === 0) return;
    const revealed = revealedIdsRef.current;
    if (!initializedRef.current) {
      for (const m of messages) revealed.add(m.id);
      initializedRef.current = true;
      setRevealTick((t) => t + 1);
      return;
    }
    const queued = new Set(revealQueueRef.current);
    let queuedAny = false;
    for (const m of messages) {
      if (revealed.has(m.id) || queued.has(m.id)) continue;
      const isDM = (m.sender as any)?.email === DM_EMAIL;
      const isTemp = String(m.id).startsWith("temp-");
      if (isDungeon && isDM && !isTemp) {
        revealQueueRef.current.push(m.id);
        queuedAny = true;
      } else {
        revealed.add(m.id);
      }
    }
    setRevealTick((t) => t + 1);
    if (queuedAny) pumpReveal();
  }, [messages, isDungeon, pumpReveal]);

  // Rotate the DM "thinking" flavor text while we wait for the AI.
  useEffect(() => {
    if (!dmThinking) return;
    setThinkIdx(0);
    const t = setInterval(
      () => setThinkIdx((i) => (i + 1) % DM_THINKING_LINES.length),
      1600,
    );
    return () => clearInterval(t);
  }, [dmThinking]);

  // Poll faster while waiting on the DM so the turn feels responsive.
  useEffect(() => {
    if (!isDungeon || !dmThinking) return;
    const t = setInterval(() => {
      void refetch();
      void refetchDungeon();
    }, 1200);
    return () => clearInterval(t);
  }, [isDungeon, dmThinking, refetch, refetchDungeon]);

  // Clear pending timers on unmount.
  useEffect(
    () => () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      if (dmThinkTimeoutRef.current) clearTimeout(dmThinkTimeoutRef.current);
    },
    [],
  );

  const visibleMessages = React.useMemo(
    () => {
      // Only dungeon DM narrative lines are intentionally staggered (revealed one
      // by one). Everything else — every non-dungeon message and the player's own
      // dungeon messages — must show immediately. Gating ALL messages on the
      // reveal set caused a one-frame flicker on send: refetch() swaps the
      // optimistic temp message for the real one, but the real id isn't in the
      // reveal set until the reveal effect runs (after render), so the bubble
      // briefly vanished and reappeared.
      if (!isDungeon) return messages;
      return messages.filter((m) => {
        if (revealedIdsRef.current.has(m.id)) return true;
        const isDM = (m.sender as any)?.email === DM_EMAIL;
        const isTemp = String(m.id).startsWith("temp-");
        return !(isDM && !isTemp);
      });
    },
    // revealTick re-derives the list as queued items are revealed.
    [messages, isDungeon, revealTick],
  );

  // Choices must never appear before the current turn's story. The dungeon-state
  // poll and the messages poll are independent, so a new turn's `choices` can
  // arrive before that turn's narrative bubble has been fetched or revealed —
  // especially for party members who didn't take the action (no local
  // `dmThinking`). The server stamps each turn's narrative message id into the
  // dungeon state, so we only show choices once that exact message is the last
  // one on screen. This is order-independent and works within the 50-message
  // window. Fall back to "last visible is a DM narrative" for sessions created
  // before the field existed (resolves itself after one more turn).
  const lastVisible = visibleMessages[visibleMessages.length - 1];
  const narrativeLanded =
    !!lastVisible &&
    lastVisible.type === "text" &&
    (lastVisible.sender as any)?.email === DM_EMAIL;
  const choicesSynced = dungeon?.lastNarrativeMessageId
    ? lastVisible?.id === dungeon.lastNarrativeMessageId
    : narrativeLanded;

  const goBack = React.useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/chats");
  }, [router]);

  const isDirect = room?.type === "direct";
  const otherMember = isDirect
    ? (room?.members as any[])?.find((m) => m.id !== me?.id)
    : null;
  const headerTitle =
    room?.name || (isDirect ? otherMember?.nickname ?? "채팅" : "채팅");
  const canCall = isDirect && callSupported && !!otherMember;
  const memberCount = (room?.members as any[])?.length ?? 0;
  const headerSubtitle = isGroupRoom
    ? `멤버 ${memberCount}명`
    : isDungeon
      ? "🎲 AI 던전 마스터"
      : "온라인";

  // Robustly pin the view to the newest message. scrollToEnd can fire before the
  // final layout settles (web especially, and when image bubbles resize on load),
  // leaving the latest message clipped — a double rAF runs it after paint.
  const scrollToBottom = React.useCallback((animated = false) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => flatRef.current?.scrollToEnd({ animated })),
    );
  }, []);

  // Drive the custom scroll thumb from onScroll. Web/PWA is the primary target and
  // react-native-web's ScrollView only emits onScroll (no onScrollBeginDrag /
  // onMomentumScrollEnd), so an idle-timer is the only cross-platform way to detect
  // "scrolling stopped". Thumb appears instantly (opacity → 1, no fade-in) while
  // moving and fades out shortly after the last frame. Geometry is set directly
  // (no re-render); only opacity is animated.
  const SCROLLBAR_PAD = 4;
  const SCROLLBAR_MIN_THUMB = 36;
  const hideScrollbarNow = React.useCallback(
    (animated: boolean) => {
      if (scrollbarHideTimer.current) {
        clearTimeout(scrollbarHideTimer.current);
        scrollbarHideTimer.current = null;
      }
      scrollbarVisibleRef.current = false;
      scrollbarOpacity.stopAnimation();
      if (animated) {
        Animated.timing(scrollbarOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      } else {
        scrollbarOpacity.setValue(0);
      }
    },
    [scrollbarOpacity],
  );
  const updateScrollbar = React.useCallback(
    (offsetY: number, contentH: number, viewH: number) => {
      if (contentH <= viewH + 1 || viewH <= 0) {
        // Content no longer scrollable — clear any lingering thumb immediately.
        if (scrollbarVisibleRef.current) hideScrollbarNow(false);
        return;
      }
      const trackH = Math.max(0, viewH - SCROLLBAR_PAD * 2);
      const thumbH = Math.max(SCROLLBAR_MIN_THUMB, (viewH / contentH) * trackH);
      const maxOffset = contentH - viewH;
      const maxThumbY = Math.max(0, trackH - thumbH);
      const ratio = maxOffset > 0 ? Math.min(1, Math.max(0, offsetY / maxOffset)) : 0;
      scrollThumbHeight.setValue(thumbH);
      scrollThumbY.setValue(SCROLLBAR_PAD + ratio * maxThumbY);
      if (!scrollbarVisibleRef.current) {
        scrollbarVisibleRef.current = true;
        scrollbarOpacity.stopAnimation();
        scrollbarOpacity.setValue(1);
      }
      if (scrollbarHideTimer.current) clearTimeout(scrollbarHideTimer.current);
      scrollbarHideTimer.current = setTimeout(() => hideScrollbarNow(true), 250);
    },
    [scrollThumbHeight, scrollThumbY, scrollbarOpacity, hideScrollbarNow],
  );

  useEffect(
    () => () => {
      if (scrollbarHideTimer.current) clearTimeout(scrollbarHideTimer.current);
    },
    [],
  );

  // On entering a room, keep the list hidden until the first jump-to-bottom has
  // painted, so the user never sees it snap from top to bottom. A timeout is a
  // safety net in case the size/layout callbacks don't fire (e.g. empty room).
  useEffect(() => {
    didInitialScrollRef.current = false;
    stickToBottomRef.current = true;
    entryCapturedRef.current = false;
    setCaptured(false);
    setAnchorMsgId(null);
    setShowScrollDown(false);
    setListReady(false);
    hideScrollbarNow(false);
    const t = setTimeout(() => setListReady(true), 1500);
    return () => clearTimeout(t);
  }, [id, hideScrollbarNow]);

  // Capture the entry read-position ONCE, before markRead advances the pointer.
  // The first unread message id becomes the anchor; null means open at bottom.
  useEffect(() => {
    if (entryCapturedRef.current) return;
    if (!room || visibleMessages.length === 0) return;
    entryCapturedRef.current = true;
    const unread = room.unreadCount ?? 0;
    let anchor: string | null = null;
    if (!isDungeon && unread > 0) {
      const fid = room.firstUnreadMessageId ?? null;
      if (fid && visibleMessages.some((m) => m.id === fid)) {
        // Exact first-unread id is in the loaded window — anchor on it.
        anchor = fid;
      } else if (fid) {
        // First unread is older than the loaded window ⇒ everything visible is
        // unread, so anchor at the very first loaded message.
        anchor = visibleMessages[0]?.id ?? null;
      }
    }
    setAnchorMsgId(anchor);
    setCaptured(true);
  }, [room, visibleMessages, isDungeon]);

  // Position the (still-invisible) list at the anchor BEFORE revealing it, so the
  // user never sees a jump from bottom to the unread line. Runs once capture is
  // done; reveals the list only after the scroll has settled.
  useEffect(() => {
    if (!captured || didInitialScrollRef.current) return;
    if (visibleMessages.length === 0) return;
    didInitialScrollRef.current = true;
    // aIdx >= 0 means we have a real unread anchor (index 0 is valid — the first
    // loaded message itself can be the first unread). Only a null anchorMsgId
    // (no unread) means "open at the bottom".
    const aIdx = anchorMsgId
      ? visibleMessages.findIndex((m) => m.id === anchorMsgId)
      : -1;
    const hasAnchor = aIdx >= 0;
    // Decide stickiness synchronously (before any paint) so a content-size event
    // firing in this window can't yank the anchored view down to the bottom.
    stickToBottomRef.current = !hasAnchor;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (hasAnchor) {
          try {
            flatRef.current?.scrollToIndex({ index: aIdx, animated: false, viewPosition: 0.2 });
          } catch {
            flatRef.current?.scrollToEnd({ animated: false });
          }
          setShowScrollDown(true);
        } else {
          flatRef.current?.scrollToEnd({ animated: false });
        }
        requestAnimationFrame(() => setListReady(true));
      }),
    );
  }, [captured, anchorMsgId, visibleMessages]);

  useEffect(() => {
    // Follow new messages only when the user is parked near the bottom; if they've
    // scrolled up to read history, leave their position alone (Telegram behavior).
    // Skip until the initial anchor positioning is done so we never override it.
    if (!didInitialScrollRef.current) return;
    if (visibleMessages.length > 0 && stickToBottomRef.current) scrollToBottom(false);
  }, [visibleMessages.length, scrollToBottom]);

  // The newest persisted (non-temp) message id. Marking read off THIS — not just
  // messages.length — is what keeps the read receipt in sync: length can stay
  // flat when an optimistic temp message is swapped for its real row, which used
  // to skip marking the freshly-arrived message read. Temp ids are excluded
  // because they don't exist server-side and would corrupt the read pointer.
  const lastRealMessageId = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (!String(messages[i].id).startsWith("temp-")) return messages[i].id;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (!me || !lastRealMessageId) return;
    markRead.mutate(
      { id, data: { messageId: lastRealMessageId } },
      {
        onSuccess: () => {
          // Reading a room advances the server read pointer, but — unlike sending
          // a message — nothing refreshes the rooms list, so the unread "1" badge
          // would linger until the next 5s poll (it only cleared instantly when
          // the user sent something). Invalidate the list so it clears on read.
          void queryClient.invalidateQueries({ queryKey: getListRoomsQueryKey() });
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRealMessageId, id, me?.id]);

  // On web/PWA the OS push fires the instant a message is inserted, but this
  // screen only polls every 3s — so the banner/sound would beat the on-screen
  // message. When the service worker reports a push for THIS room, refetch right
  // away so the message lands in step with the notification.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (data?.type !== "data-changed") return;
      // Only react to a push for THIS room. Non-chat pushes (friend request, etc.)
      // carry no roomId, so this also skips needless refetches for them.
      if (data.roomId !== id) return;
      void refetch();
      // Dungeon HP/choices live in a separate query — keep them in lockstep so the
      // party panel doesn't lag the freshly-refetched message lines.
      if (isDungeon) void refetchDungeon();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [id, refetch, isDungeon, refetchDungeon]);

  // Sending any of my own messages (text/sticker/image/file) always snaps me
  // back to the bottom, regardless of where I'd scrolled — matches Telegram.
  const forceStickToBottom = React.useCallback(() => {
    stickToBottomRef.current = true;
    setShowScrollDown(false);
  }, []);

  // Sends a text message (also used by dungeon choice buttons). Returns true on
  // success; the composer restores its input on false so the user never loses a
  // message. Text state itself lives in <MessageComposer> so typing doesn't
  // re-render this screen (and its message list) on every keystroke.
  const sendText = React.useCallback(
    async (content: string): Promise<boolean> => {
      const trimmed = content.trim();
      if (!trimmed || sendMessage.isPending) return false;
      forceStickToBottom();

      if (isDungeon) {
        setDmThinking(true);
        if (dmThinkTimeoutRef.current) clearTimeout(dmThinkTimeoutRef.current);
        dmThinkTimeoutRef.current = setTimeout(() => setDmThinking(false), 30000);

        // No premature "strike" effect here. Enemy HP is server-authoritative, so
        // flashing/shaking the enemy on tap (before the AI resolves the turn) shows
        // a hit with no HP change, then a *second* hit when the turn lands — the
        // jarring double-strike. Responsiveness comes from the instant optimistic
        // user message + the "DM thinking" indicator; the single combat beat (flash
        // + shake + HP drain) fires once on turn resolve, when damage is real.
      }

      const key = getFetchRoomMessagesQueryKey(id);
      const tempId = `temp-${Date.now()}`;
      const optimistic: Message & { _pending?: boolean } = {
        id: tempId,
        roomId: id,
        senderId: me?.id ?? "",
        type: "text",
        content: trimmed,
        createdAt: new Date().toISOString(),
        readCount: 0,
        sender: (me as any) ?? null,
        _pending: true,
      };
      queryClient.setQueryData<Message[]>(key, (old = []) => [...old, optimistic]);

      try {
        const created = await sendMessage.mutateAsync({ id, data: { content: trimmed, type: "text" } });
        if (created?.id) clientKeyRef.current.set(created.id, tempId);
        await refetch();
        return true;
      } catch {
        clearDmThinking();
        queryClient.setQueryData<Message[]>(key, (old = []) =>
          old.filter((m) => m.id !== tempId),
        );
        crossAlert("오류", "메시지를 보내지 못했습니다. 다시 시도해주세요.");
        return false;
      }
    },
    [id, isDungeon, me, queryClient, refetch, sendMessage, forceStickToBottom, clearDmThinking],
  );

  // Fired by the composer (already throttled there) while the user types.
  const handleTyping = React.useCallback(() => {
    setTyping.mutate({ id });
  }, [id, setTyping]);

  const handleSendSticker = async (code: string) => {
    if (sendMessage.isPending) return;
    forceStickToBottom();
    const key = getFetchRoomMessagesQueryKey(id);
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message & { _pending?: boolean } = {
      id: tempId,
      roomId: id,
      senderId: me?.id ?? "",
      type: "sticker",
      content: code,
      createdAt: new Date().toISOString(),
      readCount: 0,
      sender: (me as any) ?? null,
      _pending: true,
    };
    queryClient.setQueryData<Message[]>(key, (old = []) => [...old, optimistic]);

    try {
      const created = await sendMessage.mutateAsync({ id, data: { content: code, type: "sticker" } });
      if (created?.id) clientKeyRef.current.set(created.id, tempId);
      await refetch();
    } catch {
      queryClient.setQueryData<Message[]>(key, (old = []) =>
        old.filter((m) => m.id !== tempId),
      );
      crossAlert("오류", "스티커를 보내지 못했습니다. 다시 시도해주세요.");
    }
  };

  const handlePickImage = async () => {
    if (uploading || sendMessage.isPending) return;
    setUploading("image");
    try {
      const picked = await pickAndUploadImage();
      if (!picked) return;

      forceStickToBottom();
      const key = getFetchRoomMessagesQueryKey(id);
      const tempId = `temp-${Date.now()}`;
      const optimistic: Message & { _pending?: boolean } = {
        id: tempId,
        roomId: id,
        senderId: me?.id ?? "",
        type: "image",
        content: picked.objectPath,
        createdAt: new Date().toISOString(),
        readCount: 0,
        sender: (me as any) ?? null,
        _pending: true,
      };
      queryClient.setQueryData<Message[]>(key, (old = []) => [...old, optimistic]);

      try {
        const created = await sendMessage.mutateAsync({ id, data: { content: picked.objectPath, type: "image" } });
        if (created?.id) clientKeyRef.current.set(created.id, tempId);
        await refetch();
      } catch {
        queryClient.setQueryData<Message[]>(key, (old = []) =>
          old.filter((m) => m.id !== tempId),
        );
        crossAlert("오류", "사진을 보내지 못했습니다. 다시 시도해주세요.");
      }
    } catch (e) {
      if (e instanceof PermissionDeniedError) {
        crossAlert("권한 필요", "사진을 보내려면 사진 접근 권한을 허용해주세요.");
      } else {
        crossAlert("오류", "사진을 보내지 못했습니다. 다시 시도해주세요.");
      }
    } finally {
      setUploading(null);
    }
  };

  const handlePickFile = async () => {
    if (uploading || sendMessage.isPending) return;
    setUploading("file");
    try {
      const picked = await pickAndUploadFile();
      if (!picked) return;

      const content = encodeFileContent({
        path: picked.objectPath,
        name: picked.name,
        size: picked.size,
        mime: picked.mimeType,
      });

      forceStickToBottom();
      const key = getFetchRoomMessagesQueryKey(id);
      const tempId = `temp-${Date.now()}`;
      const optimistic: Message & { _pending?: boolean } = {
        id: tempId,
        roomId: id,
        senderId: me?.id ?? "",
        type: "file",
        content,
        createdAt: new Date().toISOString(),
        readCount: 0,
        sender: (me as any) ?? null,
        _pending: true,
      };
      queryClient.setQueryData<Message[]>(key, (old = []) => [...old, optimistic]);

      try {
        const created = await sendMessage.mutateAsync({ id, data: { content, type: "file" } });
        if (created?.id) clientKeyRef.current.set(created.id, tempId);
        await refetch();
      } catch {
        queryClient.setQueryData<Message[]>(key, (old = []) =>
          old.filter((m) => m.id !== tempId),
        );
        crossAlert("오류", "파일을 보내지 못했습니다. 다시 시도해주세요.");
      }
    } catch (e) {
      if (e instanceof FileTooLargeError) {
        crossAlert("파일 크기 초과", "파일 크기는 25MB를 초과할 수 없습니다.");
      } else {
        crossAlert("오류", "파일을 보내지 못했습니다. 다시 시도해주세요.");
      }
    } finally {
      setUploading(null);
    }
  };

  // Stable handler for the in-chat call card so memoized message bubbles don't
  // re-render every poll.
  const handleJoinCall = React.useCallback(
    (cid: string) => joinFromCard(cid, otherMember?.nickname ?? "상대방"),
    [joinFromCard, otherMember?.nickname],
  );

  const typingLabel =
    typingUsers.length === 0
      ? null
      : typingUsers.length === 1
        ? `${typingUsers[0].nickname}님이 입력 중...`
        : `${typingUsers[0].nickname}님 외 ${typingUsers.length - 1}명이 입력 중...`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 6, borderBottomColor: colors.border },
        ]}
      >
        <Pressable
          onPress={goBack}
          hitSlop={10}
          style={({ pressed }) => [styles.headerBack, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="chevron-left" size={28} color={colors.foreground} />
        </Pressable>

        <View style={styles.headerCenter}>
          <View>
            {isGroupRoom || isDungeon ? (
              <View style={[styles.headerIconAvatar, { backgroundColor: colors.accent }]}>
                <Feather
                  name={isDungeon ? "compass" : "users"}
                  size={19}
                  color={colors.primary}
                />
              </View>
            ) : (
              <Avatar uri={otherMember?.profileImageUrl} name={headerTitle} size={40} />
            )}
            {isDirect ? (
              <View
                style={[
                  styles.onlineDot,
                  { backgroundColor: colors.online, borderColor: colors.background },
                ]}
              />
            ) : null}
          </View>
          <View style={styles.headerTextWrap}>
            <View style={styles.headerNameRow}>
              <Text
                style={[styles.headerName, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {headerTitle}
              </Text>
              {isDirect ? (
                <View style={[styles.nameDot, { backgroundColor: colors.online }]} />
              ) : null}
            </View>
            <Text
              style={[styles.headerSubtitle, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              {headerSubtitle}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {canCall ? (
            <Pressable
              hitSlop={10}
              onPress={() => startCall(otherMember.id, otherMember.nickname ?? "상대방", id)}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Feather name="phone" size={22} color={colors.foreground} />
            </Pressable>
          ) : null}
          {isGroupRoom ? (
            <Pressable
              hitSlop={10}
              onPress={() => router.push({ pathname: "/group/invite", params: { id } })}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Feather name="user-plus" size={22} color={colors.foreground} />
            </Pressable>
          ) : null}
          <Pressable
            hitSlop={10}
            onPress={handleLeave}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Feather name="more-horizontal" size={24} color={colors.foreground} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
      {isDungeon ? (
        <DungeonPartyStrip data={dungeon} enemyShakeToken={enemyShakeToken} />
      ) : null}
      <FlatList
        ref={flatRef}
        data={visibleMessages}
        keyExtractor={(item) => clientKeyRef.current.get(item.id) ?? item.id}
        style={[styles.flex, { opacity: listReady ? 1 : 0 }]}
        contentContainerStyle={[styles.messageList, { paddingBottom: 16 }]}
        ListEmptyComponent={
          isDungeon ? (
            <EmptyState
              icon="compass"
              title="던전의 문이 열리는 중..."
              subtitle="던전 마스터가 첫 장면을 준비하고 있습니다."
            />
          ) : (
            <EmptyState
              icon="message-circle"
              title="아직 메시지가 없습니다"
              subtitle="첫 번째 메시지를 보내보세요"
            />
          )
        }
        renderItem={({ item, index }) => {
          const isMe = item.senderId === me?.id;
          const isDM = (item.sender as any)?.email === DM_EMAIL;
          const prevMsg = visibleMessages[index - 1];
          const showSender = isMultiParty && !isMe && !isDM && prevMsg?.senderId !== item.senderId;
          const showDate =
            !prevMsg || !isSameDay(prevMsg.createdAt, item.createdAt);
          let readLabel: string | undefined;
          if (isMe && !isDungeon) {
            if ((item as any)._pending) {
              readLabel = "전송 중";
            } else if (otherCount > 0) {
              const readCount = item.readCount ?? 0;
              if (isGroupRoom) {
                const unread = Math.max(0, otherCount - readCount);
                readLabel = unread > 0 ? `안읽음 ${unread}` : "읽음";
              } else {
                readLabel = readCount >= 1 ? "읽음" : "안읽음";
              }
            }
          }
          const bubble = (
            <>
              {item.id === anchorMsgId ? (
                <View style={styles.unreadDivider}>
                  <View style={[styles.unreadLine, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.unreadText, { color: colors.primary }]}>
                    새 메시지
                  </Text>
                  <View style={[styles.unreadLine, { backgroundColor: colors.primary }]} />
                </View>
              ) : null}
              {showDate ? (
                <View style={styles.dateRow}>
                  <View style={[styles.datePill, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
                      {formatDayLabel(item.createdAt)}
                    </Text>
                  </View>
                </View>
              ) : null}
              <MessageBubble
                content={item.content}
                isMe={isMe}
                isDM={isDM}
                senderName={(item.sender as any)?.nickname}
                senderAvatar={(item.sender as any)?.profileImageUrl}
                time={formatMsgTime(item.createdAt)}
                type={item.type}
                imageUri={item.type === "image" ? mediaUri(item.content) : undefined}
                showSender={showSender}
                readLabel={readLabel}
                onJoinCall={handleJoinCall}
              />
            </>
          );
          // In dungeons, freshly-revealed lines fade/slide in; history and
          // non-dungeon messages render instantly.
          return isDungeon ? (
            <FadeInView animate={staggeredIdsRef.current.has(item.id)}>{bubble}</FadeInView>
          ) : (
            <View>{bubble}</View>
          );
        }}
        ListFooterComponent={
          isDungeon ? (
            <View style={styles.footerWrap}>
              {dmThinking ? (
                <View style={styles.thinkingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.thinkingText, { color: colors.mutedForeground }]}>
                    {DM_THINKING_LINES[thinkIdx]}
                  </Text>
                </View>
              ) : null}
              {!dmThinking &&
              revealQueueRef.current.length === 0 &&
              choicesSynced &&
              !dungeon?.ended &&
              (dungeon?.choices?.length ?? 0) > 0 ? (
                <View style={styles.choicesInline}>
                  {dungeon!.choices.map((c, i) => (
                    <FadeInView key={`${i}-${c}`} delay={i * 160}>
                      <Pressable
                        onPress={() => void sendText(c)}
                        disabled={sendMessage.isPending}
                        style={({ pressed }) => [
                          styles.choiceLine,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                            opacity: pressed || sendMessage.isPending ? 0.55 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.choiceBullet, { color: colors.primary }]}>›</Text>
                        <Text style={[styles.choiceLineText, { color: colors.foreground }]}>{c}</Text>
                      </Pressable>
                    </FadeInView>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null
        }
        onScrollToIndexFailed={(info) => {
          // Variable row heights can make the target index unmeasured on first
          // try. Retry after layout settles; fall back to the bottom if it still
          // fails, then reveal so the user is never stuck on a hidden list.
          setTimeout(() => {
            try {
              flatRef.current?.scrollToIndex({
                index: info.index,
                animated: false,
                viewPosition: 0.2,
              });
            } catch {
              flatRef.current?.scrollToEnd({ animated: false });
            }
            requestAnimationFrame(() => setListReady(true));
          }, 60);
        }}
        onContentSizeChange={() => {
          // Initial positioning is owned by the anchor effect (it may target the
          // first unread message, not the bottom). Here we only re-pin to the
          // bottom on content growth when the user is already near it — otherwise
          // polling/label changes would yank them down mid-read (the "팅김").
          if (didInitialScrollRef.current && stickToBottomRef.current) {
            scrollToBottom(false);
          }
        }}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const distanceFromBottom =
            contentSize.height - (contentOffset.y + layoutMeasurement.height);
          const nearBottom = distanceFromBottom < 120;
          stickToBottomRef.current = nearBottom;
          setShowScrollDown((prev) => (prev === !nearBottom ? prev : !nearBottom));
          // Only after the list is revealed — keeps the entry positioning scroll
          // (still-hidden list) from flashing the thumb.
          if (listReady)
            updateScrollbar(contentOffset.y, contentSize.height, layoutMeasurement.height);
        }}
        scrollEventThrottle={16}
        onLayout={(e) => {
          const { y, height } = e.nativeEvent.layout;
          setScrollTrack((prev) =>
            prev.top === y && prev.height === height ? prev : { top: y, height },
          );
          if (stickToBottomRef.current) scrollToBottom(false);
        }}
      />

      {scrollTrack.height > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scrollbarTrack,
            { top: scrollTrack.top, height: scrollTrack.height, opacity: scrollbarOpacity },
          ]}
        >
          <Animated.View
            style={[
              styles.scrollbarThumb,
              {
                backgroundColor: colors.mutedForeground,
                height: scrollThumbHeight,
                transform: [{ translateY: scrollThumbY }],
              },
            ]}
          />
        </Animated.View>
      ) : null}

      {showScrollDown ? (
        <Pressable
          onPress={() => {
            stickToBottomRef.current = true;
            setShowScrollDown(false);
            scrollToBottom(true);
          }}
          style={[
            styles.scrollDownBtn,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          hitSlop={8}
        >
          <Feather name="chevron-down" size={22} color={colors.foreground} />
        </Pressable>
      ) : null}

      {typingLabel ? (
        <View style={styles.typingRow}>
          <Text
            style={[styles.typingText, { color: colors.mutedForeground }]}
            numberOfLines={1}
          >
            {typingLabel}
          </Text>
        </View>
      ) : null}

      {/* Dungeon is played entirely via the AI's choice buttons — no free-text
          input bar. Every other room keeps the composer. The composer owns its
          own text state so typing never re-renders this screen / message list. */}
      {!isDungeon ? (
        <MessageComposer
          sending={sendMessage.isPending}
          uploading={uploading}
          onSend={sendText}
          onTyping={handleTyping}
          onPickImage={handlePickImage}
          onPickFile={handlePickFile}
          onSendSticker={handleSendSticker}
        />
      ) : null}
      </KeyboardAvoidingView>
      <Animated.View
        pointerEvents="none"
        style={[styles.flash, { opacity: flashOpacity }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.flashEnemy, { opacity: enemyFlashOpacity }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBack: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIconAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  onlineDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  headerTextWrap: {
    flex: 1,
    gap: 1,
  },
  headerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerName: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  nameDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 8,
  },
  messageList: { paddingTop: 12, flexGrow: 1, justifyContent: "flex-end" },
  dateRow: {
    alignItems: "center",
    marginVertical: 12,
  },
  datePill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
  },
  dateText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  typingRow: {
    paddingHorizontal: 18,
    paddingBottom: 4,
  },
  typingText: {
    fontSize: 12,
    fontStyle: "italic",
    fontFamily: "Inter_400Regular",
  },
  unreadDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 12,
    paddingHorizontal: 16,
  },
  unreadLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    opacity: 0.5,
  },
  unreadText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  scrollbarTrack: {
    position: "absolute",
    right: 2,
    width: 4,
  },
  scrollbarThumb: {
    position: "absolute",
    left: 0,
    right: 0,
    width: 4,
    borderRadius: 2,
    opacity: 0.55,
  },
  scrollDownBtn: {
    position: "absolute",
    right: 16,
    bottom: 84,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FF3B30",
    zIndex: 50,
  },
  flashEnemy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#34C759",
    zIndex: 50,
  },
  footerWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  thinkingText: {
    fontSize: 13,
    fontStyle: "italic",
    fontFamily: "Inter_400Regular",
  },
  choicesInline: {
    gap: 8,
    paddingTop: 4,
    paddingBottom: 6,
  },
  choiceLine: {
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  choiceBullet: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: "Inter_600SemiBold",
  },
  choiceLineText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
  },
});
