import { eq } from "drizzle-orm";
import { db, messageLinkPreviewsTable } from "@workspace/db";
import { publishRealtimeEvent } from "./realtime";
import { getRoomDeliveryRecipients } from "./chatDelivery";
import {
  buildLinkPreviewFailureLog,
  buildLinkPreviewRoomFailureLog,
} from "./linkPreviewLogging";
import { safeLinkPreviewImageUrl } from "./linkPreviewImagePolicy";
import { fetchPinnedPublicHtml, isSafePublicUrl } from "./linkPreviewNetwork";

const URL_RE = /https?:\/\/[^\s<>'"]+/i;
const MAX_TITLE = 140;
const MAX_DESCRIPTION = 220;

type LoggerLike = {
  warn?: (obj: unknown, msg?: string) => void;
  error?: (obj: unknown, msg?: string) => void;
};

interface LinkMeta {
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
}

export function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_RE)?.[0];
  if (!match) return null;
  return match.replace(/[),.;!?]+$/g, "");
}

export async function scheduleLinkPreview(
  roomId: string,
  messageId: string,
  content: string,
  actorUserId: string,
  log?: LoggerLike,
): Promise<void> {
  const rawUrl = extractFirstUrl(content);
  if (!rawUrl) return;

  let normalizedUrl: string;
  try {
    const parsed = new URL(rawUrl);
    if (!isSafePublicUrl(parsed)) return;
    parsed.hash = "";
    normalizedUrl = parsed.toString();
  } catch {
    return;
  }

  await db
    .insert(messageLinkPreviewsTable)
    .values({ messageId, url: normalizedUrl, status: "pending" })
    .onConflictDoUpdate({
      target: messageLinkPreviewsTable.messageId,
      set: {
        url: normalizedUrl,
        domain: null,
        title: null,
        description: null,
        imageUrl: null,
        status: "pending",
        updatedAt: new Date(),
      },
    });

  void (async () => {
    try {
      const meta = await fetchLinkMeta(normalizedUrl);
      await db
        .update(messageLinkPreviewsTable)
        .set({
          url: meta.url,
          domain: meta.domain,
          title: meta.title,
          description: meta.description,
          imageUrl: meta.imageUrl,
          status: "ready",
          updatedAt: new Date(),
        })
        .where(eq(messageLinkPreviewsTable.messageId, messageId));
    } catch (err) {
      await db
        .update(messageLinkPreviewsTable)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(messageLinkPreviewsTable.messageId, messageId));
      log?.warn?.(
        buildLinkPreviewFailureLog(err, normalizedUrl, messageId),
        "Failed to build link preview",
      );
    } finally {
      await publishMessageUpdated(roomId, actorUserId, messageId, log);
    }
  })();
}

async function publishMessageUpdated(
  roomId: string,
  actorUserId: string,
  messageId: string,
  log?: LoggerLike,
): Promise<void> {
  try {
    const recipients = await getRoomDeliveryRecipients(roomId, actorUserId);
    await publishRealtimeEvent({
      type: "message.updated",
      roomId,
      actorUserId,
      userIds: recipients.realtimeUserIds,
      data: { messageId },
    });
  } catch (err) {
    log?.error?.(
      buildLinkPreviewRoomFailureLog(err, roomId, messageId),
      "Failed to publish link-preview realtime event",
    );
  }
}

async function fetchLinkMeta(rawUrl: string): Promise<LinkMeta> {
  const response = await fetchPinnedPublicHtml(rawUrl);
  const finalUrl = new URL(response.finalUrl);
  const html = response.body;
  const baseUrl = finalUrl.toString();
  const title = firstClean(
    getMeta(html, "og:title"),
    getMeta(html, "twitter:title"),
    getTitle(html),
  );
  const description = firstClean(
    getMeta(html, "og:description"),
    getMeta(html, "description"),
    getMeta(html, "twitter:description"),
  );
  const imageUrl = safeLinkPreviewImageUrl(
    firstClean(getMeta(html, "og:image"), getMeta(html, "twitter:image")),
  );

  return {
    url: baseUrl,
    domain: finalUrl.hostname.replace(/^www\./i, ""),
    title: title ? truncate(title, MAX_TITLE) : null,
    description: description ? truncate(description, MAX_DESCRIPTION) : null,
    imageUrl,
  };
}

function getMeta(html: string, key: string): string | null {
  const metaTags = html.match(/<meta\s+[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const property = getAttr(tag, "property") ?? getAttr(tag, "name");
    if (property?.toLowerCase() !== key.toLowerCase()) continue;
    const content = getAttr(tag, "content");
    if (content) return content;
  }
  return null;
}

function getAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2] ?? null;
}

function getTitle(html: string): string | null {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
}

function firstClean(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return null;
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const decoded = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return decoded || null;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}
