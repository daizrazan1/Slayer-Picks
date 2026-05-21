import React from "react";
import { Link } from "wouter";
import { useListLeagues } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, ChevronRight } from "lucide-react";
import { useSport, SPORTS } from "@/contexts/sport-context";

export default function Leagues() {
  const { sport } = useSport();
  const sportLabel = SPORTS.find(s => s.value === sport)?.label ?? sport;
  const { data: leagues, isLoading } = useListLeagues({ sport });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight uppercase">Leagues</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      </div>
    );
  }

  if (!leagues || leagues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 text-center">
        <Trophy className="w-16 h-16 text-muted-foreground opacity-20" />
        <h2 className="text-2xl font-bold">No leagues found</h2>
        <p className="text-muted-foreground">Sync your ESPN account to import your leagues.</p>
        <Link href="/sync" className="text-primary hover:underline font-bold uppercase mt-4 block">
          Go to Sync
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight uppercase">Your {sportLabel} Leagues</h1>
        <p className="text-muted-foreground mt-2">Manage and view rosters for all your synced ESPN {sportLabel.toLowerCase()} leagues.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {leagues.map(league => (
          <Link key={league.id} href={`/leagues/${league.id}`}>
            <Card className="hover:border-primary transition-colors cursor-pointer border-border group bg-card h-full flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="bg-secondary text-xs font-bold px-2 py-1 rounded uppercase tracking-wider text-secondary-foreground inline-flex w-fit">
                    {league.sport} {league.season}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <CardTitle className="text-xl mt-4 line-clamp-2">{league.name}</CardTitle>
                <CardDescription className="text-xs uppercase tracking-wide">ESPN ID: {league.espnLeagueId}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto pt-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground uppercase text-xs font-bold">Teams</span>
                    <span className="font-bold text-lg">{league.teamCount || "?"}</span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-muted-foreground uppercase text-xs font-bold">Last Sync</span>
                    <span className="font-mono text-xs mt-1">{new Date(league.syncedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}