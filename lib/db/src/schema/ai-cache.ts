import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiCacheTable = pgTable("ai_cache", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  promptHash: text("prompt_hash").notNull().unique(),
  prompt: text("prompt").notNull(),
  response: text("response").notNull(),
  teamAId: integer("team_a_id"),
  teamBId: integer("team_b_id"),
  teamAName: text("team_a_name"),
  teamBName: text("team_b_name"),
  winScoreA: real("win_score_a"),
  winScoreB: real("win_score_b"),
  recommendation: text("recommendation"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAiCacheSchema = createInsertSchema(aiCacheTable).omit({ id: true, createdAt: true });
export type InsertAiCache = z.infer<typeof insertAiCacheSchema>;
export type AiCache = typeof aiCacheTable.$inferSelect;
