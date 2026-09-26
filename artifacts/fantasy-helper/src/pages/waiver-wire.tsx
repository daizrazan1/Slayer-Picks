import React, { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useListLeagues } from "@workspace/api-client-react";
import { useSport, SPORTS } from "@/contexts/sport-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Search } from "lucide-react";

type WaiverPlayer = {
  id: number; fullName: string; position: string; proTeam: string; availability: string;
  percentOwned: number | null; projectedPoints: number | null; totalPoints: number | null;
  injuryStatus: string | null;
};
type WaiverResponse = { players: WaiverPlayer[]; syncedAt: string | null };

export default function WaiverWire() {
  const { sport } = useSport();
  const sportLabel = SPORTS.find(s => s.value === sport)?.label ?? sport;
  const { data: leagues, isLoading: leaguesLoading } = useListLeagues({ sport });
  const [selectedLeague, setSelectedLeague] = useState("");
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [sort, setSort] = useState("owned");
  const [visibleCount, setVisibleCount] = useState(25);
  const activeLeague = leagues?.find(l => String(l.id) === selectedLeague) ?? leagues?.[0];
  const leagueId = activeLeague?.id;
  const { data, isLoading, error, refetch, isFetching } = useQuery<WaiverResponse>({
    queryKey: ["waiver-wire", leagueId], enabled: !!leagueId,
    queryFn: async () => {
      const response = await fetch(`/api/leagues/${leagueId}/waiver-wire`, { credentials: "include" });
      if (!response.ok) throw new Error(`Could not load available players (${response.status})`);
      return response.json() as Promise<WaiverResponse>;
    },
  });
  const positions = Array.from(new Set(data?.players.map(p => p.position) ?? [])).sort();
  const players = (data?.players ?? [])
    .filter(p => p.fullName.toLowerCase().includes(search.toLowerCase()) || p.proTeam.toLowerCase().includes(search.toLowerCase()))
    .filter(p => position === "all" || p.position === position)
    .filter(p => availability === "all" || p.availability === availability)
    .sort((a, b) => sort === "projected" ? (b.projectedPoints ?? -1) - (a.projectedPoints ?? -1)
      : sort === "season" ? (b.totalPoints ?? -1) - (a.totalPoints ?? -1)
      : sort === "name" ? a.fullName.localeCompare(b.fullName)
      : (b.percentOwned ?? -1) - (a.percentOwned ?? -1));

  return <div className="space-y-6 max-w-6xl mx-auto">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-bold tracking-tight uppercase">Waiver Wire</h1>
        <p className="text-muted-foreground mt-1">Available players in your {sportLabel} league.</p>
        {data?.syncedAt && <p className="text-xs text-muted-foreground mt-1">Last imported {new Date(data.syncedAt).toLocaleString()}</p>}</div>
      <div className="flex gap-2">
        <Link href="/sync"><Button variant="outline">Sync on ESPN</Button></Link>
        <Button variant="outline" onClick={() => refetch()} disabled={!leagueId || isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Reload list
        </Button>
      </div>
    </div>
    {leagues && leagues.length > 1 && <Select value={String(activeLeague?.id ?? "")} onValueChange={setSelectedLeague}>
      <SelectTrigger className="max-w-sm"><SelectValue placeholder="Choose a league" /></SelectTrigger>
      <SelectContent>{leagues.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}</SelectContent>
    </Select>}
    {!leaguesLoading && !leagueId && <Card><CardContent className="pt-6 space-y-3"><p>Import your ESPN league to see available players.</p><Link href="/sync"><Button>Set up ESPN Sync</Button></Link></CardContent></Card>}
    {error && <Card><CardContent className="pt-6 text-destructive">{(error as Error).message}</CardContent></Card>}
    {leagueId && !isLoading && !error && data?.players.length === 0 && <Card><CardContent className="pt-6 space-y-3">
      <p>No available players have been imported for this league yet.</p>
      <p className="text-sm text-muted-foreground">Replace your old ESPN Sync bookmark with the new one on Data Sync, then click it while viewing this league on ESPN.</p>
      <Link href="/sync"><Button>Get updated bookmark</Button></Link>
    </CardContent></Card>}
    {isLoading && <p className="text-muted-foreground">Loading available players…</p>}
    {!!data?.players.length && <>
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-48 flex-1 max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Search players or teams" placeholder="Search players or teams" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={position} onValueChange={setPosition}><SelectTrigger className="w-36"><SelectValue placeholder="Position" /></SelectTrigger><SelectContent><SelectItem value="all">All positions</SelectItem>{positions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
        <Select value={availability} onValueChange={setAvailability}><SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="FREEAGENT">Free agents</SelectItem><SelectItem value="WAIVERS">On waivers</SelectItem></SelectContent></Select>
        <Select value={sort} onValueChange={setSort}><SelectTrigger className="w-44"><SelectValue placeholder="Sort" /></SelectTrigger><SelectContent><SelectItem value="owned">Most rostered</SelectItem><SelectItem value="projected">Projected points</SelectItem><SelectItem value="season">Season points</SelectItem><SelectItem value="name">Name</SelectItem></SelectContent></Select>
      </div>
      <p className="text-sm text-muted-foreground">Showing {Math.min(players.length, visibleCount)} of {players.length} matching players ({data.players.length} available)</p>
      <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm">
        <thead className="bg-secondary/60 text-muted-foreground"><tr><th className="text-left p-3">Player</th><th className="text-left p-3">Position</th><th className="text-left p-3">Team</th><th className="text-left p-3">Status</th><th className="text-right p-3">Rostered</th><th className="text-right p-3">Season proj.</th><th className="text-right p-3">Season pts</th></tr></thead>
        <tbody>{players.slice(0, visibleCount).map(p => <tr key={p.id} className="border-t border-border"><td className="p-3 font-semibold">{p.fullName}{p.injuryStatus && !["ACTIVE", "NORMAL"].includes(p.injuryStatus) && <span className="ml-2 text-xs text-yellow-400">{p.injuryStatus}</span>}</td><td className="p-3">{p.position}</td><td className="p-3">{p.proTeam}</td><td className="p-3">{p.availability === "WAIVERS" ? "Waivers" : "Free agent"}</td><td className="p-3 text-right">{p.percentOwned == null ? "—" : `${p.percentOwned.toFixed(1)}%`}</td><td className="p-3 text-right">{p.projectedPoints == null ? "—" : p.projectedPoints.toFixed(1)}</td><td className="p-3 text-right">{p.totalPoints == null ? "—" : p.totalPoints.toFixed(1)}</td></tr>)}</tbody>
      </table></div>
      {players.length > visibleCount && <Button variant="outline" onClick={() => setVisibleCount(count => count + 25)}>Show more players</Button>}
    </>}
  </div>;
}
