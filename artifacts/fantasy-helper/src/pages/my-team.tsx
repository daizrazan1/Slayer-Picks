import React, { useState, useEffect } from "react";
import { useListLeagues, useListTeams, useListTeamPlayers } from "@workspace/api-client-react";
import { useSport } from "@/contexts/sport-context";
import { PlayerAvatar } from "@/components/player-avatar";
import { TeamAvatar } from "@/components/team-avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
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
