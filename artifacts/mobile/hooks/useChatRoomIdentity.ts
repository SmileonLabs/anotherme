import { usePresenceUsers } from "@/hooks/usePresence";
import { formatLastSeenLabel } from "@/lib/chatScreenUtils";
import { userDisplayName } from "@/lib/friendNames";

export function useChatRoomIdentity(args: {
  room: any;
  meId?: string;
  isGroupRoom: boolean;
  isDungeon: boolean;
}) {
  const isDirect = args.room?.type === "direct";
  const members = (args.room?.members as any[] | undefined) ?? [];
  const otherMember = isDirect ? members.find((member) => member.id !== args.meId) ?? null : null;
  const { data: presenceResponse, isLoading: presenceLoading } = usePresenceUsers([
    isDirect ? otherMember?.id : null,
  ]);
  const otherPresence = presenceResponse?.users.find((user) => user.userId === otherMember?.id) ?? null;
  const headerTitle = args.room?.name || (isDirect ? userDisplayName(otherMember, "채팅") : "채팅");
  const headerSubtitle = args.isGroupRoom
    ? `멤버 ${members.length}명`
    : args.isDungeon
      ? "🎲 AI 던전 마스터"
      : presenceLoading && !otherPresence
        ? "상태 확인 중..."
        : otherPresence?.online
          ? "온라인"
          : formatLastSeenLabel(otherPresence?.lastSeenAt);

  return {
    isDirect,
    otherMember,
    otherDisplayName: userDisplayName(otherMember, "상대방"),
    isOtherOnline: Boolean(otherPresence?.online),
    headerTitle,
    headerSubtitle,
  };
}
