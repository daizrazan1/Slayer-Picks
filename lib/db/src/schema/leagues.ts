import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leaguesTable = pgTable("leagues", {
  id: serial("id").primaryKey(),
  espnLeagueId: text("espn_league_id").notNull(),
  name: text("name").notNull(),
  season: integer("season").notNull(),
  sport: text("sport").notNull().default("football"),
  teamCount: integer("team_count"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  espnS2: text("espn_s2"),
  swid: text("swid"),
  autoSyncEnabled: boolean("auto_sync_enabled").notNull().default(false),
  lastAutoSyncAt: timestamp("last_auto_sync_at", { withTimezone: true }),
  lastAutoSyncError: text("last_auto_sync_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeagueSchema = createInsertSchema(leaguesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLeague = z.infer<typeof insertLeagueSchema>;
export type League = typeof leaguesTable.$inferSelect;
