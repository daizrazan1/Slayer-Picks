import { pgTable, text, serial, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type EspnPublicStats = {
  gamesPlayed: number;
  statLine: Record<string, number>;
  injuryDescription?: string;
  recentHeadline?: string;
  fetchedAt: string;
};

export const playersTable = pgTable("players", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  espnPlayerId: text("espn_player_id").notNull(),
  fullName: text("full_name").notNull(),
  position: text("position").notNull(),
  proTeam: text("pro_team").notNull().default(""),
  projectedPoints: real("projected_points"),
  avgPoints: real("avg_points"),
  totalPoints: real("total_points"),
  injuryStatus: text("injury_status"),
  espnPublicStats: jsonb("espn_public_stats").$type<EspnPublicStats | null>().default(null),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
