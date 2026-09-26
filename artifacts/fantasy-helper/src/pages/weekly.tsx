import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListLeagues } from "@workspace/api-client-react";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, CalendarDays, RefreshCw, TrendingUp, Users } from "lucide-react";
import { useSport } from "@/contexts/sport-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayerAvatar } from "@/components/player-avatar";
import { TeamAvatar } from "@/components/team-avatar";
import { getLineupSuggestions, isStarter, projectedLineupTotal, type WeeklyPlayer } from "@/lib/weekly-advice";

interface WeeklyTeam {
  id: number;
  name: string;
  abbrev: string;
}

interface WeeklyMatchup {
  homeTeamId: number;
  awayTeamId: number;
  homePoints: number | null;
  awayPoints: number | null;
  homeProjectedPoints: number | null;
  awayProjectedPoints: number | null;
}

interface WeeklyResponse {
  league: { id: number; name: string; sport: string; season: number };
  week: number | null;
  syncedAt: string;
  myTeam: WeeklyTeam | null;
  opponent: WeeklyTeam | null;
  matchup: WeeklyMatchup | null;
  myPlayers: WeeklyPlayer[];
  opponentPlayers: WeeklyPlayer[];
}

const SLOT_ORDER = ["QB", "TQB", "RB", "WR", "TE", "RB/WR", "WR/TE", "FLEX", "OP", "D/ST", "K"];
const points = (value: number | null | undefined) => value == null ? "—" : value.toFixed(1);

function sortLineup(players: WeeklyPlayer[]): WeeklyPlayer[] {
  return [...players].sort((a, b) => {
    const aIndex = SLOT_ORDER.indexOf(a.lineupSlot ?? "");
    const bIndex = SLOT_ORDER.indexOf(b.lineupSlot ?? "");
    if (aIndex !== bIndex) return (aIndex < 0 ? SLOT_ORDER.length : aIndex) - (bIndex < 0 ? SLOT_ORDER.length : bIndex);
    return a.fullName.localeCompare(b.fullName);
  });
}

function LineupPanel({ title, players, showBench = false }: { title: string; players: WeeklyPlayer[]; showBench?: boolean }) {
  const starters = sortLineup(players.filter(isStarter));
  const bench = players.filter((player) => player.lineupSlot === "BENCH" || player.lineupSlot === "IR")
    .sort((a, b) => (b.projectedPoints ?? -1) - (a.projectedPoints ?? -1));

  const playerRow = (player: WeeklyPlayer) => (
    <div key={player.id} className="flex items-center gap-2.5 px-3 py-2 border-t border-border/50 text-sm">
      <span className="w-12 shrink-0 text-xs font-bold text-primary">{player.lineupSlot ?? "—"}</span>
      <PlayerAvatar espnPlayerId={player.espnPlayerId} sport="football" name={player.fullName} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{player.fullName}</div>
        <div className="text-xs text-muted-foreground">{player.position} · {player.proTeam}</div>
      </div>
      {player.injuryStatus && !["ACTIVE", "NORMAL"].includes(player.injuryStatus) && (
        <Badge variant="destructive" className="text-[10px] shrink-0">{player.injuryStatus}</Badge>
      )}
      <div className="text-right shrink-0 w-12">
        <div className="font-mono font-bold">{points(player.weeklyPoints)}</div>
        <div className="text-[10px] text-muted-foreground">pts</div>
      </div>
      <div className="text-right shrink-0 w-16">
        <div className="font-mono font-bold text-primary">{points(player.projectedPoints)}</div>
        <div className="text-[10px] text-muted-foreground">proj</div>
      </div>
    </div>
  );

  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm uppercase tracking-wide">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {starters.length ? starters.map(playerRow) : <p className="px-4 py-5 text-sm text-muted-foreground">No lineup slots synced yet.</p>}
        {showBench && bench.length > 0 && (
          <>
            <div className="px-4 py-2 bg-secondary/30 text-xs font-bold uppercase tracking-wide text-muted-foreground">Bench / IR</div>
            {bench.map(playerRow)}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function Weekly() {
  const { sport } = useSport();
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const { data: leagues, isLoading: leaguesLoading } = useListLeagues({ sport });

  useEffect(() => {
    if (!leagues) return;
    setLeagueId((current) => leagues.some((league) => league.id === current) ? current : leagues[0]?.id ?? null);
  }, [leagues]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<WeeklyResponse>({
    queryKey: ["weekly", leagueId],
    enabled: !!leagueId && sport === "football",
    queryFn: async () => {
      const response = await fetch(`/api/leagues/${leagueId}/weekly`, { credentials: "include" });
      if (!response.ok) throw new Error(`Weekly data could not be loaded (${response.status})`);
      return response.json();
    },
  });

  const suggestions = useMemo(() => getLineupSuggestions(data?.myPlayers ?? []), [data?.myPlayers]);
  const hasProjections = data?.myPlayers.some((player) => isStarter(player) && player.projectedPoints != null) ?? false;
  const myTeamIsHome = !!data?.matchup && data.matchup.homeTeamId === data.myTeam?.id;
  const myScore = data?.matchup ? myTeamIsHome ? data.matchup.homePoints : data.matchup.awayPoints : null;
  const opponentScore = data?.matchup ? myTeamIsHome ? data.matchup.awayPoints : data.matchup.homePoints : null;
  const myProjection = data?.matchup
    ? (myTeamIsHome ? data.matchup.homeProjectedPoints : data.matchup.awayProjectedPoints) ?? projectedLineupTotal(data.myPlayers)
    : projectedLineupTotal(data?.myPlayers ?? []);
  const opponentProjection = data?.matchup
    ? (myTeamIsHome ? data.matchup.awayProjectedPoints : data.matchup.homeProjectedPoints) ?? projectedLineupTotal(data.opponentPlayers)
    : null;
  const edge = myProjection != null && opponentProjection != null ? myProjection - opponentProjection : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight uppercase">Weekly Lineup</h1>
          <p className="text-muted-foreground mt-1">Your matchup, starters, and projection-based start/sit ideas.</p>
        </div>
        <div className="flex gap-2">
          {leagues && leagues.length > 1 && (
            <Select value={leagueId?.toString()} onValueChange={(value) => setLeagueId(Number(value))}>
              <SelectTrigger className="w-44 bg-card"><SelectValue placeholder="League" /></SelectTrigger>
              <SelectContent>{leagues.map((league) => <SelectItem key={league.id} value={league.id.toString()}>{league.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {data && <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh weekly view"><RefreshCw className="w-4 h-4" /></Button>}
        </div>
      </div>

      {sport !== "football" ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Weekly lineup advice is available for football. Select Football above to view it.</CardContent></Card>
      ) : leaguesLoading || isLoading ? (
        <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /><Skeleton className="h-64 w-full" /></div>
      ) : !leagues?.length ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Sync your ESPN football league to see your weekly lineup. <Link href="/sync" className="text-primary font-semibold underline">Go to Sync</Link></CardContent></Card>
      ) : isError ? (
        <Card><CardContent className="py-10 text-center"><p className="text-muted-foreground">The weekly view could not load.</p><Button variant="outline" className="mt-3" onClick={() => refetch()}>Try again</Button></CardContent></Card>
      ) : data && !data.myTeam ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Your team was not identified in this league. <Link href="/sync" className="text-primary font-semibold underline">Sync from your ESPN team page</Link>.</CardContent></Card>
      ) : data && !data.week ? (
        <Card><CardContent className="py-10 text-center space-y-3"><CalendarDays className="w-10 h-10 mx-auto text-primary" /><h2 className="font-bold text-lg">Weekly data needs a fresh sync</h2><p className="text-muted-foreground text-sm">Replace your ESPN Sync bookmark from the Sync page, then use it on your ESPN league page.</p><Link href="/sync" className="text-primary font-semibold underline">Open Sync instructions</Link></CardContent></Card>
      ) : data ? (
        <>
          <Card className="border-primary/30 bg-card">
            <CardContent className="py-5 space-y-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground font-bold">
                <span>Week {data.week} · {data.league.name}</span>
                <span>Synced {new Date(data.syncedAt).toLocaleString()}</span>
              </div>
              {data.matchup && data.opponent ? (
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="flex flex-col items-center text-center gap-2">
                    <TeamAvatar name={data.myTeam!.name} abbrev={data.myTeam!.abbrev} size="lg" />
                    <div className="font-bold">{data.myTeam!.name}</div>
                    <div className="font-mono text-3xl font-black text-primary">{points(myScore)}</div>
                    <div className="text-xs text-muted-foreground">{points(myProjection)} projected</div>
                  </div>
                  <div className="text-xs uppercase font-bold text-muted-foreground">vs</div>
                  <div className="flex flex-col items-center text-center gap-2">
                    <TeamAvatar name={data.opponent.name} abbrev={data.opponent.abbrev} size="lg" />
                    <div className="font-bold">{data.opponent.name}</div>
                    <div className="font-mono text-3xl font-black">{points(opponentScore)}</div>
                    <div className="text-xs text-muted-foreground">{points(opponentProjection)} projected</div>
                  </div>
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-4">ESPN did not return a matchup for this week. Your lineup is still shown below.</p>
              )}
              {edge != null && (
                <div className="flex items-center justify-center gap-2 text-sm rounded-md bg-secondary/40 py-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  {Math.abs(edge) < 0.05 ? "Projected matchup is even" : edge > 0 ? `Projected lead: ${edge.toFixed(1)} points` : `Projected deficit: ${Math.abs(edge).toFixed(1)} points`}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wide flex items-center gap-2"><ArrowRight className="w-4 h-4 text-primary" /> Start / Sit</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!hasProjections ? (
                <p className="text-sm text-muted-foreground">ESPN has not supplied current-week player projections yet. Sync again after projections are available to see lineup suggestions.</p>
              ) : suggestions.length ? suggestions.map((suggestion) => (
                <div key={`${suggestion.start.id}-${suggestion.sit.id}`} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border border-border px-3 py-3 text-sm">
                  <div className="flex-1"><span className="font-bold text-primary">Start {suggestion.start.fullName}</span><span className="text-muted-foreground"> over {suggestion.sit.fullName} ({suggestion.sit.lineupSlot})</span></div>
                  <Badge className="self-start sm:self-auto">+{suggestion.projectedGain.toFixed(1)} projected</Badge>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">No eligible bench player is projected at least 1 point above a current starter.</p>
              )}
              {data.myPlayers.filter((player) => isStarter(player) && player.injuryStatus && !["ACTIVE", "NORMAL"].includes(player.injuryStatus)).map((player) => (
                <div key={player.id} className="flex items-center gap-2 text-xs text-yellow-400"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Check {player.fullName}'s {player.injuryStatus?.toLowerCase()} status before kickoff.</div>
              ))}
              <p className="text-xs text-muted-foreground">Suggestions compare ESPN projections and eligible lineup slots. Confirm injuries and game status before changing your ESPN lineup.</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <LineupPanel title={`${data.myTeam!.name} · Your lineup`} players={data.myPlayers} showBench />
            {data.opponent ? <LineupPanel title={`${data.opponent.name} · Opponent lineup`} players={data.opponentPlayers} /> : (
              <Card><CardContent className="py-10 text-center text-muted-foreground"><Users className="w-8 h-8 mx-auto mb-3 opacity-40" />Opponent lineup will appear when ESPN returns a matchup.</CardContent></Card>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
