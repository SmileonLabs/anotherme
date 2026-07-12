import net from "node:net";
import { eq } from "drizzle-orm";
import { db, messageLinkPreviewsTable } from "@workspace/db";
import { publishRealtimeEvent } from "./realtime";
import { getRoomDeliveryRecipients } from "./chatDelivery";

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
      log?.warn?.({ err, messageId, url: normalizedUrl }, "Failed to build link preview");
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
    log?.error?.({ err, roomId, messageId }, "Failed to publish link-preview realtime event");
  }
}

async function fetchLinkMeta(rawUrl: string): Promise<LinkMeta> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(rawUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "AnotherMeBot/1.0 (+https://anothermeai.app)",
      },
    });
    const finalUrl = new URL(response.url || rawUrl);
    if (!isSafePublicUrl(finalUrl)) throw new Error("unsafe redirect url");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) throw new Error("not html");
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > 1_000_000) throw new Error("html too large");

    const html = await response.text();
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
    const imageUrl = normalizeImageUrl(
      firstClean(getMeta(html, "og:image"), getMeta(html, "twitter:image")),
      baseUrl,
    );

    return {
      url: baseUrl,
      domain: finalUrl.hostname.replace(/^www\./i, ""),
      title: title ? truncate(title, MAX_TITLE) : null,
      description: description ? truncate(description, MAX_DESCRIPTION) : null,
      imageUrl,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isSafePublicUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return false;
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) return isPublicIpv4(host);
  if (ipVersion === 6) return isPublicIpv6(host);
  return true;
}

function isPublicIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

function isPublicIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::" || normalized === "::1") return false;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return false;
  return true;
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

function normalizeImageUrl(value: string | null, baseUrl: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    return isSafePublicUrl(url) ? url.toString() : null;
  } catch {
    return null;
  }
}
