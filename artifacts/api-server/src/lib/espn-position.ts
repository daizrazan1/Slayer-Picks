const FOOTBALL_PLAYER_POSITIONS: Record<number, string> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "D/ST",
};

export function footballPlayerPosition(positionId?: number): string | null {
  return positionId == null ? null : FOOTBALL_PLAYER_POSITIONS[positionId] ?? null;
}

const FOOTBALL_LINEUP_SLOTS: Record<number, string> = {
  0: "QB", 1: "TQB", 2: "RB", 3: "RB/WR", 4: "WR", 5: "WR/TE",
  6: "TE", 7: "OP", 16: "D/ST", 17: "K", 20: "BENCH", 21: "IR", 23: "FLEX",
};

export function footballLineupSlot(slotId?: number): string | null {
  if (slotId == null) return null;
  return FOOTBALL_LINEUP_SLOTS[slotId] ?? `SLOT ${slotId}`;
}
