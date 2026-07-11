CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"nickname" text NOT NULL,
	"profile_image_url" text,
	"status_message" text,
	"push_token" text,
	"fcm_tokens" text,
	"notification_enabled" boolean DEFAULT true NOT NULL,
	"talk_analysis_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_a_id" uuid NOT NULL,
	"user_b_id" uuid NOT NULL,
	"user_a_friend_alias" text,
	"user_b_friend_alias" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invite_code" text NOT NULL,
	"inviter_user_id" uuid NOT NULL,
	"used_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expired_at" timestamp with time zone,
	CONSTRAINT "invites_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "chat_room_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_message_id" uuid,
	"last_read_seq" integer DEFAULT 0 NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"hidden_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"name" text,
	"owner_id" uuid,
	"last_message" text,
	"last_message_at" timestamp with time zone,
	"last_message_seq" integer DEFAULT 0 NOT NULL,
	"pinned_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_link_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"url" text NOT NULL,
	"domain" text,
	"title" text,
	"description" text,
	"image_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_stickers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"author_kind" text DEFAULT 'user' NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"reply_to_message_id" uuid,
	"another_me_session_id" uuid,
	"metadata" jsonb,
	"deleted_at" timestamp with time zone,
	"room_seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_user_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_name" text NOT NULL,
	"caller_id" uuid NOT NULL,
	"callee_id" uuid NOT NULL,
	"chat_room_id" uuid,
	"media" text DEFAULT 'audio' NOT NULL,
	"status" text DEFAULT 'ringing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"missed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dungeon_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"theme" text DEFAULT 'fantasy' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dungeon_sessions_room_id_unique" UNIQUE("room_id")
);
--> statement-breakpoint
CREATE TABLE "life_quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"star_profile_id" uuid,
	"title" text NOT NULL,
	"theme" text NOT NULL,
	"goal" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"current_stage_index" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"stages" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "battle_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "battle_sessions_room_id_unique" UNIQUE("room_id")
);
--> statement-breakpoint
CREATE TABLE "battle_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"turn_index" integer NOT NULL,
	"speaker_id" uuid NOT NULL,
	"side" text NOT NULL,
	"content" text NOT NULL,
	"evaluation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_battle_stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"mp" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"stats" jsonb DEFAULT '{"logic":0,"empathy":0,"wit":0,"knowledge":0,"conviction":0,"emotion":0,"decisiveness":0}'::jsonb NOT NULL,
	"last_analyzed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personas_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "persona_identity_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"archetype" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persona_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"archetype_key" text DEFAULT 'forming' NOT NULL,
	"archetype_label" text DEFAULT '형성 중인 자아' NOT NULL,
	"summary" text,
	"trait_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"communication_styles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conflict_styles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_summary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'inferred' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"source_key" text NOT NULL,
	"event_type" text NOT NULL,
	"exp_delta" integer DEFAULT 0 NOT NULL,
	"stat_changes" jsonb,
	"reason" text,
	"metadata" jsonb,
	"before_level" integer DEFAULT 1 NOT NULL,
	"after_level" integer DEFAULT 1 NOT NULL,
	"before_exp" integer DEFAULT 0 NOT NULL,
	"after_exp" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "xp_events_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "clan_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"contribution_exp" integer DEFAULT 0 NOT NULL,
	"last_rank_bonus_on" date,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clan_members_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "clans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"emblem_url" text,
	"owner_user_id" uuid NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"exp" integer DEFAULT 0 NOT NULL,
	"member_count" integer DEFAULT 1 NOT NULL,
	"clan_values" text,
	"clan_summary" text,
	"preferred_archetype" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "clan_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clan_id" uuid NOT NULL,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"source_id" text,
	"source_key" text,
	"memory_type" text DEFAULT 'strategy' NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"importance_score" integer DEFAULT 0 NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clan_memories_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "clan_wisdom" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clan_id" uuid NOT NULL,
	"philosophy" text NOT NULL,
	"strategy" text NOT NULL,
	"values" text NOT NULL,
	"culture" text NOT NULL,
	"motto" text NOT NULL,
	"source_memory_count" integer DEFAULT 0 NOT NULL,
	"generated_by_user_id" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clan_wisdom_clan_id_unique" UNIQUE("clan_id")
);
--> statement-breakpoint
CREATE TABLE "clan_war_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"war_id" uuid NOT NULL,
	"clan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"side" text NOT NULL,
	"submission" text,
	"score" integer DEFAULT 0 NOT NULL,
	"contribution_summary" text,
	"submitted_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clan_war_participants_war_user_uniq" UNIQUE("war_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "clan_war_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"war_id" uuid NOT NULL,
	"judge_summary" text NOT NULL,
	"challenger_feedback" text NOT NULL,
	"opponent_feedback" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clan_war_results_war_id_unique" UNIQUE("war_id")
);
--> statement-breakpoint
CREATE TABLE "clan_wars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"challenger_clan_id" uuid NOT NULL,
	"opponent_clan_id" uuid,
	"created_by_user_id" uuid,
	"winner_clan_id" uuid,
	"challenger_score" integer DEFAULT 0 NOT NULL,
	"opponent_score" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_key" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reward_claimed_at" timestamp with time zone,
	"reward_exp" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_user_key_uniq" UNIQUE("user_id","achievement_key")
);
--> statement-breakpoint
CREATE TABLE "quest_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"quest_key" text NOT NULL,
	"quest_type" text NOT NULL,
	"period_key" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"target" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone,
	"reward_claimed_at" timestamp with time zone,
	"reward_exp" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quest_progress_user_quest_period_uniq" UNIQUE("user_id","quest_key","period_key")
);
--> statement-breakpoint
CREATE TABLE "fan_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"stats" jsonb DEFAULT '{"fanPower":0,"supportPower":0,"empathy":0,"story":0}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_growth_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"star_profile_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"event_type" text NOT NULL,
	"xp_delta" integer DEFAULT 0 NOT NULL,
	"stat_changes" jsonb,
	"reason" text,
	"metadata" jsonb,
	"before_level" integer DEFAULT 1 NOT NULL,
	"after_level" integer DEFAULT 1 NOT NULL,
	"before_xp" integer DEFAULT 0 NOT NULL,
	"after_xp" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "star_growth_events_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "star_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_address" text NOT NULL,
	"chain_id" integer NOT NULL,
	"contract_address" text NOT NULL,
	"token_id" text NOT NULL,
	"star_key" text NOT NULL,
	"display_name" text NOT NULL,
	"image_url" text,
	"stage" text DEFAULT 'aspiring' NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"stats" jsonb DEFAULT '{"charm":0,"stagePresence":0,"bond":0,"lore":0}'::jsonb NOT NULL,
	"equipped_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"torimia_opened_at" timestamp with time zone,
	"promoted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_play_modes" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"current_mode" text DEFAULT 'fan' NOT NULL,
	"star_unlocked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_feed_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_feed_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" uuid,
	"kind" text DEFAULT 'fan' NOT NULL,
	"source_key" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"metadata" jsonb,
	"visibility" text DEFAULT 'PUBLIC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "star_feed_posts_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "star_feed_reactions" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reaction_type" text DEFAULT 'cheer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_update_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"old_profile_image_url" text,
	"new_profile_image_url" text,
	"old_status_message" text,
	"new_status_message" text,
	"feed_post_id" uuid,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_address" text NOT NULL,
	"chain_id" integer DEFAULT 1 NOT NULL,
	"verified_at" timestamp with time zone,
	"nft_verified_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_verification_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_address" text NOT NULL,
	"nonce" text NOT NULL,
	"message" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_verification_challenges_nonce_unique" UNIQUE("nonce")
);
--> statement-breakpoint
CREATE TABLE "daily_talk_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reward_date" date NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"title" text,
	"mood" text,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"diary" text,
	"summary" text,
	"scores_json" jsonb,
	"abuse_json" jsonb,
	"grade" text,
	"quality_score" integer DEFAULT 0 NOT NULL,
	"spam_risk" integer DEFAULT 0 NOT NULL,
	"pvt_amount" integer DEFAULT 0 NOT NULL,
	"visibility" text DEFAULT 'PRIVATE' NOT NULL,
	"feed_post_id" uuid,
	"idempotency_key" text NOT NULL,
	"rewarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pvt_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"description" text,
	"balance_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pvt_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pvt_wallets_balance_nonnegative" CHECK ("pvt_wallets"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "another_me_room_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"summon_enabled" boolean,
	"wait_minutes" integer,
	"tone_sync_level" text,
	"relationship_type" text DEFAULT 'UNKNOWN' NOT NULL,
	"auto_reply_level" text DEFAULT 'standard' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "another_me_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"summoned_by_user_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"summoned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone,
	"dismissed_by_user_id" uuid,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "another_me_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"summon_enabled" boolean DEFAULT false NOT NULL,
	"default_wait_minutes" integer DEFAULT 5 NOT NULL,
	"allow_friends" boolean DEFAULT true NOT NULL,
	"allow_family" boolean DEFAULT true NOT NULL,
	"allow_work" boolean DEFAULT false NOT NULL,
	"allow_unknown" boolean DEFAULT false NOT NULL,
	"auto_reply_enabled" boolean DEFAULT true NOT NULL,
	"sensitive_reply_blocked" boolean DEFAULT true NOT NULL,
	"tone_sync_enabled" boolean DEFAULT true NOT NULL,
	"default_tone_sync_level" text DEFAULT 'MEDIUM' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "another_me_tone_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"relationship_type" text NOT NULL,
	"tone_summary" text,
	"honorific_style" text DEFAULT 'MIXED' NOT NULL,
	"average_message_length" integer DEFAULT 0 NOT NULL,
	"emoji_usage_level" integer DEFAULT 0 NOT NULL,
	"laughter_usage_level" integer DEFAULT 0 NOT NULL,
	"formality_level" integer DEFAULT 50 NOT NULL,
	"warmth_level" integer DEFAULT 50 NOT NULL,
	"humor_level" integer DEFAULT 50 NOT NULL,
	"common_phrases_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"forbidden_phrases_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_campaign_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"room_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" uuid,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"trigger_type" text DEFAULT 'manual' NOT NULL,
	"condition_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"message_template" text NOT NULL,
	"cooldown_hours" integer DEFAULT 24 NOT NULL,
	"max_per_user" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"content" text NOT NULL,
	"checksum" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_extraction_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"source_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"stats_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_review_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_item_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"source_id" uuid,
	"job_id" uuid,
	"item_type" text NOT NULL,
	"graph_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"source_type" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"body" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"collected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ai_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_user_id" uuid,
	"memory_type" text DEFAULT 'preference' NOT NULL,
	"text" text NOT NULL,
	"privacy_scope" text DEFAULT 'user_private' NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"confidence" integer DEFAULT 100 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"graph_memory_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ontology_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "another_me_reply_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"persona_user_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"latest_message_id" uuid NOT NULL,
	"user_input" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dialogue_states" (
	"room_id" uuid NOT NULL,
	"persona_user_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"relationship_phase" text DEFAULT 'first_contact' NOT NULL,
	"allowed_casualness" text DEFAULT 'none' NOT NULL,
	"user_style" text DEFAULT 'unknown' NOT NULL,
	"current_topic" text,
	"last_dialogue_act" text,
	"last_boundary_at" timestamp with time zone,
	"recent_ai_openers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"repeated_failure_count" integer DEFAULT 0 NOT NULL,
	"snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dialogue_states_room_id_persona_user_id_target_user_id_pk" PRIMARY KEY("room_id","persona_user_id","target_user_id")
);
--> statement-breakpoint
CREATE TABLE "dialogue_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"persona_user_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"user_message_id" uuid,
	"user_text" text NOT NULL,
	"intent" text NOT NULL,
	"emotion" text NOT NULL,
	"respect_signal" text NOT NULL,
	"dialogue_act" text NOT NULL,
	"fact_lookup_needed" boolean DEFAULT false NOT NULL,
	"reply_messages_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"human_likeness_score" integer DEFAULT 0 NOT NULL,
	"repetition_score" integer DEFAULT 0 NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_inviter_user_id_users_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_used_by_user_id_users_id_fk" FOREIGN KEY ("used_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_members" ADD CONSTRAINT "chat_room_members_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_members" ADD CONSTRAINT "chat_room_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_deletions" ADD CONSTRAINT "message_deletions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_deletions" ADD CONSTRAINT "message_deletions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_link_previews" ADD CONSTRAINT "message_link_previews_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_stickers" ADD CONSTRAINT "message_stickers_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_stickers" ADD CONSTRAINT "message_stickers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocker_user_id_users_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_caller_id_users_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_callee_id_users_id_fk" FOREIGN KEY ("callee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_chat_room_id_chat_rooms_id_fk" FOREIGN KEY ("chat_room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dungeon_sessions" ADD CONSTRAINT "dungeon_sessions_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_quests" ADD CONSTRAINT "life_quests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_quests" ADD CONSTRAINT "life_quests_star_profile_id_star_profiles_id_fk" FOREIGN KEY ("star_profile_id") REFERENCES "public"."star_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_sessions" ADD CONSTRAINT "battle_sessions_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_turns" ADD CONSTRAINT "battle_turns_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_turns" ADD CONSTRAINT "battle_turns_speaker_id_users_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_battle_stats" ADD CONSTRAINT "user_battle_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_identity_history" ADD CONSTRAINT "persona_identity_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_profiles" ADD CONSTRAINT "persona_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clans" ADD CONSTRAINT "clans_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_memories" ADD CONSTRAINT "clan_memories_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_memories" ADD CONSTRAINT "clan_memories_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_wisdom" ADD CONSTRAINT "clan_wisdom_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_wisdom" ADD CONSTRAINT "clan_wisdom_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_war_participants" ADD CONSTRAINT "clan_war_participants_war_id_clan_wars_id_fk" FOREIGN KEY ("war_id") REFERENCES "public"."clan_wars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_war_participants" ADD CONSTRAINT "clan_war_participants_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_war_participants" ADD CONSTRAINT "clan_war_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_war_results" ADD CONSTRAINT "clan_war_results_war_id_clan_wars_id_fk" FOREIGN KEY ("war_id") REFERENCES "public"."clan_wars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_wars" ADD CONSTRAINT "clan_wars_challenger_clan_id_clans_id_fk" FOREIGN KEY ("challenger_clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_wars" ADD CONSTRAINT "clan_wars_opponent_clan_id_clans_id_fk" FOREIGN KEY ("opponent_clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_wars" ADD CONSTRAINT "clan_wars_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_wars" ADD CONSTRAINT "clan_wars_winner_clan_id_clans_id_fk" FOREIGN KEY ("winner_clan_id") REFERENCES "public"."clans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_profiles" ADD CONSTRAINT "fan_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_growth_events" ADD CONSTRAINT "star_growth_events_star_profile_id_star_profiles_id_fk" FOREIGN KEY ("star_profile_id") REFERENCES "public"."star_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_growth_events" ADD CONSTRAINT "star_growth_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_profiles" ADD CONSTRAINT "star_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_play_modes" ADD CONSTRAINT "user_play_modes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_feed_comments" ADD CONSTRAINT "star_feed_comments_post_id_star_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."star_feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_feed_comments" ADD CONSTRAINT "star_feed_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_feed_posts" ADD CONSTRAINT "star_feed_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_feed_reactions" ADD CONSTRAINT "star_feed_reactions_post_id_star_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."star_feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_feed_reactions" ADD CONSTRAINT "star_feed_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_update_history" ADD CONSTRAINT "profile_update_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_update_history" ADD CONSTRAINT "profile_update_history_feed_post_id_star_feed_posts_id_fk" FOREIGN KEY ("feed_post_id") REFERENCES "public"."star_feed_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_verification_challenges" ADD CONSTRAINT "wallet_verification_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_talk_rewards" ADD CONSTRAINT "daily_talk_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_talk_rewards" ADD CONSTRAINT "daily_talk_rewards_feed_post_id_star_feed_posts_id_fk" FOREIGN KEY ("feed_post_id") REFERENCES "public"."star_feed_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvt_transactions" ADD CONSTRAINT "pvt_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvt_wallets" ADD CONSTRAINT "pvt_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "another_me_room_settings" ADD CONSTRAINT "another_me_room_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "another_me_room_settings" ADD CONSTRAINT "another_me_room_settings_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "another_me_sessions" ADD CONSTRAINT "another_me_sessions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "another_me_sessions" ADD CONSTRAINT "another_me_sessions_summoned_by_user_id_users_id_fk" FOREIGN KEY ("summoned_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "another_me_sessions" ADD CONSTRAINT "another_me_sessions_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "another_me_sessions" ADD CONSTRAINT "another_me_sessions_dismissed_by_user_id_users_id_fk" FOREIGN KEY ("dismissed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "another_me_settings" ADD CONSTRAINT "another_me_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "another_me_tone_profiles" ADD CONSTRAINT "another_me_tone_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_campaign_deliveries" ADD CONSTRAINT "ai_campaign_deliveries_campaign_id_ai_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ai_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_campaign_deliveries" ADD CONSTRAINT "ai_campaign_deliveries_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_campaign_deliveries" ADD CONSTRAINT "ai_campaign_deliveries_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_campaigns" ADD CONSTRAINT "ai_campaigns_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_campaigns" ADD CONSTRAINT "ai_campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_extraction_jobs" ADD CONSTRAINT "knowledge_extraction_jobs_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_extraction_jobs" ADD CONSTRAINT "knowledge_extraction_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_review_events" ADD CONSTRAINT "knowledge_review_events_review_item_id_knowledge_review_items_id_fk" FOREIGN KEY ("review_item_id") REFERENCES "public"."knowledge_review_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_review_events" ADD CONSTRAINT "knowledge_review_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_review_items" ADD CONSTRAINT "knowledge_review_items_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_review_items" ADD CONSTRAINT "knowledge_review_items_job_id_knowledge_extraction_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."knowledge_extraction_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_review_items" ADD CONSTRAINT "knowledge_review_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_review_items" ADD CONSTRAINT "knowledge_review_items_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ai_memories" ADD CONSTRAINT "user_ai_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ai_memories" ADD CONSTRAINT "user_ai_memories_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ontology_sync_jobs" ADD CONSTRAINT "ontology_sync_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_room_members_user_id_idx" ON "chat_room_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_room_members_room_id_idx" ON "chat_room_members" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "chat_room_members_room_id_last_read_seq_idx" ON "chat_room_members" USING btree ("room_id","last_read_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "message_deletions_message_id_user_id_idx" ON "message_deletions" USING btree ("message_id","user_id");--> statement-breakpoint
CREATE INDEX "message_deletions_user_id_idx" ON "message_deletions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_link_previews_message_id_idx" ON "message_link_previews" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_link_previews_status_idx" ON "message_link_previews" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "message_stickers_message_id_user_id_idx" ON "message_stickers" USING btree ("message_id","user_id");--> statement-breakpoint
CREATE INDEX "message_stickers_message_id_idx" ON "message_stickers" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "messages_room_id_created_at_idx" ON "messages" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_room_id_room_seq_idx" ON "messages" USING btree ("room_id","room_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_room_id_room_seq_unique_idx" ON "messages" USING btree ("room_id","room_seq") WHERE "messages"."room_seq" > 0;--> statement-breakpoint
CREATE INDEX "persona_identity_history_user_idx" ON "persona_identity_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "persona_profiles_status_idx" ON "persona_profiles" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "xp_events_user_id_created_at_idx" ON "xp_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "clan_memories_clan_id_created_at_idx" ON "clan_memories" USING btree ("clan_id","created_at");--> statement-breakpoint
CREATE INDEX "clan_memories_clan_id_importance_idx" ON "clan_memories" USING btree ("clan_id","importance_score");--> statement-breakpoint
CREATE INDEX "clan_memories_clan_id_memory_type_idx" ON "clan_memories" USING btree ("clan_id","memory_type");--> statement-breakpoint
CREATE INDEX "clan_war_participants_war_idx" ON "clan_war_participants" USING btree ("war_id");--> statement-breakpoint
CREATE INDEX "clan_war_participants_clan_idx" ON "clan_war_participants" USING btree ("clan_id");--> statement-breakpoint
CREATE INDEX "clan_wars_status_idx" ON "clan_wars" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clan_wars_challenger_idx" ON "clan_wars" USING btree ("challenger_clan_id");--> statement-breakpoint
CREATE INDEX "clan_wars_opponent_idx" ON "clan_wars" USING btree ("opponent_clan_id");--> statement-breakpoint
CREATE INDEX "quest_progress_user_type_idx" ON "quest_progress" USING btree ("user_id","quest_type");--> statement-breakpoint
CREATE INDEX "star_growth_events_star_created_at_idx" ON "star_growth_events" USING btree ("star_profile_id","created_at");--> statement-breakpoint
CREATE INDEX "star_growth_events_user_created_at_idx" ON "star_growth_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "star_profiles_unique_nft_idx" ON "star_profiles" USING btree ("chain_id","contract_address","token_id");--> statement-breakpoint
CREATE INDEX "star_profiles_user_id_equipped_idx" ON "star_profiles" USING btree ("user_id","equipped_at");--> statement-breakpoint
CREATE INDEX "star_feed_comments_post_id_created_at_idx" ON "star_feed_comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "star_feed_comments_user_id_idx" ON "star_feed_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "star_feed_posts_created_at_idx" ON "star_feed_posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "star_feed_posts_kind_created_at_idx" ON "star_feed_posts" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "star_feed_posts_author_user_id_idx" ON "star_feed_posts" USING btree ("author_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "star_feed_reactions_post_user_idx" ON "star_feed_reactions" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "star_feed_reactions_post_id_idx" ON "star_feed_reactions" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "star_feed_reactions_user_id_idx" ON "star_feed_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profile_update_history_user_created_at_idx" ON "profile_update_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "profile_update_history_feed_post_id_idx" ON "profile_update_history" USING btree ("feed_post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_wallets_wallet_address_idx" ON "user_wallets" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "user_wallets_user_id_idx" ON "user_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_wallets_user_id_nft_verified_idx" ON "user_wallets" USING btree ("user_id","nft_verified_at");--> statement-breakpoint
CREATE INDEX "wallet_challenges_user_wallet_idx" ON "wallet_verification_challenges" USING btree ("user_id","wallet_address");--> statement-breakpoint
CREATE INDEX "wallet_challenges_expires_at_idx" ON "wallet_verification_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_talk_rewards_user_date_idx" ON "daily_talk_rewards" USING btree ("user_id","reward_date");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_talk_rewards_idempotency_key_idx" ON "daily_talk_rewards" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "daily_talk_rewards_user_created_at_idx" ON "daily_talk_rewards" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "daily_talk_rewards_feed_post_id_idx" ON "daily_talk_rewards" USING btree ("feed_post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pvt_transactions_source_unique_idx" ON "pvt_transactions" USING btree ("source","source_id","type");--> statement-breakpoint
CREATE INDEX "pvt_transactions_user_created_at_idx" ON "pvt_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pvt_wallets_user_id_idx" ON "pvt_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "another_me_room_settings_user_room_idx" ON "another_me_room_settings" USING btree ("user_id","room_id");--> statement-breakpoint
CREATE INDEX "another_me_room_settings_room_idx" ON "another_me_room_settings" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "another_me_sessions_room_status_idx" ON "another_me_sessions" USING btree ("room_id","status");--> statement-breakpoint
CREATE INDEX "another_me_sessions_owner_status_idx" ON "another_me_sessions" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "another_me_sessions_active_owner_room_idx" ON "another_me_sessions" USING btree ("owner_user_id","room_id") WHERE "another_me_sessions"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "another_me_settings_user_id_idx" ON "another_me_settings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "another_me_tone_profiles_user_relationship_idx" ON "another_me_tone_profiles" USING btree ("user_id","relationship_type");--> statement-breakpoint
CREATE INDEX "ai_campaign_deliveries_campaign_target_idx" ON "ai_campaign_deliveries" USING btree ("campaign_id","target_user_id");--> statement-breakpoint
CREATE INDEX "ai_campaigns_tenant_status_idx" ON "ai_campaigns" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_documents_source_idx" ON "knowledge_documents" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_extraction_jobs_tenant_status_idx" ON "knowledge_extraction_jobs" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_review_events_item_idx" ON "knowledge_review_events" USING btree ("review_item_id");--> statement-breakpoint
CREATE INDEX "knowledge_review_items_tenant_status_idx" ON "knowledge_review_items" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_review_items_source_idx" ON "knowledge_review_items" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_review_items_item_type_status_idx" ON "knowledge_review_items" USING btree ("item_type","status");--> statement-breakpoint
CREATE INDEX "knowledge_sources_tenant_status_idx" ON "knowledge_sources" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_sources_created_by_idx" ON "knowledge_sources" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "user_ai_memories_user_status_idx" ON "user_ai_memories" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ontology_sync_jobs_source_key_idx" ON "ontology_sync_jobs" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "ontology_sync_jobs_status_available_idx" ON "ontology_sync_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "ontology_sync_jobs_user_created_idx" ON "ontology_sync_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "another_me_reply_jobs_status_available_idx" ON "another_me_reply_jobs" USING btree ("status","available_at","created_at");--> statement-breakpoint
CREATE INDEX "dialogue_states_persona_target_idx" ON "dialogue_states" USING btree ("persona_user_id","target_user_id");--> statement-breakpoint
CREATE INDEX "dialogue_turns_room_created_idx" ON "dialogue_turns" USING btree ("room_id","created_at");