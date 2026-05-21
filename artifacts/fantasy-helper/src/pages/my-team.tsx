import React, { useState, useEffect } from "react";
import { useListLeagues, useListTeams, useListTeamPlayers, useGetTeamInsights } from "@workspace/api-client-react";
import { useSport } from "@/contexts/sport-context";
import { PlayerAvatar } from "@/components/player-avatar";
import { TeamAvatar } from "@/components/team-avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Sparkles, TrendingUp, ArrowRightLeft, List, AlertTriangle, RefreshCw } from "lucide-react";
import { Link } from "wouter";

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
    if (leagues && leagues.length > 0 && !leagueId) {
      setLeagueId(leagues[0]!.id);
    }
    if (leagues && leagues.length === 0) {
      setLeagueId(null);
    }
  }, [leagues]);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    setMyTeamId(saved ? parseInt(saved, 10) : null);
  }, [sport, storageKey]);

  const { data: teams, isLoading: teamsLoading } = useListTeams(leagueId ?? 0, {
    query: { enabled: !!leagueId },
  });

  const { data: players, isLoading: playersLoading } = useListTeamPlayers(myTeamId ?? 0, {
    query: { enabled: !!myTeamId },
  });

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
  };

  const myTeam = teams?.find((t) => t.id === myTeamId);
  const selectedLeague = leagues?.find((l) => l.id === leagueId);

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
  const bench = players?.filter((p) => ["BENCH", "IR"].includes(p.position)) ?? [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight uppercase">My Team</h1>
        <p className="text-muted-foreground mt-1">Your roster for the current season.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        {leagues.length > 1 && (
          <Select value={leagueId?.toString()} onValueChange={(v) => setLeagueId(parseInt(v, 10))}>
            <SelectTrigger className="w-full sm:w-56 bg-card">
              <SelectValue placeholder="Select league" />
            </SelectTrigger>
            <SelectContent>
              {leagues.map((l) => (
                <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={myTeamId?.toString() ?? ""} onValueChange={handleTeamSelect} disabled={teamsLoading || !teams}>
          <SelectTrigger className="w-full sm:w-64 bg-card">
            <SelectValue placeholder={teamsLoading ? "Loading teams…" : "Which team is yours?"} />
          </SelectTrigger>
          <SelectContent>
            {teams?.map((t) => (
              <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {myTeam && (
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-4">
              <TeamAvatar name={myTeam.name} abbrev={myTeam.abbrev} size="lg" />
              <div className="flex-1">
                <h2 className="text-xl font-bold">{myTeam.name}</h2>
                <p className="text-sm text-muted-foreground uppercase tracking-wide">
                  {selectedLeague?.name} · {selectedLeague?.season}
                </p>
              </div>
              <div className="flex gap-6 text-center">
                <div>
                  <p className="text-2xl font-bold text-primary">{myTeam.wins}</p>
                  <p className="text-xs text-muted-foreground uppercase">Wins</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{myTeam.losses}</p>
                  <p className="text-xs text-muted-foreground uppercase">Losses</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{myTeam.pointsFor?.toFixed(0) ?? "—"}</p>
                  <p className="text-xs text-muted-foreground uppercase">PF</p>
                </div>
                {myTeam.waiversPosition && (
                  <div>
                    <p className="text-2xl font-bold">{myTeam.waiversPosition}</p>
                    <p className="text-xs text-muted-foreground uppercase">Waiver</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {myTeamId && (
        <div className="space-y-4">
          {playersLoading ? (
            <div className="space-y-3">
              {[1,2,3,4,5,6,7,8].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : players && players.length > 0 ? (
            <>
              <RosterTable title="Starters" players={starters} sport={selectedLeague?.sport ?? sport} />
              {bench.length > 0 && <RosterTable title="Bench / IR" players={bench} sport={selectedLeague?.sport ?? sport} />}
            </>
          ) : (
            <div className="text-center text-muted-foreground p-12">No players found.</div>
          )}

          <AiInsightsPanel
            insights={insights}
            isLoading={insightsLoading}
            isError={insightsError}
            onGenerate={() => {
              setInsightsEnabled(true);
              if (insightsEnabled) refetchInsights();
            }}
            hasTeam={!!myTeamId}
          />
        </div>
      )}

      {!myTeamId && !teamsLoading && teams && teams.length > 0 && (
        <div className="text-center text-muted-foreground p-12 border border-dashed border-border rounded-lg">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Select your team above to see your roster.</p>
          <p className="text-sm mt-1">Your choice is saved — you won't need to pick again.</p>
        </div>
      )}
    </div>
  );
}

const TIP_ICONS: Record<string, React.ReactNode> = {
  trade: <ArrowRightLeft className="w-4 h-4" />,
  waiver: <List className="w-4 h-4" />,
  lineup: <TrendingUp className="w-4 h-4" />,
  general: <Sparkles className="w-4 h-4" />,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-400 border-red-400/30 bg-red-400/10",
  medium: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  low: "text-blue-400 border-blue-400/30 bg-blue-400/10",
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

function AiInsightsPanel({
  insights,
  isLoading,
  isError,
  onGenerate,
  hasTeam,
}: {
  insights: InsightsShape | undefined;
  isLoading: boolean;
  isError: boolean;
  onGenerate: () => void;
  hasTeam: boolean;
}) {
  if (!hasTeam) return null;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="uppercase tracking-wide flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Insights
            </CardTitle>
            <CardDescription>Personalised tips based on your roster and standing</CardDescription>
          </div>
          {insights && (
            <Button variant="outline" size="sm" onClick={onGenerate} className="gap-2 uppercase text-xs font-bold tracking-wide">
              <RefreshCw className="w-3 h-3" />
              Refresh
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!insights && !isLoading && !isError && (
          <div className="flex flex-col items-center py-8 gap-4 text-center">
            <div className="bg-primary/10 rounded-full p-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="font-medium">Get personalised AI tips for your team</p>
              <p className="text-sm text-muted-foreground mt-1">
                The AI will analyse your roster, standings, and point totals to give you actionable advice.
              </p>
            </div>
            <Button onClick={onGenerate} className="gap-2 uppercase font-bold tracking-wide">
              <Sparkles className="w-4 h-4" />
              Generate Insights
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center py-8 gap-3 text-center">
            <AlertTriangle className="w-8 h-8 text-yellow-500" />
            <p className="text-sm text-muted-foreground">Couldn't load insights right now. Try again in a moment.</p>
            <Button variant="outline" onClick={onGenerate} size="sm" className="uppercase font-bold tracking-wide">Retry</Button>
          </div>
        )}

        {insights && !isLoading && (
          <div className="space-y-4">
            {insights.standingsRank != null && insights.totalTeams != null && (
              <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-secondary/40 border border-border/50">
                <TrendingUp className="w-4 h-4 text-muted-foreground shrink-0" />
                <p className="text-sm">
                  <span className="font-bold">#{insights.standingsRank}</span>
                  <span className="text-muted-foreground"> of {insights.totalTeams} teams</span>
                  {insights.standingsRank <= Math.ceil(insights.totalTeams / 2)
                    ? <span className="text-green-400 ml-2 text-xs font-bold">UPPER HALF</span>
                    : <span className="text-red-400 ml-2 text-xs font-bold">LOWER HALF</span>}
                </p>
              </div>
            )}

            <div className="px-4 py-3 rounded-lg border border-border/50 bg-background text-sm leading-relaxed">
              {insights.insights}
            </div>

            {insights.tips && insights.tips.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Action Items</p>
                {insights.tips.map((tip: InsightTipShape, i: number) => (
                  <div key={i} className="flex gap-3 p-3 rounded-lg border border-border/50 bg-background">
                    <div className={`shrink-0 mt-0.5 p-1.5 rounded border ${PRIORITY_COLORS[tip.priority] ?? "text-muted-foreground border-border bg-secondary"}`}>
                      {TIP_ICONS[tip.type] ?? <Sparkles className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold uppercase tracking-wide capitalize">{tip.type}</span>
                        {tip.player && (
                          <span className="text-xs text-primary font-bold">· {tip.player}</span>
                        )}
                        <span className={`ml-auto text-xs font-bold uppercase px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[tip.priority] ?? ""}`}>
                          {tip.priority}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-snug">{tip.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {insights.cached && (
              <p className="text-xs text-muted-foreground text-right">Cached result · refreshes every 30 min</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RosterTable({ title, players, sport }: {
  title: string;
  players: Array<{ id: number; espnPlayerId: string; fullName: string; position: string; proTeam: string; projectedPoints?: number | null; totalPoints?: number | null; injuryStatus?: string | null }>;
  sport: string;
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <div className="px-4 py-3 bg-secondary/40 border-b border-border">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border/50">
            <TableHead className="uppercase text-xs tracking-wider w-20">Pos</TableHead>
            <TableHead className="uppercase text-xs tracking-wider">Player</TableHead>
            <TableHead className="uppercase text-xs tracking-wider">Pro Team</TableHead>
            <TableHead className="uppercase text-xs tracking-wider text-right">Pts</TableHead>
            <TableHead className="uppercase text-xs tracking-wider text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((player) => (
            <TableRow key={player.id} className="border-border/50">
              <TableCell>
                <span className="bg-secondary text-secondary-foreground text-xs font-bold px-2 py-1 rounded">
                  {player.position}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <PlayerAvatar espnPlayerId={player.espnPlayerId} sport={sport} name={player.fullName} size="sm" />
                  <span className="font-medium">{player.fullName}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground uppercase text-xs font-bold tracking-wide">{player.proTeam}</TableCell>
              <TableCell className="text-right font-mono font-bold text-primary">
                {player.totalPoints?.toFixed(1) ?? "—"}
              </TableCell>
              <TableCell className="text-right">
                {player.injuryStatus && !["ACTIVE", "NORMAL"].includes(player.injuryStatus) ? (
                  <Badge variant="destructive" className="text-xs">{player.injuryStatus}</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
