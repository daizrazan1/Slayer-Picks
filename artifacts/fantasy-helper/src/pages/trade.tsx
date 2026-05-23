import React, { useState, useEffect } from "react";
import {
  useListLeagues, useListTeams, useListTeamPlayers,
  useEvaluateTrade, useFindTrades,
} from "@workspace/api-client-react";
import type { EspnPublicStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { ArrowRightLeft, Sparkles, AlertCircle, Scale, Search, Target, SlidersHorizontal, Send, Minus, ChevronDown, ChevronUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { PlayerAvatar } from "@/components/player-avatar";
import { useSport } from "@/contexts/sport-context";
import type { TradePackage } from "@workspace/api-client-react";

type Mode = "manual" | "finder";

const POSITIONS_BY_SPORT: Record<string, string[]> = {
  basketball: ["PG", "SG", "SF", "PF", "C", "UTIL"],
  football:   ["QB", "RB", "WR", "TE", "FLEX", "K", "D/ST"],
  baseball:   ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP"],
  hockey:     ["C", "LW", "RW", "D", "G"],
};

function fairnessLabel(v: number) {
  if (v <= 20) return { text: "Max Advantage", color: "text-red-400", desc: "Very lopsided — you win big" };
  if (v <= 40) return { text: "Lopsided", color: "text-orange-400", desc: "You get clearly more value" };
  if (v <= 60) return { text: "Slight Edge", color: "text-yellow-400", desc: "You come out a little ahead" };
  if (v <= 80) return { text: "Balanced", color: "text-blue-400", desc: "Roughly fair exchange" };
  return { text: "Even Trade", color: "text-green-400", desc: "Equal value both ways" };
}

function RecBadge({ rec }: { rec: string }) {
  const map: Record<string, string> = {
    "Send It": "bg-primary/20 text-primary border-primary",
    "Consider": "bg-yellow-500/20 text-yellow-400 border-yellow-500",
    "Skip": "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${map[rec] ?? map["Skip"]}`}>
      {rec}
    </span>
  );
}

function PackageCard({
  pkg,
  offeredPlayers,
  onLoadManual,
}: {
  pkg: TradePackage;
  offeredPlayers: Array<{ id: number; fullName: string; position: string }>;
  onLoadManual: (targetTeamId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-sm">{pkg.targetTeamName}</p>
            <p className="text-xs text-muted-foreground">{pkg.record}</p>
          </div>
          <RecBadge rec={pkg.recommendation} />
        </div>

        <div>
          <p className="text-xs text-muted-foreground uppercase font-bold mb-1">You send</p>
          <ul className="space-y-0.5">
            {offeredPlayers.map(p => (
              <li key={p.id} className="text-sm font-medium text-foreground flex items-start gap-1.5">
                <span className="text-destructive mt-0.5">−</span>{p.fullName}
                <span className="text-xs text-muted-foreground">({p.position})</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs text-muted-foreground uppercase font-bold mb-1">You'd receive</p>
          <ul className="space-y-0.5">
            {pkg.playersToReceive.map((p, i) => (
              <li key={i} className="text-sm font-medium text-foreground flex items-start gap-1.5">
                <span className="text-primary mt-0.5">+</span>{p}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground uppercase font-bold">Fairness</span>
            <span className="font-mono font-bold text-primary">{pkg.fairnessScore}%</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full bg-primary transition-all"
              style={{ width: `${pkg.fairnessScore}%` }}
            />
          </div>
        </div>

        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          AI Reasoning
        </button>

        {expanded && (
          <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-2">
            {pkg.reasoning}
          </p>
        )}

        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs uppercase tracking-wider"
          onClick={() => onLoadManual(pkg.targetTeamId)}
        >
          <ArrowRightLeft className="w-3 h-3 mr-1.5" /> Load in Manual Trade Lab
        </Button>
      </CardContent>
    </Card>
  );
}

function calcPpg(
  totalPoints: number | null | undefined,
  estimatedGames: number
): string {
  if (totalPoints == null) return "-";
  return (totalPoints / estimatedGames).toFixed(1);
}

function formatRealStats(stats: EspnPublicStats, sport: string): string {
  const sl = stats.statLine ?? {};
  if (sport === "basketball") {
    const pts = sl["avgPoints"] ?? 0;
    const reb = sl["avgRebounds"] ?? 0;
    const ast = sl["avgAssists"] ?? 0;
    return `${pts.toFixed(1)}pts ${reb.toFixed(1)}reb ${ast.toFixed(1)}ast · ${stats.gamesPlayed}gp`;
  }
  if (sport === "football") {
    const passYds = sl["passingYards"] ?? 0;
    const rushYds = sl["rushingYards"] ?? 0;
    const recYds = sl["receivingYards"] ?? 0;
    if (passYds > 0) return `${passYds.toFixed(0)} pass yds · ${stats.gamesPlayed}gp`;
    if (rushYds > 0 || recYds > 0) return `${rushYds.toFixed(0)} rush ${recYds.toFixed(0)} rec yds · ${stats.gamesPlayed}gp`;
    return `${stats.gamesPlayed}gp`;
  }
  if (sport === "baseball") {
    const avg = sl["battingAverage"] ?? 0;
    const hr = sl["homeRuns"] ?? 0;
    const era = sl["ERA"] ?? null;
    if (era != null && era > 0 && hr === 0) return `${era.toFixed(2)} ERA · ${stats.gamesPlayed}gp`;
    return `.${(avg * 1000).toFixed(0).padStart(3, "0")} AVG ${hr.toFixed(0)} HR · ${stats.gamesPlayed}gp`;
  }
  if (sport === "hockey") {
    const goals = sl["goals"] ?? 0;
    const assists = sl["assists"] ?? 0;
    const sv = sl["saves"] ?? 0;
    if (sv > 0) return `${sv.toFixed(0)} SV · ${stats.gamesPlayed}gp`;
    return `${goals.toFixed(0)}G ${assists.toFixed(0)}A · ${stats.gamesPlayed}gp`;
  }
  return `${stats.gamesPlayed}gp`;
}

function deriveEstGames(rosters: Array<Array<{ totalPoints?: number | null }>>): number {
  const maxPts = Math.max(...rosters.flatMap(r => r.map(p => p.totalPoints ?? 0)), 1);
  return Math.max(1, Math.round(maxPts / 68));
}

export default function TradeLab() {
  const { toast } = useToast();
  const { sport } = useSport();
  const [mode, setMode] = useState<Mode>("manual");

  // ── Manual mode state ──────────────────────────────────────────────────────
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [teamAId, setTeamAId] = useState<number | null>(null);
  const [teamBId, setTeamBId] = useState<number | null>(null);
  const [teamAPlayers, setTeamAPlayers] = useState<number[]>([]);
  const [teamBPlayers, setTeamBPlayers] = useState<number[]>([]);

  // ── Finder mode state ──────────────────────────────────────────────────────
  const [finderLeagueId, setFinderLeagueId] = useState<number | null>(null);
  const [myTeamId, setMyTeamId] = useState<number | null>(null);
  const [offeredPlayerIds, setOfferedPlayerIds] = useState<number[]>([]);
  const [fairness, setFairness] = useState(50);
  const [targetPositions, setTargetPositions] = useState<string[]>([]);
  const [packageSize, setPackageSize] = useState<number>(2);

  const evaluateMutation = useEvaluateTrade();
  const findMutation = useFindTrades();

  useEffect(() => {
    setLeagueId(null); setTeamAId(null); setTeamBId(null);
    setTeamAPlayers([]); setTeamBPlayers([]);
    setFinderLeagueId(null); setMyTeamId(null);
    setOfferedPlayerIds([]); setTargetPositions([]);
    evaluateMutation.reset(); findMutation.reset();
  }, [sport]);

  const { data: leagues } = useListLeagues({ sport });

  // manual queries
  const { data: manualTeams } = useListTeams(leagueId || 0, { query: { enabled: !!leagueId, queryKey: ["listTeams", leagueId] } });
  const { data: rosterA, isLoading: rosterALoading } = useListTeamPlayers(teamAId || 0, { query: { enabled: !!teamAId, queryKey: ["listTeamPlayers", teamAId] } });
  const { data: rosterB, isLoading: rosterBLoading } = useListTeamPlayers(teamBId || 0, { query: { enabled: !!teamBId, queryKey: ["listTeamPlayers", teamBId] } });

  // finder queries
  const { data: finderTeams } = useListTeams(finderLeagueId || 0, { query: { enabled: !!finderLeagueId, queryKey: ["listTeams", finderLeagueId] } });
  const { data: myRoster, isLoading: myRosterLoading } = useListTeamPlayers(myTeamId || 0, { query: { enabled: !!myTeamId, queryKey: ["listTeamPlayers", myTeamId] } });

  // Shared estimatedGames per mode — derived from combined rosters so both sides use same denominator
  const manualEstGames = deriveEstGames([rosterA ?? [], rosterB ?? []]);
  const finderEstGames = deriveEstGames([myRoster ?? []]);

  // Auto-lock Team A to the user's own team whenever teams for the selected league load
  useEffect(() => {
    if (!manualTeams) return;
    const owner = manualTeams.find(t => t.isOwnerTeam);
    if (owner && teamAId !== owner.id) {
      setTeamAId(owner.id);
      setTeamAPlayers([]);
    }
  }, [manualTeams]);

  // Auto-lock finder myTeamId to the user's own team
  useEffect(() => {
    if (!finderTeams) return;
    const owner = finderTeams.find(t => t.isOwnerTeam);
    if (owner && myTeamId !== owner.id) {
      setMyTeamId(owner.id);
      setOfferedPlayerIds([]);
    }
  }, [finderTeams]);

  const handleLeagueChange = (val: string) => {
    setLeagueId(parseInt(val, 10));
    setTeamAId(null); setTeamBId(null);
    setTeamAPlayers([]); setTeamBPlayers([]);
    evaluateMutation.reset();
  };

  const handleEvaluate = () => {
    if (!teamAId || !teamBId || teamAPlayers.length === 0 || teamBPlayers.length === 0) {
      toast({ title: "Incomplete Trade", description: "Select both teams and at least one player from each.", variant: "destructive" });
      return;
    }
    evaluateMutation.mutate({ data: { teamAId, teamBId, teamAPlayers, teamBPlayers } });
  };

  const handleFindTrades = () => {
    if (!finderLeagueId || !myTeamId || offeredPlayerIds.length === 0) {
      toast({ title: "Incomplete", description: "Select your league, team, and at least one player to offer.", variant: "destructive" });
      return;
    }
    findMutation.mutate({ data: { leagueId: finderLeagueId, myTeamId, offeredPlayerIds, fairness, targetPositions: targetPositions.length > 0 ? targetPositions : undefined, packageSize } });
  };

  const handleLoadInManual = (targetTeamId: number) => {
    if (!finderLeagueId) return;
    setLeagueId(finderLeagueId);
    setTeamAId(myTeamId);
    setTeamBId(targetTeamId);
    setTeamAPlayers(offeredPlayerIds);
    setTeamBPlayers([]);
    evaluateMutation.reset();
    setMode("manual");
    toast({ title: "Loaded in Trade Lab", description: "Select the players you want back from the other team, then evaluate." });
  };

  const toggleOffered = (id: number) =>
    setOfferedPlayerIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  const togglePos = (pos: string) =>
    setTargetPositions(prev => prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]);

  const fl = fairnessLabel(fairness);
  const sportPositions = POSITIONS_BY_SPORT[sport] ?? POSITIONS_BY_SPORT["football"]!;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight uppercase flex items-center gap-3">
          <Scale className="w-8 h-8 text-primary" /> AI Trade Lab
        </h1>
        <p className="text-muted-foreground mt-2">Evaluate trades manually or let AI find the best packages for you.</p>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <button
          onClick={() => setMode("manual")}
          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${mode === "manual" ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50"}`}
        >
          <ArrowRightLeft className={`w-5 h-5 ${mode === "manual" ? "text-primary" : "text-muted-foreground"}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${mode === "manual" ? "text-primary" : "text-muted-foreground"}`}>Manual Trade</span>
        </button>
        <button
          onClick={() => setMode("finder")}
          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${mode === "finder" ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50"}`}
        >
          <Search className={`w-5 h-5 ${mode === "finder" ? "text-primary" : "text-muted-foreground"}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${mode === "finder" ? "text-primary" : "text-muted-foreground"}`}>Trade Finder</span>
        </button>
      </div>

      {/* ── MANUAL MODE ──────────────────────────────────────────────────────── */}
      {mode === "manual" && (
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
                        {leagues?.map(l => <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
                  {/* Team A — locked to user's own team */}
                  <div className="p-4 flex flex-col h-[500px]">
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-primary uppercase">My Team</label>
                        <span className="text-[10px] bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded font-bold uppercase tracking-wider">You</span>
                      </div>
                      <div className="w-full h-9 flex items-center px-3 rounded-md border border-border bg-secondary/30 text-sm text-muted-foreground truncate">
                        {manualTeams?.find(t => t.id === teamAId)?.name ?? (leagueId ? "Sync your league to auto-detect your team" : "Select a league first")}
                      </div>
                    </div>
                    <ScrollArea className="flex-1 border rounded-md border-border bg-background/50">
                      <div className="p-2 space-y-1">
                        {rosterALoading ? (
                          <div className="p-4 space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
                        ) : rosterA && rosterA.length > 0 ? (
                          <>
                            <div className="text-xs text-primary/70 px-2 py-1 font-bold uppercase tracking-wider bg-primary/5 rounded mb-2">✓ Check players you're giving away</div>
                            {rosterA.map(player => (
                              <label key={player.id} className={`flex items-center gap-2.5 p-2 hover:bg-secondary/30 rounded-md cursor-pointer transition-colors ${teamAPlayers.includes(player.id) ? "bg-primary/10 border border-primary/20 rounded-md" : ""}`}>
                                <Checkbox checked={teamAPlayers.includes(player.id)} onCheckedChange={() => setTeamAPlayers(prev => prev.includes(player.id) ? prev.filter(p => p !== player.id) : [...prev, player.id])} className="shrink-0" />
                                <PlayerAvatar espnPlayerId={player.espnPlayerId} sport={sport} name={player.fullName} size="sm" />
                                <div className="flex-1 min-w-0 leading-none">
                                  <p className="text-sm font-medium truncate">{player.fullName}</p>
                                  <p className="text-xs text-muted-foreground uppercase mt-0.5">{player.position} • {player.proTeam}</p>
                                  {player.espnPublicStats && player.espnPublicStats.gamesPlayed > 0 ? (
                                    <p className="text-[10px] text-primary/70 font-mono mt-0.5 truncate">{formatRealStats(player.espnPublicStats, sport)}</p>
                                  ) : (
                                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{calcPpg(player.totalPoints, manualEstGames)} ppg est</p>
                                  )}
                                </div>
                              </label>
                            ))}
                          </>
                        ) : teamAId ? (
                          <p className="text-sm text-center p-4 text-muted-foreground">No players found.</p>
                        ) : (
                          <p className="text-sm text-center p-4 text-muted-foreground">Select a league to load your roster.</p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Team B — opponent, selectable */}
                  <div className="p-4 flex flex-col h-[500px]">
                    <div className="mb-4">
                      <label className="text-xs font-bold text-accent uppercase mb-1 block">Trading With</label>
                      <Select disabled={!leagueId} value={teamBId?.toString()} onValueChange={v => { setTeamBId(parseInt(v, 10)); setTeamBPlayers([]); }}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select opponent" /></SelectTrigger>
                        <SelectContent>
                          {manualTeams?.filter(t => t.id !== teamAId).map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <ScrollArea className="flex-1 border rounded-md border-border bg-background/50">
                      <div className="p-2 space-y-1">
                        {rosterBLoading ? (
                          <div className="p-4 space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
                        ) : rosterB && rosterB.length > 0 ? (
                          <>
                            <div className="text-xs text-accent/70 px-2 py-1 font-bold uppercase tracking-wider bg-accent/5 rounded mb-2">✓ Check players you want to receive</div>
                            {rosterB.map(player => (
                              <label key={player.id} className={`flex items-center gap-2.5 p-2 hover:bg-secondary/30 rounded-md cursor-pointer transition-colors ${teamBPlayers.includes(player.id) ? "bg-accent/10 border border-accent/20 rounded-md" : ""}`}>
                                <Checkbox checked={teamBPlayers.includes(player.id)} onCheckedChange={() => setTeamBPlayers(prev => prev.includes(player.id) ? prev.filter(p => p !== player.id) : [...prev, player.id])} className="shrink-0" />
                                <PlayerAvatar espnPlayerId={player.espnPlayerId} sport={sport} name={player.fullName} size="sm" />
                                <div className="flex-1 min-w-0 leading-none">
                                  <p className="text-sm font-medium truncate">{player.fullName}</p>
                                  <p className="text-xs text-muted-foreground uppercase mt-0.5">{player.position} • {player.proTeam}</p>
                                  {player.espnPublicStats && player.espnPublicStats.gamesPlayed > 0 ? (
                                    <p className="text-[10px] text-accent/70 font-mono mt-0.5 truncate">{formatRealStats(player.espnPublicStats, sport)}</p>
                                  ) : (
                                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{calcPpg(player.totalPoints, manualEstGames)} ppg est</p>
                                  )}
                                </div>
                              </label>
                            ))}
                          </>
                        ) : teamBId ? (
                          <p className="text-sm text-center p-4 text-muted-foreground">No players found.</p>
                        ) : (
                          <p className="text-sm text-center p-4 text-muted-foreground">Select an opponent to view their roster.</p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </CardContent>
              <div className="p-4 border-t border-border bg-secondary/10 flex justify-end">
                <Button onClick={handleEvaluate} disabled={evaluateMutation.isPending || !teamAId || !teamBId || teamAPlayers.length === 0 || teamBPlayers.length === 0} className="uppercase tracking-widest font-bold min-w-[200px]" size="lg">
                  {evaluateMutation.isPending ? <span className="flex items-center gap-2">Analyzing <Sparkles className="w-4 h-4 animate-pulse" /></span> : "Evaluate Trade"}
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
                    <p className="text-sm text-destructive/80 mt-2">{(evaluateMutation.error as { message?: string })?.message ?? "Could not analyze this trade."}</p>
                  </CardContent>
                </Card>
              )}
              {evaluateMutation.data && (
                <Card className="border-primary shadow-xl shadow-primary/10 overflow-hidden">
                  <div className="bg-primary px-4 py-2 flex justify-between items-center text-primary-foreground">
                    <span className="uppercase font-bold tracking-widest text-xs flex items-center gap-2"><Sparkles className="w-4 h-4" /> Final Verdict</span>
                    {evaluateMutation.data.cached && <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded font-mono uppercase">Cached</span>}
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
                          ${evaluateMutation.data.recommendation === "Accept" ? "bg-primary/20 border-primary text-primary" : ""}
                          ${evaluateMutation.data.recommendation === "Decline" ? "bg-destructive/20 border-destructive text-destructive" : ""}
                          ${evaluateMutation.data.recommendation === "Neutral" ? "bg-muted border-muted-foreground text-foreground" : ""}
                        `}>
                          {evaluateMutation.data.recommendation}
                        </div>
                      </div>
                      <div className="prose prose-sm dark:prose-invert prose-p:text-muted-foreground max-w-none text-sm leading-relaxed">
                        {evaluateMutation.data.analysis.split("\n").map((p, i) => <p key={i} className="mb-2">{p}</p>)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TRADE FINDER MODE ────────────────────────────────────────────────── */}
      {mode === "finder" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: controls */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="border-border">
              <CardHeader className="pb-3 border-b border-border bg-secondary/20">
                <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-primary" /> Finder Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-5">
                {/* League */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase mb-1.5 block">League</label>
                  <Select value={finderLeagueId?.toString()} onValueChange={v => { setFinderLeagueId(parseInt(v, 10)); setMyTeamId(null); setOfferedPlayerIds([]); findMutation.reset(); }}>
                    <SelectTrigger className="w-full bg-background"><SelectValue placeholder="Select League" /></SelectTrigger>
                    <SelectContent>
                      {leagues?.map(l => <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* My team — auto-locked */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase mb-1.5 block">Your Team</label>
                  <div className="w-full h-9 flex items-center px-3 rounded-md border border-border bg-secondary/30 text-sm text-muted-foreground truncate">
                    {finderTeams?.find(t => t.id === myTeamId)?.name ?? (finderLeagueId ? "Sync your league to auto-detect your team" : "Select a league first")}
                  </div>
                </div>

                {/* Fairness slider */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Trade Fairness</label>
                    <div className="text-right">
                      <span className={`text-xs font-bold uppercase tracking-wide ${fl.color}`}>{fl.text}</span>
                      <p className="text-[10px] text-muted-foreground">{fl.desc}</p>
                    </div>
                  </div>
                  <Slider
                    value={[fairness]}
                    onValueChange={([v]) => setFairness(v!)}
                    min={1}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>You Win Everything</span>
                    <span className="font-mono font-bold">{fairness}%</span>
                    <span>Perfectly Fair</span>
                  </div>
                </div>

                {/* Target positions */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                    <Target className="w-3 h-3" /> Target Positions <span className="font-normal normal-case text-muted-foreground">(optional)</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {sportPositions.map(pos => (
                      <button
                        key={pos}
                        onClick={() => togglePos(pos)}
                        className={`text-xs font-bold px-2.5 py-1 rounded border transition-all ${targetPositions.includes(pos) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Package size */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block">
                    Players I Want in Return
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3].map(n => (
                      <button
                        key={n}
                        onClick={() => setPackageSize(n)}
                        className={`flex-1 py-2 rounded border text-sm font-bold transition-all ${packageSize === n ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}
                      >
                        {n === 1 ? "1-for-1" : n === 2 ? "2-for-1" : "3-for-1"}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Players to offer */}
            <Card className="border-border">
              <CardHeader className="pb-3 border-b border-border bg-secondary/20">
                <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
                  <Send className="w-4 h-4 text-primary" /> Players I'm Offering
                </CardTitle>
                <CardDescription className="text-xs">Select players from your roster to include in the trade</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-72">
                  <div className="p-3 space-y-1">
                    {myRosterLoading ? (
                      <div className="p-4 space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
                    ) : myRoster && myRoster.length > 0 ? (
                      myRoster.map(player => (
                        <label key={player.id} className="flex items-center gap-2.5 p-2 hover:bg-secondary/30 rounded-md cursor-pointer transition-colors">
                          <Checkbox checked={offeredPlayerIds.includes(player.id)} onCheckedChange={() => toggleOffered(player.id)} className="shrink-0" />
                          <PlayerAvatar espnPlayerId={player.espnPlayerId} sport={sport} name={player.fullName} size="sm" />
                          <div className="flex-1 min-w-0 leading-none">
                            <p className="text-sm font-medium truncate">{player.fullName}</p>
                            <p className="text-xs text-muted-foreground uppercase mt-0.5">{player.position} • {player.proTeam}</p>
                            {player.espnPublicStats && player.espnPublicStats.gamesPlayed > 0 ? (
                              <p className="text-[10px] text-primary/70 font-mono mt-0.5 truncate">{formatRealStats(player.espnPublicStats, sport)}</p>
                            ) : (
                              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{calcPpg(player.totalPoints, finderEstGames)} ppg est</p>
                            )}
                          </div>
                        </label>
                      ))
                    ) : myTeamId ? (
                      <p className="text-sm text-center p-4 text-muted-foreground">No players found.</p>
                    ) : (
                      <p className="text-sm text-center p-4 text-muted-foreground">Select your team first.</p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Button
              onClick={handleFindTrades}
              disabled={findMutation.isPending || !finderLeagueId || !myTeamId || offeredPlayerIds.length === 0}
              className="w-full uppercase tracking-widest font-bold"
              size="lg"
            >
              {findMutation.isPending
                ? <span className="flex items-center gap-2">Scanning All Teams <Sparkles className="w-4 h-4 animate-spin" /></span>
                : <span className="flex items-center gap-2"><Search className="w-4 h-4" /> Find Trade Packages</span>}
            </Button>
          </div>

          {/* Right: results */}
          <div className="lg:col-span-7 space-y-4">
            {findMutation.isPending && (
              <Card className="border-primary/50 bg-primary/5 animate-pulse">
                <CardContent className="p-12 flex flex-col items-center justify-center text-center space-y-4">
                  <Search className="w-12 h-12 text-primary" />
                  <p className="font-mono text-sm text-primary uppercase tracking-widest">Scanning All Teams…</p>
                  <p className="text-xs text-muted-foreground">AI is reviewing every roster in your league</p>
                </CardContent>
              </Card>
            )}

            {!findMutation.isPending && !findMutation.data && !findMutation.isError && (
              <Card className="border-dashed border-border bg-transparent">
                <CardContent className="p-12 flex flex-col items-center justify-center text-center opacity-50 space-y-3">
                  <Search className="w-12 h-12 text-muted-foreground" />
                  <p className="text-sm uppercase tracking-wide font-bold">No Results Yet</p>
                  <p className="text-xs text-muted-foreground">Configure your settings and hit Find Trade Packages to scan the league.</p>
                </CardContent>
              </Card>
            )}

            {findMutation.isError && (
              <Card className="border-destructive bg-destructive/10">
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <AlertCircle className="w-12 h-12 text-destructive mb-4" />
                  <p className="font-bold text-destructive">Trade Finder Failed</p>
                  <p className="text-sm text-destructive/80 mt-2">{(findMutation.error as { message?: string })?.message ?? "Could not scan the league."}</p>
                </CardContent>
              </Card>
            )}

            {findMutation.data && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-bold uppercase tracking-wide text-sm">
                      {findMutation.data.packages.length} Package{findMutation.data.packages.length !== 1 ? "s" : ""} Found
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Target: <span className={`font-bold ${fl.color}`}>{fl.text}</span> ({fairness}%) · {findMutation.data.cached && <span className="font-mono text-[10px] bg-secondary px-1 py-0.5 rounded">Cached</span>}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => findMutation.reset()} className="text-xs">
                    <Minus className="w-3 h-3 mr-1" /> Clear
                  </Button>
                </div>

                {findMutation.data.packages.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="p-8 text-center text-muted-foreground text-sm">
                      No viable packages found. Try adjusting your fairness target or changing which players you're offering.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {findMutation.data.packages.map((pkg, i) => (
                      <PackageCard
                        key={i}
                        pkg={pkg}
                        offeredPlayers={(myRoster ?? []).filter(p => offeredPlayerIds.includes(p.id))}
                        onLoadManual={handleLoadInManual}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
