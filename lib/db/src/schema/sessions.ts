import { index, json, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Matches the table expected by connect-pg-simple in the API server.
export const userSessionsTable = pgTable(
  "user_sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => [index("IDX_user_sessions_expire").on(table.expire)],
);
