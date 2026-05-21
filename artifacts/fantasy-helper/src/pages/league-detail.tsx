import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetLeague, useListTeams, useListTeamPlayers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, Trophy } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function LeagueDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  const { data: league, isLoading: leagueLoading } = useGetLeague(id, { query: { enabled: !!id, queryKey: ["getLeague", id] } });
  const { data: teams, isLoading: teamsLoading } = useListTeams(id, { query: { enabled: !!id, queryKey: ["listTeams", id] } });

  // Select the first team by default if none selected
  if (teams && teams.length > 0 && !selectedTeamId) {
    setSelectedTeamId(teams[0].id);
  }

  const { data: players, isLoading: playersLoading } = useListTeamPlayers(selectedTeamId || 0, { 
    query: { enabled: !!selectedTeamId, queryKey: ["listTeamPlayers", selectedTeamId] } 
  });

  if (leagueLoading || teamsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!league) {
    return <div>League not found.</div>;
  }

  const selectedTeam = teams?.find(t => t.id === selectedTeamId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/leagues" className="text-muted-foreground hover:text-foreground text-sm font-medium flex items-center gap-2 mb-4 w-fit transition-colors">
          <ArrowLeft className="w-4 h-4" /> BACK TO LEAGUES
        </Link>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded uppercase tracking-wider">
                {league.sport} {league.season}
              </span>
              <span className="text-muted-foreground text-sm font-mono">{league.espnLeagueId}</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{league.name}</h1>
          </div>
          <div className="flex gap-4">
            <div className="bg-card border border-border px-4 py-2 rounded-lg flex flex-col items-center">
              <span className="text-xs text-muted-foreground uppercase font-bold tracking-wide">Teams</span>
              <span className="text-xl font-bold text-primary">{league.teamCount}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-4 border-b border-border/50">
              <CardTitle className="uppercase tracking-wide text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> Roster Viewer
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Select Team</label>
                <Select value={selectedTeamId?.toString()} onValueChange={(val) => setSelectedTeamId(parseInt(val, 10))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams?.map(team => (
                      <SelectItem key={team.id} value={team.id.toString()}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTeam && (
                <div className="mt-6 space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">Record</span>
                    <span className="font-mono font-bold">{selectedTeam.wins}-{selectedTeam.losses}{selectedTeam.ties ? `-${selectedTeam.ties}` : ''}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">Points For</span>
                    <span className="font-mono font-bold">{selectedTeam.pointsFor?.toFixed(1) || "-"}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">Points Against</span>
                    <span className="font-mono font-bold">{selectedTeam.pointsAgainst?.toFixed(1) || "-"}</span>
                  </div>
                  {selectedTeam.waiversPosition && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Waiver Priority</span>
                      <span className="font-mono font-bold">{selectedTeam.waiversPosition}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="uppercase tracking-wide">{selectedTeam?.name || "Roster"}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {playersLoading ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : players && players.length > 0 ? (
                <Table>
                  <TableHeader className="bg-secondary/50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[100px] uppercase text-xs tracking-wider">Pos</TableHead>
                      <TableHead className="uppercase text-xs tracking-wider">Player</TableHead>
                      <TableHead className="uppercase text-xs tracking-wider">Team</TableHead>
                      <TableHead className="uppercase text-xs tracking-wider text-right">Proj</TableHead>
                      <TableHead className="uppercase text-xs tracking-wider text-right">Avg</TableHead>
                      <TableHead className="uppercase text-xs tracking-wider text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {players.map(player => (
                      <TableRow key={player.id} className="border-border/50">
                        <TableCell className="font-bold text-xs">
                          <span className="bg-secondary px-2 py-1 rounded text-secondary-foreground">{player.position}</span>
                        </TableCell>
                        <TableCell className="font-medium">{player.fullName}</TableCell>
                        <TableCell className="text-muted-foreground uppercase text-xs font-bold tracking-wide">{player.proTeam}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-primary">{player.projectedPoints?.toFixed(1) || "-"}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{player.avgPoints?.toFixed(1) || "-"}</TableCell>
                        <TableCell className="text-right">
                          {player.injuryStatus && player.injuryStatus !== "ACTIVE" && player.injuryStatus !== "NORMAL" ? (
                            <span className="text-xs font-bold text-destructive uppercase bg-destructive/10 px-2 py-1 rounded">
                              {player.injuryStatus}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  No players found on this roster.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}