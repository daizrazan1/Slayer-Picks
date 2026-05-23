import React, { useState, useEffect } from "react";
import { useListLeagues, useListTeams } from "@workspace/api-client-react";
import { useSport } from "@/contexts/sport-context";
import { TeamAvatar } from "@/components/team-avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy } from "lucide-react";
import { Link } from "wouter";

export default function Standings() {
  const { sport } = useSport();
  const [leagueId, setLeagueId] = useState<number | null>(null);

  const { data: leagues, isLoading: leaguesLoading } = useListLeagues({ sport });

  useEffect(() => {
    if (leagues && leagues.length > 0) {
      setLeagueId(leagues[0]!.id);
    } else {
      setLeagueId(null);
    }
  }, [leagues]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: teams, isLoading: teamsLoading } = useListTeams(leagueId ?? 0, { query: { enabled: !!leagueId } } as any);

  const sorted = [...(teams ?? [])].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (b.pointsFor ?? 0) - (a.pointsFor ?? 0);
  });

  const selectedLeague = leagues?.find((l) => l.id === leagueId);

  if (leaguesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!leagues || leagues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 text-center">
        <Trophy className="w-16 h-16 text-muted-foreground opacity-20" />
        <h2 className="text-2xl font-bold">No standings yet</h2>
        <p className="text-muted-foreground">Sync your ESPN account to import league standings.</p>
        <Link href="/sync" className="text-primary hover:underline font-bold uppercase mt-4 block">
          Go to Sync
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight uppercase">Standings</h1>
          <p className="text-muted-foreground mt-1">Final season records for your league.</p>
        </div>
        {leagues.length > 1 && (
          <Select value={leagueId?.toString()} onValueChange={(v) => setLeagueId(parseInt(v, 10))}>
            <SelectTrigger className="w-56 bg-card">
              <SelectValue placeholder="Select league" />
            </SelectTrigger>
            <SelectContent>
              {leagues.map((l) => (
                <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {selectedLeague && (
        <p className="text-sm text-muted-foreground font-medium uppercase tracking-wide">
          {selectedLeague.name} — {selectedLeague.season} Season
        </p>
      )}

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        {teamsLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-secondary/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 uppercase text-xs tracking-wider text-center">#</TableHead>
                <TableHead className="uppercase text-xs tracking-wider">Team</TableHead>
                <TableHead className="uppercase text-xs tracking-wider text-center">W</TableHead>
                <TableHead className="uppercase text-xs tracking-wider text-center">L</TableHead>
                <TableHead className="uppercase text-xs tracking-wider text-center">T</TableHead>
                <TableHead className="uppercase text-xs tracking-wider text-right">PF</TableHead>
                <TableHead className="uppercase text-xs tracking-wider text-right">PA</TableHead>
                <TableHead className="uppercase text-xs tracking-wider text-right">+/-</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((team, idx) => {
                const diff = (team.pointsFor ?? 0) - (team.pointsAgainst ?? 0);
                const isTop3 = idx < 3;
                return (
                  <TableRow key={team.id} className="border-border/50">
                    <TableCell className="text-center">
                      {idx === 0 ? (
                        <span className="text-yellow-400 font-bold text-base">🥇</span>
                      ) : idx === 1 ? (
                        <span className="text-slate-400 font-bold text-base">🥈</span>
                      ) : idx === 2 ? (
                        <span className="text-amber-600 font-bold text-base">🥉</span>
                      ) : (
                        <span className="text-muted-foreground font-mono text-sm">{idx + 1}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <TeamAvatar name={team.name} abbrev={team.abbrev} size="sm" />
                        <span className={`font-semibold ${isTop3 ? "text-foreground" : "text-muted-foreground"}`}>
                          {team.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-bold text-primary">{team.wins}</TableCell>
                    <TableCell className="text-center font-mono text-muted-foreground">{team.losses}</TableCell>
                    <TableCell className="text-center font-mono text-muted-foreground">{team.ties ?? 0}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{team.pointsFor?.toFixed(1) ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{team.pointsAgainst?.toFixed(1) ?? "—"}</TableCell>
                    <TableCell className={`text-right font-mono font-bold ${diff >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {diff >= 0 ? "+" : ""}{diff.toFixed(1)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
