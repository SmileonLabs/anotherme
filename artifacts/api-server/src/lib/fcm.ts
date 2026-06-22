import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logger } from "./logger";
import type { App } from "firebase-admin/app";
import type { Messaging } from "firebase-admin/messaging";

/**
 * Native push (Firebase Cloud Messaging) for the Android app. Web/PWA delivery
 * is handled separately by push.ts (Web Push / VAPID). The mobile client
 * registers its raw FCM device token via POST /users/me/push-token; those tokens
 * are stored in users.fcmTokens (a JSON string array) and messaged here.
 *
 * Requires the FIREBASE_SERVICE_ACCOUNT secret (the service-account JSON from
 * Firebase Console → Project settings → Service accounts → Generate new private
 * key). If it is not set, FCM is disabled and every call is a safe no-op, exactly
 * like web push without VAPID keys.
 */

/** Max distinct FCM device tokens kept per user. */
const MAX_TOKENS = 10;

let messaging: Messaging | null = null;
let initTried = false;

async function getMessaging(): Promise<Messaging | null> {
  if (messaging) return messaging;
  if (initTried) return messaging;
  initTried = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    logger.warn("FIREBASE_SERVICE_ACCOUNT not set — native FCM push disabled");
    return null;
  }

  let credentialJson: Record<string, unknown>;
  try {
    credentialJson = JSON.parse(raw);
  } catch {
    logger.error("FIREBASE_SERVICE_ACCOUNT is not valid JSON — native FCM push disabled");
    return null;
  }

  try {
    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getMessaging: getMsg } = await import("firebase-admin/messaging");
    const existing = getApps();
    const app: App =
      existing.length > 0
        ? existing[0]
        : initializeApp({ credential: cert(credentialJson as never) });
    messaging = getMsg(app);
    return messaging;
  } catch (err) {
    logger.error({ err }, "Failed to initialize firebase-admin — native FCM push disabled");
    return null;
  }
}

/** Whether native FCM is configured (used to gate work, not for correctness). */
export function fcmConfigured(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT;
}

export function parseFcmTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === "string" && t.length > 0);
    }
  } catch {
    // not JSON — ignore
  }
  return [];
}

function serializeFcmTokens(tokens: string[]): string | null {
  return tokens.length > 0 ? JSON.stringify(tokens) : null;
}

/**
 * Register a native FCM device token for a user. Row-locked so concurrent
 * registrations from multiple devices don't clobber each other; deduped and
 * capped to MAX_TOKENS (newest kept).
 */
export async function addFcmToken(userId: string, token: string): Promise<void> {
  if (!token) return;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ fcmTokens: usersTable.fcmTokens })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .for("update");
    if (!row) return;
    const existing = parseFcmTokens(row.fcmTokens).filter((t) => t !== token);
    const next = [...existing, token].slice(-MAX_TOKENS);
    await tx
      .update(usersTable)
      .set({ fcmTokens: serializeFcmTokens(next) })
      .where(eq(usersTable.id, userId));
  });
}

/** Remove stale/invalid FCM tokens, row-locked. */
async function removeFcmTokens(userId: string, stale: Set<string>): Promise<void> {
  if (stale.size === 0) return;
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ fcmTokens: usersTable.fcmTokens })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .for("update");
      if (!row) return;
      const remaining = parseFcmTokens(row.fcmTokens).filter((t) => !stale.has(t));
      await tx
        .update(usersTable)
        .set({ fcmTokens: serializeFcmTokens(remaining) })
        .where(eq(usersTable.id, userId));
    });
  } catch (err) {
    logger.error({ err, userId }, "Failed to prune stale FCM tokens");
  }
}

export interface FcmCallPayload {
  title: string;
  body: string;
  /** All values must be strings (FCM requirement). */
  data: Record<string, string>;
  /** Notifee/native channel id; matches the mobile "incoming-calls" channel. */
  channelId?: string;
  /** Notification collapse/dedup key. */
  tag?: string;
}

/**
 * Send a high-priority incoming-call message to all of a user's native devices.
 * Best-effort: never throws. Prunes tokens FCM reports as unregistered/invalid.
 */
export async function sendFcmCallToUser(userId: string, payload: FcmCallPayload): Promise<void> {
  const msg = await getMessaging();
  if (!msg) return;
  try {
    const [user] = await db
      .select({ fcmTokens: usersTable.fcmTokens })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!user) return;
    const tokens = parseFcmTokens(user.fcmTokens ?? null);
    if (tokens.length === 0) return;

    const stale = new Set<string>();
    await Promise.allSettled(
      tokens.map(async (token) => {
        try {
          await msg.send({
            token,
            // DATA-ONLY (no `notification` block) on purpose. A notification
            // payload makes Android deliver straight to the system tray and SKIP
            // the JS background handler when the app is killed; data-only + high
            // priority instead wakes the app's setBackgroundMessageHandler (see
            // mobile lib/fcmBackground.ts), which renders the notifee full-screen
            // incoming call over the lock screen. title/body ride along in data
            // as a fallback. Tradeoff: if the handler can't run (force-stopped /
            // aggressive battery optimization) nothing shows — inherent to the
            // full-screen-call pattern.
            data: { ...payload.data, title: payload.title, body: payload.body },
            android: { priority: "high" },
          });
        } catch (err: unknown) {
          const code = (err as { code?: string; errorInfo?: { code?: string } })?.code
            ?? (err as { errorInfo?: { code?: string } })?.errorInfo?.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            // Token is definitively dead — safe to drop.
            stale.add(token);
          } else {
            // Includes messaging/invalid-argument: do NOT prune on it. It can be
            // caused by a malformed payload rather than a bad token, in which
            // case every device would error and we'd wipe the user's whole token
            // list. Log and keep the token instead.
            logger.error({ err, userId, code }, "Failed to send FCM to a device");
          }
        }
      }),
    );
    await removeFcmTokens(userId, stale);
  } catch (err) {
    logger.error({ err, userId }, "Failed to send FCM");
  }
}
