export interface EspnWeeklyStat {
  appliedTotal?: number;
  scoringPeriodId?: number;
  seasonId?: number;
  statSourceId?: number;
  statSplitTypeId?: number;
}

interface EspnMatchupSide {
  teamId?: number;
  totalPoints?: number;
  totalProjectedPoints?: number;
}

interface EspnMatchup {
  matchupPeriodId?: number;
  home?: EspnMatchupSide;
  away?: EspnMatchupSide;
}

export interface EspnWeeklyLeague {
  scoringPeriodId?: number;
  status?: { currentMatchupPeriod?: number; currentMatchupPeriodId?: number };
  schedule?: EspnMatchup[];
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getCurrentEspnWeek(raw: EspnWeeklyLeague): number | null {
  const candidates = [raw.status?.currentMatchupPeriod, raw.status?.currentMatchupPeriodId, raw.scoringPeriodId];
  return candidates.find((week): week is number => typeof week === "number" && Number.isInteger(week) && week > 0) ?? null;
}

export function getWeeklyPlayerPoints(stats: EspnWeeklyStat[] | undefined, week: number | null, source: 0 | 1, seasonId: number): number | null {
  if (!week || !stats) return null;
  const currentSeason = stats.filter((stat) => stat.seasonId === seasonId || stat.seasonId == null);
  const entry = currentSeason.find((stat) => stat.scoringPeriodId === week && stat.statSourceId === source && stat.statSplitTypeId === 1 && stat.seasonId === seasonId)
    ?? currentSeason.find((stat) => stat.scoringPeriodId === week && stat.statSourceId === source && stat.statSplitTypeId === 1 && stat.seasonId == null)
    ?? currentSeason.find((stat) => stat.scoringPeriodId === week && stat.statSourceId === source && stat.statSplitTypeId == null);
  return finite(entry?.appliedTotal);
}

export interface ParsedMatchup {
  week: number;
  homeTeamId: number;
  awayTeamId: number;
  homePoints: number | null;
  awayPoints: number | null;
  homeProjectedPoints: number | null;
  awayProjectedPoints: number | null;
}

export function parseCurrentMatchups(raw: EspnWeeklyLeague, teamIds: Map<string, number>): ParsedMatchup[] {
  const week = getCurrentEspnWeek(raw);
  if (!week || !Array.isArray(raw.schedule)) return [];
  return raw.schedule.flatMap((matchup) => {
    if (!matchup || matchup.matchupPeriodId !== week || !matchup.home || !matchup.away) return [];
    const homeTeamId = teamIds.get(String(matchup.home.teamId));
    const awayTeamId = teamIds.get(String(matchup.away.teamId));
    if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return [];
    return [{
      week,
      homeTeamId,
      awayTeamId,
      homePoints: finite(matchup.home.totalPoints),
      awayPoints: finite(matchup.away.totalPoints),
      homeProjectedPoints: finite(matchup.home.totalProjectedPoints),
      awayProjectedPoints: finite(matchup.away.totalProjectedPoints),
    }];
  });
}
