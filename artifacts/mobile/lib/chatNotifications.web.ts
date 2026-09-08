export async function clearChatNotifications(roomId?: string | null): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const target = navigator.serviceWorker.controller || registration?.active;
    if (!target) return;
    target.postMessage(
      roomId
        ? { type: "clear-room-notifications", roomId, tag: `room-${roomId}` }
        : { type: "clear-chat-notifications" },
    );
  } catch {
    // Best-effort: stale OS notifications should never break app UX.
  }
}
