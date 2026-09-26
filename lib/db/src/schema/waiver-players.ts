import { pgTable, text, serial, integer, real, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const waiverPlayersTable = pgTable("waiver_players", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull(),
  espnPlayerId: text("espn_player_id").notNull(),
  fullName: text("full_name").notNull(),
  position: text("position").notNull(),
  proTeam: text("pro_team").notNull().default(""),
  availability: text("availability").notNull(),
  percentOwned: real("percent_owned"),
  percentStarted: real("percent_started"),
  projectedPoints: real("projected_points"),
  totalPoints: real("total_points"),
  injuryStatus: text("injury_status"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("waiver_players_league_player_unique").on(table.leagueId, table.espnPlayerId)]);

export type WaiverPlayer = typeof waiverPlayersTable.$inferSelect;
