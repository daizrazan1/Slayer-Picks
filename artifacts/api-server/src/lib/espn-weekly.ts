import { db, leaguesTable, matchupsTable, teamsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getCurrentEspnWeek, parseCurrentMatchups, type EspnWeeklyLeague } from "./espn-weekly-data";

export { getCurrentEspnWeek, getWeeklyPlayerPoints } from "./espn-weekly-data";
export type { EspnWeeklyLeague } from "./espn-weekly-data";

export async function saveCurrentMatchups(leagueId: number, raw: EspnWeeklyLeague): Promise<number> {
  const week = getCurrentEspnWeek(raw);
  await db.update(leaguesTable).set({ currentMatchupPeriod: week }).where(eq(leaguesTable.id, leagueId));
  if (!week || !Array.isArray(raw.schedule)) return 0;

  const teams = await db.select({ id: teamsTable.id, espnTeamId: teamsTable.espnTeamId })
    .from(teamsTable).where(eq(teamsTable.leagueId, leagueId));
  const teamIds = new Map(teams.map((team) => [team.espnTeamId, team.id]));
  const rows = parseCurrentMatchups(raw, teamIds).map((matchup) => ({ leagueId, ...matchup }));

  await db.transaction(async (tx) => {
    await tx.delete(matchupsTable).where(eq(matchupsTable.leagueId, leagueId));
    if (rows.length) await tx.insert(matchupsTable).values(rows).onConflictDoNothing();
  });
  return rows.length;
}
