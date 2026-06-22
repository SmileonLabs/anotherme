import webpush, { type PushSubscription } from "web-push";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logger } from "./logger";

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:support@todotalk.app";

let configured = false;
if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
} else {
  logger.warn("VAPID keys not set — web push disabled");
}

/** Max distinct device subscriptions kept per user. */
const MAX_DEVICES = 10;

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /** When "call", the service worker keeps the banner up even while focused. */
  type?: string;
}

function isValidSubscription(obj: unknown): obj is PushSubscription {
  const sub = obj as PushSubscription | null;
  return (
    !!sub &&
    typeof sub.endpoint === "string" &&
    !!sub.keys?.p256dh &&
    !!sub.keys?.auth
  );
}

/**
 * Parse the stored push token into a list of subscriptions. Supports both the
 * current multi-device array format and the legacy single-object format so old
 * rows keep working without a migration.
 */
export function parseSubscriptions(raw: string | null | undefined): PushSubscription[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(isValidSubscription);
    }
    if (isValidSubscription(parsed)) return [parsed];
  } catch {
    // not JSON (legacy opaque token) — nothing to send to
  }
  return [];
}

function serializeSubscriptions(subs: PushSubscription[]): string | null {
  return subs.length > 0 ? JSON.stringify(subs) : null;
}

/**
 * Register a device subscription for a user. Merges the incoming subscription
 * into the user's device list (deduped by endpoint), capped to MAX_DEVICES.
 * Runs in a row-locked transaction so concurrent registrations from different
 * devices don't clobber each other.
 */
export async function addSubscription(userId: string, rawToken: string): Promise<void> {
  let incoming: PushSubscription | null = null;
  try {
    const parsed = JSON.parse(rawToken);
    if (isValidSubscription(parsed)) incoming = parsed;
  } catch {
    incoming = null;
  }
  if (!incoming) {
    // Not a valid web-push subscription — ignore it rather than overwrite (and
    // destroy) the user's existing device list.
    logger.warn({ userId }, "Ignored invalid push subscription token");
    return;
  }
  const sub = incoming;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ pushToken: usersTable.pushToken })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .for("update");
    if (!row) return;
    const existing = parseSubscriptions(row.pushToken).filter(
      (s) => s.endpoint !== sub.endpoint,
    );
    const next = [...existing, sub].slice(-MAX_DEVICES);
    await tx
      .update(usersTable)
      .set({ pushToken: serializeSubscriptions(next) })
      .where(eq(usersTable.id, userId));
  });
}

/**
 * Remove specific (stale) endpoints from a user's device list, row-locked so it
 * doesn't drop a device that was concurrently registered.
 */
async function removeEndpoints(userId: string, staleEndpoints: Set<string>): Promise<void> {
  if (staleEndpoints.size === 0) return;
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ pushToken: usersTable.pushToken })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .for("update");
      if (!row) return;
      const remaining = parseSubscriptions(row.pushToken).filter(
        (s) => !staleEndpoints.has(s.endpoint),
      );
      await tx
        .update(usersTable)
        .set({ pushToken: serializeSubscriptions(remaining) })
        .where(eq(usersTable.id, userId));
    });
  } catch (err) {
    logger.error({ err, userId }, "Failed to prune stale push subscriptions");
  }
}

/**
 * Send a web push notification to all of a user's devices. Best-effort: never
 * throws. Respects notificationEnabled and prunes stale (404/410) subscriptions.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  opts: { force?: boolean } = {},
): Promise<void> {
  if (!configured) return;
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) return;
    // Voice-call pushes (force) must fire even when the user disabled
    // notifications — an incoming call is too important to silently drop.
    if (!opts.force && !user.notificationEnabled) return;

    const subscriptions = parseSubscriptions(user.pushToken ?? null);
    if (subscriptions.length === 0) return;

    const body = JSON.stringify(payload);
    const stale = new Set<string>();
    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(sub, body);
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            stale.add(sub.endpoint);
          } else {
            logger.error({ err, userId }, "Failed to send web push to a device");
          }
        }
      }),
    );
    await removeEndpoints(userId, stale);
  } catch (err) {
    logger.error({ err, userId }, "Failed to send web push");
  }
}

/** Send the same notification to multiple users concurrently (best-effort). */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  await Promise.allSettled(userIds.map((id) => sendPushToUser(id, payload)));
}

/**
 * Send a voice-call push. Unlike regular notifications these ALWAYS fire: they
 * ignore the user's notificationEnabled toggle (force) and, via data.type="call",
 * tell the service worker to keep the OS banner up even when the app is focused.
 */
export async function sendCallPush(
  userId: string,
  payload: Omit<PushPayload, "type">,
): Promise<void> {
  await sendPushToUser(userId, { ...payload, type: "call" }, { force: true });
}
