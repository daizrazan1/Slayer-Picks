export interface WeeklyPlayer {
  id: number;
  teamId: number;
  espnPlayerId: string;
  fullName: string;
  position: string;
  lineupSlot: string | null;
  proTeam: string;
  projectedPoints: number | null;
  weeklyPoints: number | null;
  injuryStatus: string | null;
}

export interface LineupSuggestion {
  start: WeeklyPlayer;
  sit: WeeklyPlayer;
  projectedGain: number;
}

export function isStarter(player: WeeklyPlayer): boolean {
  return player.lineupSlot != null && !["BENCH", "IR"].includes(player.lineupSlot);
}

function canFillSlot(position: string, slot: string | null): boolean {
  if (!slot) return false;
  if (slot === position) return true;
  if (slot === "FLEX") return ["RB", "WR", "TE"].includes(position);
  if (slot === "RB/WR") return ["RB", "WR"].includes(position);
  if (slot === "WR/TE") return ["WR", "TE"].includes(position);
  if (slot === "OP") return ["QB", "RB", "WR", "TE"].includes(position);
  if (slot === "TQB") return position === "QB";
  return false;
}

export function getLineupSuggestions(players: WeeklyPlayer[]): LineupSuggestion[] {
  const starters = players.filter((player) => isStarter(player) && player.projectedPoints != null);
  const bench = players.filter((player) => player.lineupSlot === "BENCH"
    && player.projectedPoints != null
    && !["OUT", "IR", "INJURED_RESERVE"].includes(player.injuryStatus?.toUpperCase() ?? ""));
  const suggestions: LineupSuggestion[] = [];
  const replaced = new Set<number>();

  for (const candidate of bench.sort((a, b) => b.projectedPoints! - a.projectedPoints!)) {
    const best = starters
      .filter((starter) => !replaced.has(starter.id) && canFillSlot(candidate.position, starter.lineupSlot))
      .map((starter) => ({ starter, gain: candidate.projectedPoints! - starter.projectedPoints! }))
      .sort((a, b) => b.gain - a.gain)[0];
    if (best && best.gain >= 1) {
      suggestions.push({ start: candidate, sit: best.starter, projectedGain: best.gain });
      replaced.add(best.starter.id);
    }
  }

  return suggestions.sort((a, b) => b.projectedGain - a.projectedGain).slice(0, 3);
}

export function projectedLineupTotal(players: WeeklyPlayer[]): number | null {
  const starters = players.filter(isStarter);
  if (!starters.length || starters.some((player) => player.projectedPoints == null)) return null;
  return starters.reduce((total, player) => total + player.projectedPoints!, 0);
}
