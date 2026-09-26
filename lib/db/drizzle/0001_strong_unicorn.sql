CREATE TABLE "waiver_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"espn_player_id" text NOT NULL,
	"full_name" text NOT NULL,
	"position" text NOT NULL,
	"pro_team" text DEFAULT '' NOT NULL,
	"availability" text NOT NULL,
	"percent_owned" real,
	"percent_started" real,
	"projected_points" real,
	"total_points" real,
	"injury_status" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "waiver_players_league_player_unique" ON "waiver_players" USING btree ("league_id","espn_player_id");
--> statement-breakpoint
ALTER TABLE "waiver_players" ENABLE ROW LEVEL SECURITY;
