import type { Message } from "@workspace/api-client-react";
import { userDisplayName } from "@/lib/friendNames";

export function formatMsgTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDayLabel(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

export function formatLastSeenLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return "오프라인";
  const ts = new Date(dateStr).getTime();
  if (!Number.isFinite(ts)) return "오프라인";
  const diffMs = Date.now() - ts;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "방금 전 접속";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}분 전 접속`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}시간 전 접속`;
  return `${Math.floor(diffMs / day)}일 전 접속`;
}

export function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export function summarizeMessage(message: Message): string {
  if ((message as any).deletedAt) return "삭제된 메시지";
  if (message.type === "image") return "사진";
  if (message.type === "sticker") return "스티커";
  if (message.type === "file") return "파일";
  if (message.type === "call") return "통화";
  return message.content;
}

export function extensionFromMime(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/bmp":
      return "bmp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    default:
      return "";
  }
}

export function uploadFileName(file: File, fallbackPrefix: "image" | "file"): string {
  const name = file.name?.trim();
  if (name) return name;
  const ext = extensionFromMime(file.type);
  return `${fallbackPrefix}-${Date.now()}${ext ? `.${ext}` : ""}`;
}

export function isImageTransferFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(file.name);
}

export function dragEventHasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

export function replyPreviewFromMessage(message: Message) {
  return {
    id: message.id,
    senderId: message.senderId,
    senderName: userDisplayName(message.sender as any, ""),
    type: message.type,
    content: summarizeMessage(message),
    deletedAt: (message as any).deletedAt ?? null,
  };
}

export function roomDisplayName(room: any, meId?: string): string {
  if (room?.name) return room.name;
  if (room?.type === "direct") {
    const other = (room.members as any[] | undefined)?.find((member) => member.id !== meId);
    return userDisplayName(other, "1:1 채팅");
  }
  if (room?.type === "dungeon") return "AI 던전";
  return "그룹 채팅";
}

export function isReadReceiptParticipant(user: any): boolean {
  const email = String(user?.email ?? "").toLowerCase();
  const clerkId = String(user?.clerkId ?? "").toLowerCase();
  return (
    !email.endsWith("@todotalk.system") &&
    !email.endsWith("@anotherme.local") &&
    !clerkId.startsWith("system:") &&
    !clerkId.startsWith("official:")
  );
}
