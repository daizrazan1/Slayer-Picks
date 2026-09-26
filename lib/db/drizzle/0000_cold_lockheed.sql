CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"espn_league_id" text NOT NULL,
	"name" text NOT NULL,
	"season" integer NOT NULL,
	"sport" text DEFAULT 'football' NOT NULL,
	"team_count" integer,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"espn_s2" text,
	"swid" text,
	"auto_sync_enabled" boolean DEFAULT false NOT NULL,
	"last_auto_sync_at" timestamp with time zone,
	"last_auto_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"espn_team_id" text NOT NULL,
	"name" text NOT NULL,
	"abbrev" text NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"ties" integer DEFAULT 0 NOT NULL,
	"points_for" real,
	"points_against" real,
	"waivers_position" integer,
	"is_owner_team" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"espn_player_id" text NOT NULL,
	"full_name" text NOT NULL,
	"position" text NOT NULL,
	"pro_team" text DEFAULT '' NOT NULL,
	"projected_points" real,
	"avg_points" real,
	"total_points" real,
	"injury_status" text,
	"espn_public_stats" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"prompt_hash" text NOT NULL,
	"prompt" text NOT NULL,
	"response" text NOT NULL,
	"team_a_id" integer,
	"team_b_id" integer,
	"team_a_name" text,
	"team_b_name" text,
	"win_score_a" real,
	"win_score_b" real,
	"recommendation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_cache_prompt_hash_unique" UNIQUE("prompt_hash")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "IDX_user_sessions_expire" ON "user_sessions" USING btree ("expire");
--> statement-breakpoint
-- The Express API accesses Postgres directly. Deny browser-facing Supabase
-- Data API roles unless explicit policies are added later.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "leagues" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "players" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_cache" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;
