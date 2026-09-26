CREATE TABLE "matchups" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"week" integer NOT NULL,
	"home_team_id" integer NOT NULL,
	"away_team_id" integer NOT NULL,
	"home_points" real,
	"away_points" real,
	"home_projected_points" real,
	"away_projected_points" real,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "current_matchup_period" integer;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "lineup_slot" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "weekly_points" real;--> statement-breakpoint
CREATE UNIQUE INDEX "matchups_league_week_home_unique" ON "matchups" USING btree ("league_id","week","home_team_id");
--> statement-breakpoint
ALTER TABLE "matchups" ENABLE ROW LEVEL SECURITY;
