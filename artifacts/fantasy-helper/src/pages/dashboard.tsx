import React from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDashboardSummary,
  useListRecentTrades,
  useDeleteTrade,
  useClearAllTrades,
  getListRecentTradesQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useSport, SPORTS } from "@/contexts/sport-context";
import { PlayerAvatar } from "@/components/player-avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Users, Trophy, Activity, ArrowRightLeft, Clock, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const REC_BADGE: Record<string, string> = {
  Accept:  "bg-green-500/15 text-green-400 border-green-500/30",
  Decline: "bg-red-500/15 text-red-400 border-red-500/30",
  Neutral: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
};

export default function Dashboard() {
  const { sport } = useSport();
  const sportLabel = SPORTS.find(s => s.value === sport)?.label ?? sport;
  const qc = useQueryClient();
  const { data: summary, isLoading } = useGetDashboardSummary({ sport });
  const { data: recentTrades, isLoading: tradesLoading } = useListRecentTrades();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListRecentTradesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ sport }) });
  };

  const { mutate: deleteTrade, isPending: deleting } = useDeleteTrade({
    mutation: { onSuccess: invalidate },
  });

  const { mutate: clearAll, isPending: clearing } = useClearAllTrades({
    mutation: { onSuccess: invalidate },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      </div>
    );
  }

  if (!summary || (summary.leagueCount === 0 && summary.playerCount === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-6 text-center">
        <div className="bg-primary/10 p-6 rounded-full">
          <Activity className="w-12 h-12 text-primary" />
        </div>
        <div className="max-w-md">
          <h2 className="text-2xl font-bold mb-2">No data synced yet</h2>
          <p className="text-muted-foreground mb-6">
            Connect your ESPN fantasy account to start analysing your leagues and evaluating trades.
          </p>
          <Link href="/sync">
            <Button size="lg" className="w-full sm:w-auto font-bold tracking-wide uppercase">
              Sync ESPN Data
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight uppercase">{sportLabel} Command Center</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Last synced: {summary.lastSyncAt ? new Date(summary.lastSyncAt).toLocaleString() : "Never"}
          </p>
        </div>
        <Link href="/sync">
          <Button variant="outline" className="uppercase font-bold tracking-wide">Sync Now</Button>
        </Link>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Leagues</CardTitle>
            <Trophy className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{summary.leagueCount}</div></CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Teams</CardTitle>
            <Users className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{summary.teamCount}</div></CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Players</CardTitle>
            <Activity className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{summary.playerCount}</div></CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Evaluations</CardTitle>
            <ArrowRightLeft className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{summary.tradeEvalCount}</div></CardContent>
        </Card>
      </div>

      {/* ── Top Players + Recent Trades ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Top Players */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="uppercase tracking-wide">Top Players</CardTitle>
            <CardDescription>Highest scoring players across your leagues</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.topPlayers && summary.topPlayers.length > 0 ? (
              <div className="space-y-3">
                {summary.topPlayers.map((player) => (
                  <div key={player.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
                    <PlayerAvatar espnPlayerId={player.espnPlayerId} sport={sport} name={player.fullName} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{player.fullName}</div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">
                        {player.position} • {player.proTeam}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-primary">{player.totalPoints?.toFixed(1) || "-"}</div>
                      <div className="text-xs text-muted-foreground uppercase">Total Pts</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No player data available.</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Trades */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="uppercase tracking-wide">Recent Trades</CardTitle>
              <CardDescription>Your latest AI-evaluated trade proposals</CardDescription>
            </div>
            {recentTrades && recentTrades.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground hover:text-destructive gap-1.5 mt-0.5"
                disabled={clearing || deleting}
                onClick={() => clearAll()}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {tradesLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
              </div>
            ) : recentTrades && recentTrades.length > 0 ? (
              <div className="space-y-3">
                {recentTrades.slice(0, 5).map((trade) => (
                  <div key={trade.id} className="relative p-3 rounded-lg border border-border bg-background space-y-2">
                    {/* Delete (X) button */}
                    <button
                      aria-label="Delete trade"
                      disabled={deleting || clearing}
                      onClick={() => trade.id != null && deleteTrade({ id: trade.id })}
                      className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                    >
                      <X className="w-3 h-3" />
                    </button>

                    {/* Teams */}
                    <div className="flex items-center gap-2 pr-6">
                      <span className="font-bold text-sm truncate flex-1">{trade.teamAName ?? "Team A"}</span>
                      <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="font-bold text-sm truncate flex-1 text-right">{trade.teamBName ?? "Team B"}</span>
                    </div>

                    {/* Win score bar */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-primary font-mono font-bold w-8 text-right shrink-0">{trade.winScoreA}</span>
                      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${Math.round((trade.winScoreA / (trade.winScoreA + trade.winScoreB)) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground font-mono font-bold w-8 shrink-0">{trade.winScoreB}</span>
                    </div>

                    {/* Analysis excerpt */}
                    <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{trade.analysis}</p>

                    {/* Footer: recommendation + time */}
                    <div className="flex items-center justify-between pt-0.5">
                      <Badge
                        variant="outline"
                        className={`text-xs font-bold uppercase ${REC_BADGE[trade.recommendation] ?? ""}`}
                      >
                        {trade.recommendation}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{timeAgo(trade.evaluatedAt)}</span>
                    </div>
                  </div>
                ))}
                <Link href="/trade">
                  <Button variant="link" className="w-full text-primary font-bold uppercase text-xs">
                    Go to Trade Lab →
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-border rounded-lg">
                <ArrowRightLeft className="w-8 h-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No trade evaluations yet.</p>
                <Link href="/trade">
                  <Button variant="link" className="mt-2 text-primary font-bold uppercase">Go to Trade Lab</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
