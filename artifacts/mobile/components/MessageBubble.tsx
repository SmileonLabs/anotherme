import React, { useState } from "react";
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Avatar } from "./Avatar";
import { StickerImage } from "./StickerImage";
import { useColors } from "@/hooks/useColors";
import { mediaUri } from "@/lib/apiBase";
import { parseFileContent, formatFileSize } from "@/lib/fileMessage";

const IMAGE_WIDTH = 220;
const IMAGE_MAX_HEIGHT = 300;
const STICKER_SIZE = 128;

interface MessageBubbleProps {
  content: string;
  isMe: boolean;
  type?: string;
  imageUri?: string;
  senderName?: string;
  senderAvatar?: string | null;
  time: string;
  showSender?: boolean;
  readLabel?: string;
  isDM?: boolean;
  onJoinCall?: (callId: string) => void;
}

// A "call" message carries { callId, status } JSON so the in-chat card can show
// a "통화 참여" button while ringing/active and flip to "통화 종료" once finished.
function parseCallContent(raw: string): { callId: string; status: string } | null {
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.callId === "string" && typeof obj.status === "string") {
      return { callId: obj.callId, status: obj.status };
    }
  } catch {}
  return null;
}

function MessageBubbleComponent({
  content,
  isMe,
  type = "text",
  imageUri,
  senderName,
  senderAvatar,
  time,
  showSender = false,
  readLabel,
  isDM = false,
  onJoinCall,
}: MessageBubbleProps) {
  const colors = useColors();
  const isImage = type === "image" && !!imageUri;
  const isSticker = type === "sticker";
  const fileMeta = type === "file" ? parseFileContent(content) : null;
  const [aspect, setAspect] = useState(1);

  // System lines (dungeon state changes) read as small centered notices, not
  // chat bubbles.
  if (type === "system") {
    return (
      <View style={styles.systemRow}>
        <Text style={[styles.systemText, { color: colors.mutedForeground }]}>{content}</Text>
      </View>
    );
  }

  // Voice-call card: a centered notice either party can tap to join, shown for
  // both caller and callee so the call can be (re)entered from the conversation.
  if (type === "call") {
    const call = parseCallContent(content);
    const ended = !call || call.status === "ended";
    const title = ended ? "보이스톡 종료" : isMe ? "보이스톡 발신" : "보이스톡 수신";
    return (
      <View style={styles.callRow}>
        <View style={[styles.callCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.callIcon, { backgroundColor: ended ? colors.muted : colors.accent }]}>
            <Feather
              name={ended ? "phone-off" : "phone-call"}
              size={18}
              color={ended ? colors.mutedForeground : colors.primary}
            />
          </View>
          <View style={styles.callInfo}>
            <Text style={[styles.callTitle, { color: colors.foreground }]}>{title}</Text>
            <Text style={[styles.callTime, { color: colors.mutedForeground }]}>{time}</Text>
          </View>
          {!ended && call && onJoinCall ? (
            <Pressable
              onPress={() => onJoinCall(call.callId)}
              style={({ pressed }) => [
                styles.callJoinBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Feather name="phone" size={14} color={colors.primaryForeground} />
              <Text style={[styles.callJoinText, { color: colors.primaryForeground }]}>
                통화 참여
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  const openImage = () => {
    if (!imageUri) return;
    if (Platform.OS === "web") {
      window.open(imageUri, "_blank");
    } else {
      Linking.openURL(imageUri).catch(() => {});
    }
  };

  const openFile = () => {
    if (!fileMeta) return;
    const uri = mediaUri(fileMeta.path);
    if (Platform.OS === "web") {
      const a = document.createElement("a");
      a.href = uri;
      a.download = fileMeta.name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      Linking.openURL(uri).catch(() => {});
    }
  };

  // The AI Dungeon Master narrates in a distinct full-width "parchment" card so
  // its storytelling reads differently from ordinary chat bubbles.
  if (isDM) {
    return (
      <View style={styles.dmRow}>
        <View
          style={[
            styles.dmCard,
            { backgroundColor: colors.accent, borderLeftColor: colors.primary },
          ]}
        >
          <View style={styles.dmHeader}>
            <Text style={styles.dmEmoji}>🎲</Text>
            <Text style={[styles.dmLabel, { color: colors.accentForeground }]}>
              던전 마스터
            </Text>
            <Text style={[styles.dmTime, { color: colors.mutedForeground }]}>{time}</Text>
          </View>
          <Text style={[styles.dmText, { color: colors.foreground }]}>{content}</Text>
        </View>
      </View>
    );
  }

  const meta = (
    <View style={[styles.metaSide, isMe ? styles.metaSideMe : styles.metaSideOther]}>
      {isMe && readLabel ? (
        <Text style={[styles.read, { color: colors.primary }]}>{readLabel}</Text>
      ) : null}
      <Text style={[styles.time, { color: colors.mutedForeground }]}>{time}</Text>
    </View>
  );

  const body = isSticker ? (
    <View style={[styles.sticker, isMe ? styles.stickerMe : styles.stickerOther]}>
      <StickerImage code={content} size={STICKER_SIZE} />
    </View>
  ) : isImage ? (
    <Pressable
      onPress={openImage}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Image
        source={{ uri: imageUri }}
        style={[
          styles.image,
          {
            width: IMAGE_WIDTH,
            height: Math.min(IMAGE_WIDTH / aspect, IMAGE_MAX_HEIGHT),
            backgroundColor: colors.muted,
          },
        ]}
        resizeMode="cover"
        onLoad={(e) => {
          const src: any = e.nativeEvent?.source;
          if (src?.width && src?.height) setAspect(src.width / src.height);
        }}
      />
    </Pressable>
  ) : fileMeta ? (
    <Pressable
      onPress={openFile}
      style={({ pressed }) => [
        styles.fileCard,
        {
          backgroundColor: isMe ? colors.myBubble : colors.otherBubble,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.fileIcon,
          { backgroundColor: isMe ? "rgba(255,255,255,0.18)" : colors.muted },
        ]}
      >
        <Feather name="file" size={22} color={isMe ? colors.myBubbleText : colors.foreground} />
      </View>
      <View style={styles.fileInfo}>
        <Text
          numberOfLines={1}
          style={[styles.fileName, { color: isMe ? colors.myBubbleText : colors.otherBubbleText }]}
        >
          {fileMeta.name}
        </Text>
        {formatFileSize(fileMeta.size) ? (
          <Text
            style={[
              styles.fileSize,
              {
                color: isMe ? colors.myBubbleText : colors.mutedForeground,
                opacity: isMe ? 0.8 : 1,
              },
            ]}
          >
            {formatFileSize(fileMeta.size)}
          </Text>
        ) : null}
      </View>
      <Feather
        name="download"
        size={18}
        color={isMe ? colors.myBubbleText : colors.mutedForeground}
      />
    </Pressable>
  ) : (
    <View
      style={[
        styles.bubble,
        isMe
          ? [styles.bubbleMe, { backgroundColor: colors.myBubble }]
          : [styles.bubbleOther, { backgroundColor: colors.otherBubble }],
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: isMe ? colors.myBubbleText : colors.otherBubbleText },
        ]}
      >
        {content}
      </Text>
    </View>
  );

  return (
    <View style={[styles.row, isMe ? styles.rowMe : styles.rowOther]}>
      {!isMe && (
        <Avatar uri={senderAvatar} name={senderName ?? "?"} size={32} />
      )}
      <View style={[styles.bubbleWrap, isMe && styles.bubbleWrapMe]}>
        {!isMe && showSender && senderName ? (
          <Text style={[styles.senderName, { color: colors.mutedForeground }]}>{senderName}</Text>
        ) : null}
        <View style={[styles.bubbleLine, isMe && styles.bubbleLineMe]}>
          {isMe ? meta : null}
          <View style={styles.bodyWrap}>{body}</View>
          {!isMe ? meta : null}
        </View>
      </View>
    </View>
  );
}

// Memoized so a parent re-render (e.g. the chat screen's 3s poll, or any state
// change) doesn't re-render every visible bubble — only ones whose props change.
// Props are primitives derived from the message + a stable onJoinCall callback,
// so shallow comparison is correct. Theme changes still flow via useColors().
export const MessageBubble = React.memo(MessageBubbleComponent);

const styles = StyleSheet.create({
  systemRow: {
    alignItems: "center",
    paddingHorizontal: 24,
    marginVertical: 6,
  },
  systemText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 17,
  },
  callRow: {
    alignItems: "center",
    paddingHorizontal: 24,
    marginVertical: 6,
  },
  callCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
    paddingHorizontal: 12,
    maxWidth: 300,
  },
  callIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  callInfo: {
    gap: 2,
  },
  callTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  callTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  callJoinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 13,
    marginLeft: 4,
  },
  callJoinText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  dmRow: {
    paddingHorizontal: 12,
    marginVertical: 5,
  },
  dmCard: {
    borderRadius: 14,
    borderLeftWidth: 3,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 6,
  },
  dmHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dmEmoji: {
    fontSize: 14,
  },
  dmLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  dmTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  dmText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 23,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginVertical: 2,
    paddingHorizontal: 12,
    gap: 8,
  },
  rowMe: {
    justifyContent: "flex-end",
  },
  rowOther: {
    justifyContent: "flex-start",
  },
  bubbleWrap: {
    maxWidth: "82%",
    gap: 3,
  },
  bubbleWrapMe: {
    alignItems: "flex-end",
  },
  bubbleLine: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  bubbleLineMe: {
    justifyContent: "flex-end",
  },
  bodyWrap: {
    flexShrink: 1,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
  },
  bubbleMe: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderBottomLeftRadius: 4,
  },
  image: {
    borderRadius: 14,
    maxWidth: "100%",
  },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    maxWidth: 250,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  fileInfo: {
    flexShrink: 1,
  },
  fileName: {
    fontSize: 15,
    fontWeight: "600",
  },
  fileSize: {
    fontSize: 12,
    marginTop: 2,
  },
  sticker: {
    paddingVertical: 2,
  },
  stickerMe: {
    alignItems: "flex-end",
  },
  stickerOther: {
    alignItems: "flex-start",
  },
  text: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  senderName: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginLeft: 4,
  },
  metaSide: {
    justifyContent: "flex-end",
    paddingBottom: 2,
    gap: 1,
  },
  metaSideMe: {
    alignItems: "flex-end",
  },
  metaSideOther: {
    alignItems: "flex-start",
  },
  time: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  read: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
});
