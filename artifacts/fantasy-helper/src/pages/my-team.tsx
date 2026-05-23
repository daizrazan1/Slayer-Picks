import React, { useState, useEffect, useMemo } from "react";
import { useListLeagues, useListTeams, useListTeamPlayers, useGetTeamInsights } from "@workspace/api-client-react";
import { useSport } from "@/contexts/sport-context";
import { PlayerAvatar } from "@/components/player-avatar";
import { TeamAvatar } from "@/components/team-avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Sparkles, TrendingUp, ArrowRightLeft, List, AlertTriangle, RefreshCw } from "lucide-react";
import { Link } from "wouter";

// ── Color palette for player↔tip connections ─────────────────────────────────
const TAG_PALETTE = [
  { border: "border-l-amber-400",   bg: "bg-amber-400/10",   text: "text-amber-400",   badge: "bg-amber-400/20 text-amber-400 border border-amber-400/50",   dot: "bg-amber-400" },
  { border: "border-l-cyan-400",    bg: "bg-cyan-400/10",    text: "text-cyan-400",    badge: "bg-cyan-400/20 text-cyan-400 border border-cyan-400/50",    dot: "bg-cyan-400" },
  { border: "border-l-violet-400",  bg: "bg-violet-400/10",  text: "text-violet-400",  badge: "bg-violet-400/20 text-violet-400 border border-violet-400/50",  dot: "bg-violet-400" },
  { border: "border-l-emerald-400", bg: "bg-emerald-400/10", text: "text-emerald-400", badge: "bg-emerald-400/20 text-emerald-400 border border-emerald-400/50", dot: "bg-emerald-400" },
  { border: "border-l-rose-400",    bg: "bg-rose-400/10",    text: "text-rose-400",    badge: "bg-rose-400/20 text-rose-400 border border-rose-400/50",    dot: "bg-rose-400" },
] as const;

const TIP_ICONS: Record<string, React.ReactNode> = {
  trade:   <ArrowRightLeft className="w-3.5 h-3.5" />,
  waiver:  <List className="w-3.5 h-3.5" />,
  lineup:  <TrendingUp className="w-3.5 h-3.5" />,
  general: <Sparkles className="w-3.5 h-3.5" />,
};

const PRIORITY_RING: Record<string, string> = {
  high:   "text-red-400 border-red-400/40 bg-red-400/10",
  medium: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
  low:    "text-blue-400 border-blue-400/40 bg-blue-400/10",
};

interface InsightTipShape {
  type: string;
  priority: string;
  player?: string | null;
  message: string;
}

interface InsightsShape {
  teamId: number;
  teamName: string;
  insights: string;
  tips: InsightTipShape[];
  standingsRank?: number | null;
  totalTeams?: number | null;
  cached: boolean;
}

// ── Fuzzy name matching: "Jokic" matches "Nikola Jokic" ──────────────────────
function nameMatchesTip(playerName: string, tipPlayerName: string): boolean {
  const a = playerName.toLowerCase().trim();
  const b = tipPlayerName.toLowerCase().trim();
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const aLast = a.split(" ").pop() ?? "";
  const bLast = b.split(" ").pop() ?? "";
  return aLast.length > 2 && aLast === bLast;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyTeam() {
  const { sport } = useSport();
  const storageKey = `myTeam_${sport}`;

  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [myTeamId, setMyTeamId] = useState<number | null>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved, 10) : null;
  });

  const { data: leagues, isLoading: leaguesLoading } = useListLeagues({ sport });

  useEffect(() => {
    if (leagues && leagues.length > 0 && !leagueId) setLeagueId(leagues[0]!.id);
    if (leagues && leagues.length === 0) setLeagueId(null);
  }, [leagues]);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    setMyTeamId(saved ? parseInt(saved, 10) : null);
  }, [sport, storageKey]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: teams, isLoading: teamsLoading } = useListTeams(leagueId ?? 0, { query: { enabled: !!leagueId } } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: players, isLoading: playersLoading } = useListTeamPlayers(myTeamId ?? 0, { query: { enabled: !!myTeamId } } as any);

  const [insightsEnabled, setInsightsEnabled] = useState(false);
  const {
    data: insights,
    isLoading: insightsLoading,
    isError: insightsError,
    refetch: refetchInsights,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useGetTeamInsights(myTeamId ?? 0, { query: { enabled: insightsEnabled && !!myTeamId } } as any);

  const handleTeamSelect = (val: string) => {
    const id = parseInt(val, 10);
    setMyTeamId(id);
    localStorage.setItem(storageKey, String(id));
    setInsightsEnabled(false);
  };

  const myTeam = teams?.find((t) => t.id === myTeamId);
  const selectedLeague = leagues?.find((l) => l.id === leagueId);

  // Map: playerName (lowercased) → palette entry + tag letter
  const playerTagMap = useMemo(() => {
    const map = new Map<string, { palette: typeof TAG_PALETTE[number]; label: string; tipIndex: number }>();
    if (!insights?.tips) return map;
    let colorIdx = 0;
    insights.tips.forEach((tip, i) => {
      if (tip.player) {
        const key = tip.player.toLowerCase().trim();
        if (!map.has(key)) {
          map.set(key, {
            palette: TAG_PALETTE[colorIdx % TAG_PALETTE.length]!,
            label: String.fromCharCode(65 + colorIdx), // A, B, C…
            tipIndex: i,
          });
          colorIdx++;
        }
      }
    });
    return map;
  }, [insights]);

  const getPlayerTag = (playerName: string) => {
    for (const [tipKey, val] of playerTagMap.entries()) {
      if (nameMatchesTip(playerName, tipKey)) return val;
    }
    return null;
  };

  if (leaguesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!leagues || leagues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 text-center">
        <Users className="w-16 h-16 text-muted-foreground opacity-20" />
        <h2 className="text-2xl font-bold">No leagues synced</h2>
        <p className="text-muted-foreground">Sync your ESPN account first to see your team.</p>
        <Link href="/sync" className="text-primary hover:underline font-bold uppercase mt-4 block">
          Go to Sync
        </Link>
      </div>
    );
  }

  const starters = players?.filter((p) => !["BENCH", "IR"].includes(p.position)) ?? [];
  const bench    = players?.filter((p) => ["BENCH", "IR"].includes(p.position)) ?? [];

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight uppercase">My Team</h1>
          <p className="text-muted-foreground mt-0.5">Your roster for the current season.</p>
        </div>
        <div className="flex gap-3">
          {leagues.length > 1 && (
            <Select value={leagueId?.toString()} onValueChange={(v) => setLeagueId(parseInt(v, 10))}>
              <SelectTrigger className="w-44 bg-card"><SelectValue placeholder="League" /></SelectTrigger>
              <SelectContent>
                {leagues.map((l) => <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={myTeamId?.toString() ?? ""} onValueChange={handleTeamSelect} disabled={teamsLoading || !teams}>
            <SelectTrigger className="w-56 bg-card">
              <SelectValue placeholder={teamsLoading ? "Loading…" : "Which team is yours?"} />
            </SelectTrigger>
            <SelectContent>
              {teams?.map((t) => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Team summary card ── */}
      {myTeam && (
        <Card className="border-border bg-card">
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <TeamAvatar name={myTeam.name} abbrev={myTeam.abbrev} size="lg" />
              <div className="flex-1">
                <h2 className="text-xl font-bold">{myTeam.name}</h2>
                <p className="text-sm text-muted-foreground uppercase tracking-wide">
                  {selectedLeague?.name} · {selectedLeague?.season}
                </p>
              </div>
              <div className="flex gap-6 text-center">
                <div><p className="text-2xl font-bold text-primary">{myTeam.wins}</p><p className="text-xs text-muted-foreground uppercase">Wins</p></div>
                <div><p className="text-2xl font-bold">{myTeam.losses}</p><p className="text-xs text-muted-foreground uppercase">Losses</p></div>
                <div><p className="text-2xl font-bold">{myTeam.pointsFor?.toFixed(0) ?? "—"}</p><p className="text-xs text-muted-foreground uppercase">PF</p></div>
                {myTeam.waiversPosition && (
                  <div><p className="text-2xl font-bold">{myTeam.waiversPosition}</p><p className="text-xs text-muted-foreground uppercase">Waiver</p></div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── No team selected ── */}
      {!myTeamId && !teamsLoading && teams && teams.length > 0 && (
        <div className="text-center text-muted-foreground p-16 border border-dashed border-border rounded-lg">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Select your team above to see your roster.</p>
          <p className="text-sm mt-1">Your choice is saved — you won't need to pick again.</p>
        </div>
      )}

      {/* ── Side-by-side: Roster + Insights ── */}
      {myTeamId && (
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-5 items-start">

          {/* LEFT: roster */}
          <div className="space-y-4">
            {playersLoading ? (
              <div className="space-y-2">{[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : players && players.length > 0 ? (
              <>
                <RosterSection title="Starters" players={starters} sport={selectedLeague?.sport ?? sport} getPlayerTag={getPlayerTag} hasInsights={!!insights} />
                {bench.length > 0 && <RosterSection title="Bench / IR" players={bench} sport={selectedLeague?.sport ?? sport} getPlayerTag={getPlayerTag} hasInsights={!!insights} />}
              </>
            ) : (
              <div className="text-center text-muted-foreground p-12">No players found.</div>
            )}
          </div>

          {/* RIGHT: insights — sticky */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <InsightsSidebar
              insights={insights as InsightsShape | undefined}
              isLoading={insightsLoading}
              isError={insightsError}
              playerTagMap={playerTagMap}
              onGenerate={() => {
                setInsightsEnabled(true);
                if (insightsEnabled) refetchInsights();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Roster section with player tag highlighting ───────────────────────────────
function RosterSection({
  title,
  players,
  sport,
  getPlayerTag,
  hasInsights,
}: {
  title: string;
  players: Array<{ id: number; espnPlayerId: string; fullName: string; position: string; proTeam: string; totalPoints?: number | null; injuryStatus?: string | null }>;
  sport: string;
  getPlayerTag: (name: string) => { palette: typeof TAG_PALETTE[number]; label: string; tipIndex: number } | null;
  hasInsights: boolean;
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <div className="px-4 py-2.5 bg-secondary/40 border-b border-border">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      <div className="divide-y divide-border/50">
        {players.map((player) => {
          const tag = getPlayerTag(player.fullName);
          return (
            <div
              key={player.id}
              className={[
                "flex items-center gap-3 px-3 py-2.5 transition-colors",
                tag ? `border-l-4 ${tag.palette.border} ${tag.palette.bg}` : "border-l-4 border-l-transparent",
              ].join(" ")}
            >
              {/* Position */}
              <span className="bg-secondary text-secondary-foreground text-xs font-bold px-2 py-0.5 rounded w-16 text-center shrink-0">
                {player.position}
              </span>

              {/* Avatar + name */}
              <PlayerAvatar espnPlayerId={player.espnPlayerId} sport={sport} name={player.fullName} size="sm" />
              <span className="font-medium flex-1 min-w-0 truncate">{player.fullName}</span>

              {/* Pro team */}
              <span className="text-muted-foreground uppercase text-xs font-bold tracking-wide hidden sm:block w-10 text-center shrink-0">
                {player.proTeam}
              </span>

              {/* Points */}
              <span className="font-mono font-bold text-primary text-sm w-12 text-right shrink-0">
                {player.totalPoints?.toFixed(1) ?? "—"}
              </span>

              {/* Injury */}
              {player.injuryStatus && !["ACTIVE", "NORMAL"].includes(player.injuryStatus) ? (
                <Badge variant="destructive" className="text-xs shrink-0">{player.injuryStatus}</Badge>
              ) : (
                <span className="w-8 shrink-0" />
              )}

              {/* Tag badge — only shown once insights loaded */}
              <div className="w-7 shrink-0 flex justify-end">
                {tag && hasInsights ? (
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black ${tag.palette.badge}`}>
                    {tag.label}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Insights sidebar ──────────────────────────────────────────────────────────
function InsightsSidebar({
  insights,
  isLoading,
  isError,
  playerTagMap,
  onGenerate,
}: {
  insights: InsightsShape | undefined;
  isLoading: boolean;
  isError: boolean;
  playerTagMap: Map<string, { palette: typeof TAG_PALETTE[number]; label: string; tipIndex: number }>;
  onGenerate: () => void;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm uppercase tracking-wide flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            AI Insights
          </CardTitle>
          {insights && (
            <Button variant="ghost" size="sm" onClick={onGenerate} className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <RefreshCw className="w-3 h-3" />
              Refresh
            </Button>
          )}
        </div>
        {!insights && !isLoading && !isError && (
          <CardDescription className="text-xs">Personalised tips based on your roster & standings</CardDescription>
        )}
      </CardHeader>

      <CardContent className="px-4 pb-4">
        {/* Empty state */}
        {!insights && !isLoading && !isError && (
          <div className="flex flex-col items-center py-6 gap-3 text-center">
            <div className="bg-primary/10 rounded-full p-3">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground leading-snug">
              Get AI tips on who to trade, who to drop, and what your team needs.
            </p>
            <Button onClick={onGenerate} size="sm" className="gap-2 uppercase font-bold tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              Generate Insights
            </Button>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-2.5">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="flex flex-col items-center py-6 gap-3 text-center">
            <AlertTriangle className="w-7 h-7 text-yellow-500" />
            <p className="text-sm text-muted-foreground">Couldn't load insights. Try again.</p>
            <Button variant="outline" onClick={onGenerate} size="sm" className="uppercase font-bold tracking-wide text-xs">Retry</Button>
          </div>
        )}

        {/* Loaded */}
        {insights && !isLoading && (
          <div className="space-y-3">
            {/* Standings banner */}
            {insights.standingsRank != null && insights.totalTeams != null && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/40 border border-border/50 text-sm">
                <TrendingUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="font-bold">#{insights.standingsRank}</span>
                <span className="text-muted-foreground">of {insights.totalTeams}</span>
                {insights.standingsRank <= Math.ceil(insights.totalTeams / 2)
                  ? <span className="ml-auto text-xs font-bold text-green-400">TOP HALF</span>
                  : <span className="ml-auto text-xs font-bold text-red-400">BOTTOM HALF</span>}
              </div>
            )}

            {/* Team summary */}
            <p className="text-xs text-muted-foreground leading-relaxed px-1">{insights.insights}</p>

            {/* Tips */}
            {insights.tips && insights.tips.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Action Items</p>
                {insights.tips.map((tip: InsightTipShape, i: number) => {
                  // Find if this tip has a player tag
                  let tipTag: { palette: typeof TAG_PALETTE[number]; label: string } | null = null;
                  if (tip.player) {
                    const key = tip.player.toLowerCase().trim();
                    for (const [pKey, val] of playerTagMap.entries()) {
                      if (nameMatchesTip(pKey, key) || nameMatchesTip(key, pKey)) {
                        tipTag = val;
                        break;
                      }
                    }
                  }

                  return (
                    <div key={i} className={[
                      "rounded-lg border border-border/60 overflow-hidden",
                      tipTag ? `border-l-4 ${tipTag.palette.border}` : "",
                    ].join(" ")}>
                      {/* Tip header */}
                      <div className={[
                        "flex items-center gap-2 px-3 py-1.5",
                        tipTag ? tipTag.palette.bg : "bg-secondary/30",
                      ].join(" ")}>
                        {/* Tag badge matches roster badge */}
                        {tipTag ? (
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-black shrink-0 ${tipTag.palette.badge}`}>
                            {tipTag.label}
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-secondary text-muted-foreground shrink-0">
                            {TIP_ICONS[tip.type] ?? <Sparkles className="w-3 h-3" />}
                          </span>
                        )}
                        <span className="text-xs font-bold uppercase tracking-wide capitalize flex-1">
                          {tip.type}
                          {tip.player && <span className={`ml-1.5 font-black ${tipTag ? tipTag.palette.text : "text-primary"}`}>· {tip.player}</span>}
                        </span>
                        <span className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded border ${PRIORITY_RING[tip.priority] ?? ""}`}>
                          {tip.priority}
                        </span>
                      </div>
                      {/* Tip body */}
                      <div className="px-3 py-2">
                        <p className="text-xs text-muted-foreground leading-snug">{tip.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {insights.cached && (
              <p className="text-xs text-muted-foreground text-right pt-1">Cached · refreshes every 30 min</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
