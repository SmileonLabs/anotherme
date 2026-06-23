import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StickerPicker } from "./StickerPicker";
import { useColors } from "@/hooks/useColors";
import { usePwaBottomInset } from "@/hooks/usePwaBottomInset";

interface MessageComposerProps {
  /** Whether a send mutation is currently in flight (disables the composer). */
  sending: boolean;
  /** Whether an image/file upload is in progress, for the inline spinners. */
  uploading: "image" | "file" | null;
  placeholder?: string;
  /**
   * Sends the trimmed text. Returns true on success; on false the composer
   * restores the text so the user doesn't lose their message.
   */
  onSend: (content: string) => Promise<boolean>;
  /** Fired (already throttled here) while the user is typing. */
  onTyping: () => void;
  onPickImage: () => void;
  onPickFile: () => void;
  onSendSticker: (code: string) => void;
}

/**
 * The chat input bar lives in its own component with LOCAL text state so that
 * each keystroke only re-renders the composer — never the parent chat screen or
 * its (potentially large) message list. This is the fix for typing lag: when
 * `text` lived on the chat screen, every character re-rendered every message
 * bubble.
 */
function MessageComposerComponent({
  sending,
  uploading,
  placeholder = "메시지",
  onSend,
  onTyping,
  onPickImage,
  onPickFile,
  onSendSticker,
}: MessageComposerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const pwaBottom = usePwaBottomInset();
  const [text, setText] = useState("");
  const [showStickers, setShowStickers] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const lastTypingSentRef = useRef(0);

  const submit = useCallback(async () => {
    const content = text.trim();
    if (!content || sending) return;
    setText("");
    lastTypingSentRef.current = 0;
    const ok = await onSend(content);
    if (!ok) setText(content);
  }, [text, sending, onSend]);

  const handleChangeText = useCallback(
    (value: string) => {
      setText(value);
      if (!value.trim()) return;
      const now = Date.now();
      if (now - lastTypingSentRef.current > 2000) {
        lastTypingSentRef.current = now;
        onTyping();
      }
    },
    [onTyping],
  );

  // Telegram-style emoji/keyboard toggle: opening the sticker panel dismisses the
  // soft keyboard so the panel takes its place; closing it restores the keyboard.
  const toggleStickers = useCallback(() => {
    if (showStickers) {
      setShowStickers(false);
      inputRef.current?.focus();
    } else {
      inputRef.current?.blur();
      Keyboard.dismiss();
      setShowStickers(true);
    }
  }, [showStickers]);

  // Web: Enter sends, Shift+Enter inserts a newline.
  const handleKeyPress = useCallback(
    (e: any) => {
      if (Platform.OS !== "web") return;
      const key = e?.key ?? e?.nativeEvent?.key;
      const isShift = !!(e?.shiftKey ?? e?.nativeEvent?.shiftKey);
      if (key === "Enter" && !isShift) {
        e.preventDefault?.();
        void submit();
      }
    },
    [submit],
  );

  const hasText = text.trim().length > 0;

  return (
    <>
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: (insets.bottom > 0 ? insets.bottom : 10) + pwaBottom,
          },
        ]}
      >
        <View style={[styles.inputField, { backgroundColor: colors.input }]}>
          <Pressable
            style={({ pressed }) => [styles.fieldBtn, { opacity: pressed ? 0.5 : 1 }]}
            onPress={toggleStickers}
            hitSlop={6}
          >
            {showStickers ? (
              <MaterialCommunityIcons
                name="keyboard-outline"
                size={24}
                color={colors.primary}
              />
            ) : (
              <Feather name="smile" size={23} color={colors.mutedForeground} />
            )}
          </Pressable>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.foreground }]}
            value={text}
            onChangeText={handleChangeText}
            onKeyPress={handleKeyPress}
            onFocus={() => setShowStickers(false)}
            placeholder={placeholder}
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={1}
            maxLength={2000}
            blurOnSubmit={false}
          />
          <Pressable
            style={({ pressed }) => [styles.fieldBtn, { opacity: pressed ? 0.5 : 1 }]}
            onPress={onPickImage}
            disabled={!!uploading || sending}
            hitSlop={6}
          >
            {uploading === "image" ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="image" size={22} color={colors.mutedForeground} />
            )}
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.fieldBtn, styles.fieldBtnLast, { opacity: pressed ? 0.5 : 1 }]}
            onPress={onPickFile}
            disabled={!!uploading || sending}
            hitSlop={6}
          >
            {uploading === "file" ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="paperclip" size={22} color={colors.mutedForeground} />
            )}
          </Pressable>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.sendBtn,
            {
              backgroundColor: hasText ? colors.primary : colors.muted,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          onPress={() => void submit()}
          disabled={!hasText || sending}
        >
          <Feather name="send" size={19} color={hasText ? "#fff" : colors.mutedForeground} />
        </Pressable>
      </View>

      {showStickers ? <StickerPicker onSelect={onSendSticker} /> : null}
    </>
  );
}

export const MessageComposer = React.memo(MessageComposerComponent);

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 22,
    minHeight: 44,
    paddingHorizontal: 2,
  },
  fieldBtn: {
    width: 38,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldBtnLast: {
    marginRight: 2,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
    ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : null),
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
