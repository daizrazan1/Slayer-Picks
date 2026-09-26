import { pgTable, serial, integer, real, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const matchupsTable = pgTable("matchups", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull(),
  week: integer("week").notNull(),
  homeTeamId: integer("home_team_id").notNull(),
  awayTeamId: integer("away_team_id").notNull(),
  homePoints: real("home_points"),
  awayPoints: real("away_points"),
  homeProjectedPoints: real("home_projected_points"),
  awayProjectedPoints: real("away_projected_points"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("matchups_league_week_home_unique").on(table.leagueId, table.week, table.homeTeamId),
]);
