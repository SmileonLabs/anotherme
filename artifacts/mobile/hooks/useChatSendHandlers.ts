import React, { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  getFetchRoomMessagesQueryKey,
  useSendMessage,
  type Message,
} from "@workspace/api-client-react";
import { crossAlert } from "@/lib/crossAlert";
import { encodeFileContent } from "@/lib/fileMessage";
import {
  dragEventHasFiles,
  isImageTransferFile,
  replyPreviewFromMessage,
  uploadFileName,
} from "@/lib/chatScreenUtils";
import {
  ImageTooLargeError,
  PermissionDeniedError,
  pickAndUploadImages,
  UploadCancelledError,
  uploadBlob,
} from "@/lib/uploadImage";
import {
  FileTooLargeError,
  pickAndUploadFile,
  uploadFileBlob,
  type UploadedFile,
} from "@/lib/uploadFile";

type UploadTask = {
  kind: "image" | "file";
  progress: number | null;
  controller: AbortController;
};

type SendableMessageType = "text" | "sticker" | "image" | "file";

function newClientMessageId(): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `m-${randomId}`;
}

export function useChatSendHandlers({
  roomId,
  me,
  replyTo,
  clearReply,
  clientKeyRef,
  forceStickToBottom,
  isDungeon,
  beginDungeonThinking,
  clearDungeonThinking,
}: {
  roomId: string;
  me: { id?: string } | null | undefined;
  replyTo: Message | null;
  clearReply: () => void;
  clientKeyRef: React.MutableRefObject<Map<string, string>>;
  forceStickToBottom: () => void;
  isDungeon: boolean;
  beginDungeonThinking: () => void;
  clearDungeonThinking: () => void;
}) {
  const queryClient = useQueryClient();
  const sendMessage = useSendMessage();
  const [uploadTask, setUploadTask] = useState<UploadTask | null>(null);
  const [isWebDraggingUpload, setIsWebDraggingUpload] = useState(false);
  const dragDepthRef = useRef(0);

  const replaceOptimisticMessage = React.useCallback(
    (key: ReturnType<typeof getFetchRoomMessagesQueryKey>, tempId: string, created: Message) => {
      queryClient.setQueryData<Message[]>(key, (old = []) => {
        let replaced = false;
        const next = old.map((message) => {
          if (message.id !== tempId) return message;
          replaced = true;
          return created;
        });
        if (replaced || old.some((message) => message.id === created.id)) return next;
        return [...next, created];
      });
    },
    [queryClient],
  );

  const sendOptimisticMessage = React.useCallback(
    async ({
      content,
      type,
      errorMessage,
      onError,
    }: {
      content: string;
      type: SendableMessageType;
      errorMessage: string;
      onError?: () => void;
    }): Promise<boolean> => {
      forceStickToBottom();
      const activeReply = replyTo;
      const key = getFetchRoomMessagesQueryKey(roomId);
      const tempId = `temp-${Date.now()}`;
      const clientMessageId = newClientMessageId();
      const optimistic: Message & { _pending?: boolean } = {
        id: tempId,
        roomId,
        roomSeq: 0,
        senderId: me?.id ?? "",
        authorKind: "user",
        type,
        content,
        replyToMessageId: activeReply?.id ?? null,
        replyTo: activeReply ? replyPreviewFromMessage(activeReply) : null,
        deletedAt: null,
        stickerBadges: [],
        linkPreview: null,
        createdAt: new Date().toISOString(),
        readCount: 0,
        sender: (me as any) ?? null,
        _pending: true,
      };
      queryClient.setQueryData<Message[]>(key, (old = []) => [...old, optimistic]);

      try {
        const created = await sendMessage.mutateAsync({
          id: roomId,
          data: { content, type, replyToMessageId: activeReply?.id ?? null, clientMessageId },
        });
        if (created?.id) clientKeyRef.current.set(created.id, tempId);
        if (created) replaceOptimisticMessage(key, tempId, created);
        clearReply();
        return true;
      } catch {
        onError?.();
        queryClient.setQueryData<Message[]>(key, (old = []) => old.filter((message) => message.id !== tempId));
        crossAlert("오류", errorMessage);
        return false;
      }
    },
    [clearReply, clientKeyRef, forceStickToBottom, me, queryClient, replaceOptimisticMessage, replyTo, roomId, sendMessage],
  );

  // Returns false so the composer can restore its input after a failed send.
  const sendText = React.useCallback(
    async (content: string): Promise<boolean> => {
      const trimmed = content.trim();
      if (!trimmed || sendMessage.isPending) return false;
      if (isDungeon) beginDungeonThinking();
      return sendOptimisticMessage({
        content: trimmed,
        type: "text",
        errorMessage: "메시지를 보내지 못했습니다. 다시 시도해주세요.",
        onError: clearDungeonThinking,
      });
    },
    [beginDungeonThinking, clearDungeonThinking, isDungeon, sendMessage.isPending, sendOptimisticMessage],
  );

  const handleSendSticker = React.useCallback(
    async (code: string) => {
      if (sendMessage.isPending) return;
      await sendOptimisticMessage({
        content: code,
        type: "sticker",
        errorMessage: "스티커를 보내지 못했습니다. 다시 시도해주세요.",
      });
    },
    [sendMessage.isPending, sendOptimisticMessage],
  );

  const sendImageObjectPath = React.useCallback(
    (objectPath: string) =>
      sendOptimisticMessage({
        content: objectPath,
        type: "image",
        errorMessage: "사진을 보내지 못했습니다. 다시 시도해주세요.",
      }),
    [sendOptimisticMessage],
  );

  const sendUploadedFile = React.useCallback(
    (picked: UploadedFile) =>
      sendOptimisticMessage({
        content: encodeFileContent({
          path: picked.objectPath,
          name: picked.name,
          size: picked.size,
          mime: picked.mimeType,
        }),
        type: "file",
        errorMessage: "파일을 보내지 못했습니다. 다시 시도해주세요.",
      }),
    [sendOptimisticMessage],
  );

  const uploadAndSendImageBlob = React.useCallback(
    async (blob: Blob, name = `image-${Date.now()}.jpg`) => {
      if (uploadTask || sendMessage.isPending) {
        crossAlert("업로드 중", "현재 업로드가 끝난 뒤 다시 시도해주세요.");
        return;
      }
      const controller = new AbortController();
      setUploadTask({ kind: "image", progress: null, controller });
      try {
        const objectPath = await uploadBlob(blob, name, {
          signal: controller.signal,
          onProgress: (progress) => {
            setUploadTask((current) =>
              current?.controller === controller ? { ...current, progress } : current,
            );
          },
        });
        await sendImageObjectPath(objectPath);
      } catch (error) {
        if (error instanceof UploadCancelledError) return;
        if (error instanceof ImageTooLargeError) {
          crossAlert("사진 크기 초과", "사진 크기는 10MB를 초과할 수 없습니다.");
        } else {
          crossAlert("오류", "사진을 보내지 못했습니다. 다시 시도해주세요.");
        }
      } finally {
        setUploadTask((current) => (current?.controller === controller ? null : current));
      }
    },
    [sendImageObjectPath, sendMessage.isPending, uploadTask],
  );

  const uploadAndSendFileBlob = React.useCallback(
    async (file: File) => {
      if (uploadTask || sendMessage.isPending) {
        crossAlert("업로드 중", "현재 업로드가 끝난 뒤 다시 시도해주세요.");
        return;
      }
      const controller = new AbortController();
      setUploadTask({ kind: "file", progress: null, controller });
      try {
        const picked = await uploadFileBlob(
          file,
          uploadFileName(file, "file"),
          file.type || "application/octet-stream",
          {
            signal: controller.signal,
            onProgress: (progress) => {
              setUploadTask((current) =>
                current?.controller === controller ? { ...current, progress } : current,
              );
            },
          },
        );
        await sendUploadedFile(picked);
      } catch (error) {
        if (error instanceof UploadCancelledError) return;
        if (error instanceof FileTooLargeError) {
          crossAlert("파일 크기 초과", "파일 크기는 25MB를 초과할 수 없습니다.");
        } else {
          crossAlert("오류", "파일을 보내지 못했습니다. 다시 시도해주세요.");
        }
      } finally {
        setUploadTask((current) => (current?.controller === controller ? null : current));
      }
    },
    [sendMessage.isPending, sendUploadedFile, uploadTask],
  );

  const handleWebUploadFiles = React.useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      if (uploadTask || sendMessage.isPending) {
        crossAlert("업로드 중", "현재 업로드가 끝난 뒤 다시 시도해주세요.");
        return;
      }
      for (const file of files) {
        if (isImageTransferFile(file)) {
          await uploadAndSendImageBlob(file, uploadFileName(file, "image"));
        } else {
          await uploadAndSendFileBlob(file);
        }
      }
    },
    [sendMessage.isPending, uploadAndSendFileBlob, uploadAndSendImageBlob, uploadTask],
  );

  const handlePickImage = React.useCallback(async () => {
    if (uploadTask || sendMessage.isPending) return;
    const controller = new AbortController();
    setUploadTask({ kind: "image", progress: null, controller });
    try {
      const picked = await pickAndUploadImages({
        signal: controller.signal,
        onProgress: (progress) => {
          setUploadTask((current) =>
            current?.controller === controller ? { ...current, progress } : current,
          );
        },
      });
      if (!picked?.length) return;
      for (const image of picked) await sendImageObjectPath(image.objectPath);
    } catch (error) {
      if (error instanceof UploadCancelledError) return;
      if (error instanceof PermissionDeniedError) {
        crossAlert("권한 필요", "사진을 보내려면 사진 접근 권한을 허용해주세요.");
      } else if (error instanceof ImageTooLargeError) {
        crossAlert("사진 크기 초과", "사진 크기는 10MB를 초과할 수 없습니다.");
      } else {
        crossAlert("오류", "사진을 보내지 못했습니다. 다시 시도해주세요.");
      }
    } finally {
      setUploadTask((current) => (current?.controller === controller ? null : current));
    }
  }, [sendImageObjectPath, sendMessage.isPending, uploadTask]);

  const handlePickFile = React.useCallback(async () => {
    if (uploadTask || sendMessage.isPending) return;
    const controller = new AbortController();
    setUploadTask({ kind: "file", progress: null, controller });
    try {
      const picked = await pickAndUploadFile({
        signal: controller.signal,
        onProgress: (progress) => {
          setUploadTask((current) =>
            current?.controller === controller ? { ...current, progress } : current,
          );
        },
      });
      if (!picked) return;
      await sendUploadedFile(picked);
    } catch (error) {
      if (error instanceof UploadCancelledError) return;
      if (error instanceof FileTooLargeError) {
        crossAlert("파일 크기 초과", "파일 크기는 25MB를 초과할 수 없습니다.");
      } else {
        crossAlert("오류", "파일을 보내지 못했습니다. 다시 시도해주세요.");
      }
    } finally {
      setUploadTask((current) => (current?.controller === controller ? null : current));
    }
  }, [sendMessage.isPending, sendUploadedFile, uploadTask]);

  const handleCancelUpload = React.useCallback(() => {
    uploadTask?.controller.abort();
  }, [uploadTask]);

  useEffect(() => {
    if (Platform.OS !== "web" || isDungeon || typeof document === "undefined") return;

    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => !!file);
      if (!files.length) return;
      event.preventDefault();
      void handleWebUploadFiles(files);
    };
    const handleDragEnter = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsWebDraggingUpload(true);
    };
    const handleDragOver = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      setIsWebDraggingUpload(true);
    };
    const handleDragLeave = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsWebDraggingUpload(false);
    };
    const handleDrop = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsWebDraggingUpload(false);
      void handleWebUploadFiles(Array.from(event.dataTransfer?.files ?? []));
    };

    document.addEventListener("paste", handlePaste);
    document.addEventListener("dragenter", handleDragEnter);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("drop", handleDrop);
    return () => {
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("dragenter", handleDragEnter);
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("dragleave", handleDragLeave);
      document.removeEventListener("drop", handleDrop);
    };
  }, [handleWebUploadFiles, isDungeon]);

  return {
    isSending: sendMessage.isPending,
    uploadTask,
    isWebDraggingUpload,
    sendText,
    handleSendSticker,
    handlePickImage,
    handlePickFile,
    handleCancelUpload,
  };
}
