import { and, desc, eq, gte, sql } from "drizzle-orm";
import { aiCampaignDeliveriesTable, db, type AiCampaign } from "@workspace/db";

export type CampaignQueueSkipReason = "max_per_user_reached" | "cooldown_active" | "archived";

export interface QueueAiCampaignDeliveryInput {
  campaign: AiCampaign;
  targetUserId: string;
  roomId?: string | null;
}

export async function queueAiCampaignDelivery(input: QueueAiCampaignDeliveryInput): Promise<
  | { queued: true; delivery: typeof aiCampaignDeliveriesTable.$inferSelect }
  | { queued: false; reason: CampaignQueueSkipReason }
> {
  const { campaign, targetUserId, roomId = null } = input;
  if (campaign.status === "archived") return { queued: false, reason: "archived" };

  const maxPerUser = Math.max(1, campaign.maxPerUser ?? 1);
  const cooldownHours = Math.max(0, campaign.cooldownHours ?? 0);
  const [total] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiCampaignDeliveriesTable)
    .where(and(eq(aiCampaignDeliveriesTable.campaignId, campaign.id), eq(aiCampaignDeliveriesTable.targetUserId, targetUserId)));

  if ((total?.count ?? 0) >= maxPerUser) {
    return { queued: false, reason: "max_per_user_reached" };
  }

  if (cooldownHours > 0) {
    const since = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
    const [recent] = await db
      .select({ id: aiCampaignDeliveriesTable.id })
      .from(aiCampaignDeliveriesTable)
      .where(and(eq(aiCampaignDeliveriesTable.campaignId, campaign.id), eq(aiCampaignDeliveriesTable.targetUserId, targetUserId), gte(aiCampaignDeliveriesTable.createdAt, since)))
      .orderBy(desc(aiCampaignDeliveriesTable.createdAt))
      .limit(1);
    if (recent) return { queued: false, reason: "cooldown_active" };
  }

  const [delivery] = await db.insert(aiCampaignDeliveriesTable).values({
    campaignId: campaign.id,
    targetUserId,
    roomId,
    status: "queued",
  }).returning();

  return { queued: true, delivery };
}
