import React, { useState, useEffect } from "react";
import { useListLeagues, useListTeams, useListTeamPlayers, useEvaluateTrade } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowRightLeft, Sparkles, AlertCircle, CheckCircle2, ChevronRight, Scale } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { PlayerAvatar } from "@/components/player-avatar";
import { useSport } from "@/contexts/sport-context";

export default function TradeLab() {
  const { toast } = useToast();
  const { sport } = useSport();
  const [leagueId, setLeagueId] = useState<number | null>(null);
  
  const [teamAId, setTeamAId] = useState<number | null>(null);
  const [teamBId, setTeamBId] = useState<number | null>(null);
  
  const [teamAPlayers, setTeamAPlayers] = useState<number[]>([]);
  const [teamBPlayers, setTeamBPlayers] = useState<number[]>([]);

  useEffect(() => {
    setLeagueId(null);
    setTeamAId(null);
    setTeamBId(null);
    setTeamAPlayers([]);
    setTeamBPlayers([]);
    evaluateMutation.reset();
  }, [sport]);

  const { data: leagues, isLoading: leaguesLoading } = useListLeagues({ sport });
  const { data: teams, isLoading: teamsLoading } = useListTeams(leagueId || 0, { 
    query: { enabled: !!leagueId, queryKey: ["listTeams", leagueId] } 
  });

  const { data: rosterA, isLoading: rosterALoading } = useListTeamPlayers(teamAId || 0, {
    query: { enabled: !!teamAId, queryKey: ["listTeamPlayers", teamAId] }
  });
  
  const { data: rosterB, isLoading: rosterBLoading } = useListTeamPlayers(teamBId || 0, {
    query: { enabled: !!teamBId, queryKey: ["listTeamPlayers", teamBId] }
  });

  const evaluateMutation = useEvaluateTrade();

  const handleLeagueChange = (val: string) => {
    setLeagueId(parseInt(val, 10));
    setTeamAId(null);
    setTeamBId(null);
    setTeamAPlayers([]);
    setTeamBPlayers([]);
    evaluateMutation.reset();
  };

  const handleEvaluate = () => {
    if (!teamAId || !teamBId || teamAPlayers.length === 0 || teamBPlayers.length === 0) {
      toast({
        title: "Incomplete Trade",
        description: "Please select both teams and at least one player from each to evaluate.",
        variant: "destructive"
      });
      return;
    }

    evaluateMutation.mutate({
      data: {
        teamAId,
        teamBId,
        teamAPlayers,
        teamBPlayers
      }
    });
  };

  const togglePlayerA = (id: number) => {
    setTeamAPlayers(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const togglePlayerB = (id: number) => {
    setTeamBPlayers(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight uppercase flex items-center gap-3">
          <Scale className="w-8 h-8 text-primary" /> AI Trade Lab
        </h1>
        <p className="text-muted-foreground mt-2">Leverage AI to analyze complex trades and predict outcomes.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <Card className="border-border">
            <CardHeader className="bg-secondary/20 pb-4 border-b border-border">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">Context League</label>
                  <Select value={leagueId?.toString()} onValueChange={handleLeagueChange}>
                    <SelectTrigger className="w-full bg-background">
                      <SelectValue placeholder="Select League" />
                    </SelectTrigger>
                    <SelectContent>
                      {leagues?.map(l => (
                        <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
                {/* Team A Side */}
                <div className="p-4 flex flex-col h-[500px]">
                  <div className="mb-4">
                    <label className="text-xs font-bold text-primary uppercase mb-1 block">Team A (Receiving)</label>
                    <Select disabled={!leagueId} value={teamAId?.toString()} onValueChange={v => { setTeamAId(parseInt(v, 10)); setTeamAPlayers([]); }}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Team A" />
                      </SelectTrigger>
                      <SelectContent>
                        {teams?.filter(t => t.id !== teamBId).map(t => (
                          <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <ScrollArea className="flex-1 border rounded-md border-border bg-background/50">
                    <div className="p-2 space-y-1">
                      {rosterALoading ? (
                        <div className="p-4 space-y-2"><Skeleton className="h-8 w-full"/><Skeleton className="h-8 w-full"/></div>
                      ) : rosterA && rosterA.length > 0 ? (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground px-2 py-1 font-bold uppercase tracking-wider bg-secondary/50 rounded mb-2">
                            Players to give up
                          </div>
                          {rosterA.map(player => (
                            <label key={player.id} className="flex items-center gap-2.5 p-2 hover:bg-secondary/30 rounded-md cursor-pointer transition-colors">
                              <Checkbox 
                                checked={teamAPlayers.includes(player.id)} 
                                onCheckedChange={() => togglePlayerA(player.id)}
                                className="shrink-0"
                              />
                              <PlayerAvatar espnPlayerId={player.espnPlayerId} sport={sport} name={player.fullName} size="sm" />
                              <div className="flex-1 min-w-0 leading-none">
                                <p className="text-sm font-medium truncate">{player.fullName}</p>
                                <p className="text-xs text-muted-foreground uppercase mt-0.5">{player.position} • {player.proTeam}</p>
                              </div>
                              <div className="text-xs font-mono text-primary font-bold shrink-0">{player.projectedPoints?.toFixed(1) || "-"}</div>
                            </label>
                          ))}
                        </div>
                      ) : teamAId ? (
                        <p className="text-sm text-center p-4 text-muted-foreground">No players found.</p>
                      ) : (
                        <p className="text-sm text-center p-4 text-muted-foreground">Select a team to view roster.</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Team B Side */}
                <div className="p-4 flex flex-col h-[500px]">
                  <div className="mb-4">
                    <label className="text-xs font-bold text-accent uppercase mb-1 block">Team B (Giving)</label>
                    <Select disabled={!leagueId} value={teamBId?.toString()} onValueChange={v => { setTeamBId(parseInt(v, 10)); setTeamBPlayers([]); }}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Team B" />
                      </SelectTrigger>
                      <SelectContent>
                        {teams?.filter(t => t.id !== teamAId).map(t => (
                          <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <ScrollArea className="flex-1 border rounded-md border-border bg-background/50">
                    <div className="p-2 space-y-1">
                      {rosterBLoading ? (
                        <div className="p-4 space-y-2"><Skeleton className="h-8 w-full"/><Skeleton className="h-8 w-full"/></div>
                      ) : rosterB && rosterB.length > 0 ? (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground px-2 py-1 font-bold uppercase tracking-wider bg-secondary/50 rounded mb-2">
                            Players to give up
                          </div>
                          {rosterB.map(player => (
                            <label key={player.id} className="flex items-center gap-2.5 p-2 hover:bg-secondary/30 rounded-md cursor-pointer transition-colors">
                              <Checkbox 
                                checked={teamBPlayers.includes(player.id)} 
                                onCheckedChange={() => togglePlayerB(player.id)}
                                className="shrink-0"
                              />
                              <PlayerAvatar espnPlayerId={player.espnPlayerId} sport={sport} name={player.fullName} size="sm" />
                              <div className="flex-1 min-w-0 leading-none">
                                <p className="text-sm font-medium truncate">{player.fullName}</p>
                                <p className="text-xs text-muted-foreground uppercase mt-0.5">{player.position} • {player.proTeam}</p>
                              </div>
                              <div className="text-xs font-mono text-accent font-bold shrink-0">{player.projectedPoints?.toFixed(1) || "-"}</div>
                            </label>
                          ))}
                        </div>
                      ) : teamBId ? (
                        <p className="text-sm text-center p-4 text-muted-foreground">No players found.</p>
                      ) : (
                        <p className="text-sm text-center p-4 text-muted-foreground">Select a team to view roster.</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </CardContent>
            
            <div className="p-4 border-t border-border bg-secondary/10 flex justify-end">
              <Button 
                onClick={handleEvaluate} 
                disabled={evaluateMutation.isPending || !teamAId || !teamBId || teamAPlayers.length === 0 || teamBPlayers.length === 0}
                className="uppercase tracking-widest font-bold min-w-[200px]"
                size="lg"
              >
                {evaluateMutation.isPending ? (
                  <span className="flex items-center gap-2">Analyzing <Sparkles className="w-4 h-4 animate-pulse" /></span>
                ) : "Evaluate Trade"}
              </Button>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-4">
          <div className="sticky top-6">
            {evaluateMutation.isPending && (
              <Card className="border-primary/50 bg-primary/5 animate-pulse">
                <CardContent className="p-8 flex flex-col items-center justify-center text-center h-64 space-y-4">
                  <Sparkles className="w-12 h-12 text-primary" />
                  <p className="font-mono text-sm text-primary uppercase tracking-widest">Crunching Numbers</p>
                </CardContent>
              </Card>
            )}

            {!evaluateMutation.isPending && !evaluateMutation.data && !evaluateMutation.isError && (
              <Card className="border-dashed border-border bg-transparent">
                <CardContent className="p-8 flex flex-col items-center justify-center text-center h-64 opacity-50">
                  <ArrowRightLeft className="w-12 h-12 mb-4 text-muted-foreground" />
                  <p className="text-sm uppercase tracking-wide font-bold">Awaiting Input</p>
                  <p className="text-xs text-muted-foreground mt-2">Select teams and players to generate an AI trade analysis.</p>
                </CardContent>
              </Card>
            )}

            {evaluateMutation.isError && (
              <Card className="border-destructive bg-destructive/10">
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <AlertCircle className="w-12 h-12 text-destructive mb-4" />
                  <p className="font-bold text-destructive">Evaluation Failed</p>
                  <p className="text-sm text-destructive/80 mt-2">{evaluateMutation.error?.error || "Could not analyze this trade."}</p>
                </CardContent>
              </Card>
            )}

            {evaluateMutation.data && (
              <Card className="border-primary shadow-xl shadow-primary/10 overflow-hidden">
                <div className="bg-primary px-4 py-2 flex justify-between items-center text-primary-foreground">
                  <span className="uppercase font-bold tracking-widest text-xs flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Final Verdict
                  </span>
                  {evaluateMutation.data.cached && (
                    <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded font-mono uppercase">Cached</span>
                  )}
                </div>
                <CardContent className="p-0">
                  <div className="flex divide-x divide-border border-b border-border bg-card">
                    <div className="flex-1 p-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase font-bold truncate px-2">{evaluateMutation.data.teamAName}</p>
                      <div className="text-4xl font-black text-primary mt-2">{evaluateMutation.data.winScoreA}</div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Win Score</p>
                    </div>
                    <div className="flex-1 p-4 text-center bg-secondary/10">
                      <p className="text-xs text-muted-foreground uppercase font-bold truncate px-2">{evaluateMutation.data.teamBName}</p>
                      <div className="text-4xl font-black text-accent mt-2">{evaluateMutation.data.winScoreB}</div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Win Score</p>
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="flex justify-center mb-6">
                      <div className={`px-4 py-2 rounded-full border-2 font-bold uppercase tracking-widest text-sm
                        ${evaluateMutation.data.recommendation === 'Accept' ? 'bg-primary/20 border-primary text-primary' : ''}
                        ${evaluateMutation.data.recommendation === 'Decline' ? 'bg-destructive/20 border-destructive text-destructive' : ''}
                        ${evaluateMutation.data.recommendation === 'Neutral' ? 'bg-muted border-muted-foreground text-foreground' : ''}
                      `}>
                        {evaluateMutation.data.recommendation}
                      </div>
                    </div>

                    <div className="prose prose-sm dark:prose-invert prose-p:text-muted-foreground max-w-none text-sm leading-relaxed">
                      {evaluateMutation.data.analysis.split('\n').map((paragraph, i) => (
                        <p key={i} className="mb-2">{paragraph}</p>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}