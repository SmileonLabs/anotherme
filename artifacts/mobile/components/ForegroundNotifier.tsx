/**
 * Native stub. The real in-app notification popup is web-only and lives in
 * ForegroundNotifier.web.tsx. On native, push/system notifications are handled
 * by the OS, so this renders nothing.
 */
export function ForegroundNotifier() {
  return null;
}
