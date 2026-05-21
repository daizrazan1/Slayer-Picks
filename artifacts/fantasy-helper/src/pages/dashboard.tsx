import React from "react";
import { Link } from "wouter";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Trophy, Activity, ArrowRightLeft, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();

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
            Connect your ESPN fantasy account to start analyzing your leagues and evaluating trades.
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
          <h1 className="text-3xl font-bold tracking-tight uppercase">Command Center</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Last synced: {summary.lastSyncAt ? new Date(summary.lastSyncAt).toLocaleString() : "Never"}
          </p>
        </div>
        <Link href="/sync">
          <Button variant="outline" className="uppercase font-bold tracking-wide">Sync Now</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Leagues</CardTitle>
            <Trophy className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.leagueCount}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Teams</CardTitle>
            <Users className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.teamCount}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Players</CardTitle>
            <Activity className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.playerCount}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Evaluations</CardTitle>
            <ArrowRightLeft className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.tradeEvalCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="uppercase tracking-wide">Top Players</CardTitle>
            <CardDescription>Highest projected points across your leagues</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.topPlayers && summary.topPlayers.length > 0 ? (
              <div className="space-y-4">
                {summary.topPlayers.map((player) => (
                  <div key={player.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                    <div>
                      <div className="font-bold">{player.fullName}</div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">
                        {player.position} • {player.proTeam}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-primary">{player.projectedPoints?.toFixed(1) || "-"}</div>
                      <div className="text-xs text-muted-foreground uppercase">Proj Pts</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No player data available.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="uppercase tracking-wide">Recent Action</CardTitle>
            <CardDescription>Your latest trade evaluations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-border rounded-lg">
              <ArrowRightLeft className="w-8 h-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Recent trades feed not implemented yet.</p>
              <Link href="/trade">
                <Button variant="link" className="mt-2 text-primary font-bold uppercase">Go to Trade Lab</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}