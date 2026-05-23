import React, { useState, useEffect, useRef } from "react";
import { useSyncEspn, useListLeagues, useEnrichLeague } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, Terminal, CheckCircle2, AlertCircle, Info, Star, Smartphone, RefreshCw, BarChart2, Monitor, ArrowUp, GripHorizontal } from "lucide-react";

const SPORTS = [
  { value: "basketball", label: "Basketball (NBA)", gameId: "fba" },
  { value: "football", label: "Football (NFL)", gameId: "ffl" },
  { value: "baseball", label: "Baseball (MLB)", gameId: "flb" },
  { value: "hockey", label: "Hockey (NHL)", gameId: "fhl" },
];

function detectMobile(): boolean {
  return typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export default function Sync() {
  const [s2, setS2] = useState("");
  const [swid, setSwid] = useState("");
  const [sport, setSport] = useState("basketball");
  const [leagueId, setLeagueId] = useState("");
  const [copied, setCopied] = useState(false);
  const [bookmarkView, setBookmarkView] = useState<"desktop" | "mobile">("desktop");
  const [dragging, setDragging] = useState(false);
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    setBookmarkView(detectMobile() ? "mobile" : "desktop");
  }, []);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const syncMutation = useSyncEspn();
  const enrichMutation = useEnrichLeague();
  const { data: leagues } = useListLeagues({});

  const handleEnrich = (leagueId: number, leagueName: string) => {
    enrichMutation.mutate(
      { id: leagueId },
      {
        onSuccess: () => {
          toast({ title: "Enrichment started", description: `Fetching real stats for ${leagueName} in the background. Takes ~1 min.` });
        },
        onError: () => {
          toast({ title: "Enrichment failed", description: "Could not start stat enrichment.", variant: "destructive" });
        },
      }
    );
  };

  const appOrigin = window.location.origin;
  const bookmarkletCode =
    `javascript:(function(){` +
    `var sports={fba:'basketball',ffl:'football',flb:'baseball',fhl:'hockey'};` +
    `var path=location.pathname;` +
    `var gid=path.includes('basketball')?'fba':path.includes('baseball')?'flb':path.includes('hockey')?'fhl':'ffl';` +
    `var sport=sports[gid]||'football';` +
    `var lid=new URLSearchParams(location.search).get('leagueId');` +
    `if(!lid){alert('Navigate to your ESPN Fantasy league page first, then click the bookmarklet.');return;}` +
    `var now=new Date();var mo=now.getMonth();var cy=now.getFullYear();` +
    `var yr=(gid==='fba'||gid==='fhl')?(mo>=9?cy+1:cy):(gid==='ffl')?(mo>=7?cy:cy-1):cy;` +
    `var urls=[` +
    `'https://lm-api-reads.fantasy.espn.com/apis/v3/games/'+gid+'/seasons/'+yr+'/segments/0/leagues/'+lid+'?view=mTeam&view=mRoster&view=mSettings',` +
    `'https://fantasy.espn.com/apis/v3/games/'+gid+'/seasons/'+yr+'/segments/0/leagues/'+lid+'?view=mTeam&view=mRoster&view=mSettings'` +
    `];` +
    `function sendData(data){` +
    `fetch('${appOrigin}/api/sync-espn-push',{` +
    `method:'POST',` +
    `headers:{'Content-Type':'application/json'},` +
    `credentials:'include',` +
    `body:JSON.stringify({espnData:data,sport:sport,leagueId:parseInt(lid)})` +
    `}).then(function(r){return r.json();})` +
    `.then(function(d){alert(d.message||'Sync complete!');})` +
    `.catch(function(e){alert('ESPN data fetched but could not reach Fantasy Helper. Error: '+e.message);});}` +
    `function tryNext(i){` +
    `if(i>=urls.length){alert('Could not reach ESPN API. Make sure you are logged into ESPN, on your league page, and that the URL contains ?leagueId=');return;}` +
    `fetch(urls[i],{credentials:'include',headers:{Accept:'application/json'}})` +
    `.then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})` +
    `.then(function(data){sendData(data);})` +
    `.catch(function(){tryNext(i+1);});}` +
    `tryNext(0);` +
    `})();`;

  // React blocks javascript: URLs in JSX props — set href directly on the DOM node to bypass it.
  useEffect(() => {
    if (bookmarkletRef.current) {
      bookmarkletRef.current.setAttribute("href", bookmarkletCode);
    }
  }, [bookmarkletCode]);

  const copyBookmarklet = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    toast({ title: "Bookmarklet copied!", description: "Now paste it as the URL of a new bookmark." });
  };

  const handleManualSync = (e: React.FormEvent) => {
    e.preventDefault();
    if (!s2 || !swid) {
      toast({ title: "Missing fields", description: "Please provide both espn_s2 and SWID cookies.", variant: "destructive" });
      return;
    }
    if (!leagueId || isNaN(Number(leagueId))) {
      toast({ title: "Missing League ID", description: "Enter your ESPN League ID from the league URL.", variant: "destructive" });
      return;
    }
    syncMutation.mutate(
      { data: { s2, swid, sport, leagueId: Number(leagueId) } },
      {
        onSuccess: (result) => {
          toast({ title: "Sync Successful", description: `Synced ${result.leaguesSynced} league(s) and ${result.playersSynced} players.` });
          queryClient.invalidateQueries();
          setS2(""); setSwid("");
        },
        onError: (error) => {
          toast({ title: "Sync Failed", description: (error as Error).message ?? "An unknown error occurred.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight uppercase">Data Sync</h1>
        <p className="text-muted-foreground mt-2">
          Connect your ESPN Fantasy account to import leagues, teams, and rosters.
        </p>
      </div>

      {/* Bookmarklet — primary method */}
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <Star className="w-5 h-5 text-primary fill-primary flex-shrink-0" />
            <CardTitle className="uppercase tracking-wide">Bookmarklet Sync</CardTitle>
            <Badge className="bg-primary text-primary-foreground text-xs">Recommended</Badge>
            <div className="ml-auto flex items-center gap-1 bg-muted rounded-full p-1">
              <button
                onClick={() => setBookmarkView("desktop")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase transition-all ${bookmarkView === "desktop" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Monitor className="w-3 h-3" /> Desktop
              </button>
              <button
                onClick={() => setBookmarkView("mobile")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase transition-all ${bookmarkView === "mobile" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Smartphone className="w-3 h-3" /> iOS / Mobile
              </button>
            </div>
          </div>
          <CardDescription>
            Runs entirely in your browser — no cookie pasting required. One click to sync any ESPN league.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {bookmarkView === "desktop" ? (
            /* ── DESKTOP: drag-to-bookmarks-bar ─────────────────────────────── */
            <>
              {/* Steps */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                {[
                  { n: "1", title: "Drag to bookmarks bar", body: "Drag the button below up to your browser's bookmarks bar. That's it — no copy-pasting needed." },
                  { n: "2", title: "Go to your ESPN league", body: "Log into ESPN Fantasy and open your league page. The URL must include ?leagueId=XXXXX." },
                  { n: "3", title: "Click the bookmark", body: "Click the ESPN Sync bookmark while on your league page. Your data will sync here instantly." },
                ].map(({ n, title, body }) => (
                  <div key={n} className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">{n}</div>
                    <div>
                      <p className="font-semibold mb-1">{title}</p>
                      <p className="text-muted-foreground leading-relaxed">{body}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Draggable button zone */}
              <div className="flex flex-col items-center gap-3 py-4">
                {/* Animated arrow pointing up */}
                <div className="flex flex-col items-center gap-1 text-primary/60 animate-bounce select-none">
                  <ArrowUp className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-widest">Drag up to bookmarks bar</span>
                </div>

                {/* The draggable link — href is set via ref/useEffect to bypass React's javascript: URL block */}
                <a
                  ref={bookmarkletRef}
                  onClick={(e) => e.preventDefault()}
                  onDragStart={() => setDragging(true)}
                  onDragEnd={() => setDragging(false)}
                  draggable
                  data-testid="link-bookmarklet-drag"
                  title="Drag this to your bookmarks bar"
                  className={`
                    inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl font-bold text-sm uppercase tracking-widest
                    border-2 border-primary text-primary bg-primary/10
                    cursor-grab active:cursor-grabbing select-none
                    transition-all duration-150
                    ${dragging
                      ? "scale-105 shadow-lg shadow-primary/30 border-primary bg-primary/20"
                      : "hover:bg-primary/20 hover:shadow-md hover:shadow-primary/20 hover:scale-[1.02]"
                    }
                  `}
                  style={{ WebkitUserDrag: "element" } as React.CSSProperties}
                >
                  <GripHorizontal className="w-4 h-4 opacity-60" />
                  ⚡ ESPN Sync
                  <GripHorizontal className="w-4 h-4 opacity-60" />
                </a>

                <p className="text-xs text-muted-foreground text-center max-w-xs">
                  Drag this button to your bookmarks bar. Don't see the bar? Press <kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">Ctrl+Shift+B</kbd> (Windows) or <kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">⌘+Shift+B</kbd> (Mac) to show it.
                </p>
              </div>

              {/* Fallback copy for power users */}
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1.5 list-none select-none">
                  <span className="group-open:hidden">▶</span>
                  <span className="hidden group-open:inline">▼</span>
                  Can't drag? Manually add the bookmark code instead
                </summary>
                <div className="mt-3 space-y-2">
                  <div className="relative bg-muted rounded-md p-4">
                    <code className="text-xs break-all text-muted-foreground font-mono block pr-10 select-all" data-testid="text-bookmarklet">
                      {bookmarkletCode}
                    </code>
                    <Button size="icon" variant="ghost" className="absolute top-2 right-2" onClick={copyBookmarklet} data-testid="button-copy-bookmarklet-icon">
                      {copied ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <Button className="w-full" variant="outline" onClick={copyBookmarklet} data-testid="button-copy-bookmarklet">
                    {copied ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Copied!</> : <><Copy className="w-4 h-4 mr-2" /> Copy Bookmarklet Code</>}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    In Chrome: Bookmarks → Bookmark manager → New Bookmark → paste as the URL. In Safari: Bookmarks → Add Bookmark → edit and replace the URL with this code.
                  </p>
                </div>
              </details>
            </>
          ) : (
            /* ── MOBILE / iOS: copy-paste flow ───────────────────────────────── */
            <>
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex gap-2 text-sm text-yellow-200">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-yellow-400" />
                <span>Mobile browsers can't add bookmarks via drag. Follow these steps to set it up — only takes 1 minute and you'll never need to do it again.</span>
              </div>

              {/* Step-by-step mobile instructions */}
              <div className="space-y-3">
                {[
                  {
                    n: "1",
                    title: "Copy the bookmarklet code",
                    body: null,
                    action: (
                      <Button className="w-full mt-2" onClick={copyBookmarklet} data-testid="button-copy-bookmarklet">
                        {copied
                          ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Copied to clipboard!</>
                          : <><Copy className="w-4 h-4 mr-2" /> Copy Bookmarklet Code</>
                        }
                      </Button>
                    ),
                  },
                  {
                    n: "2",
                    title: "Open Safari and bookmark any page",
                    body: "In Safari, tap the Share button (□↑) at the bottom, then tap 'Add Bookmark'. Save it anywhere — you'll edit it in the next step.",
                  },
                  {
                    n: "3",
                    title: "Edit the bookmark URL",
                    body: "Open your Bookmarks (the open-book icon), find the bookmark you just saved, tap Edit, then clear the URL field and paste the code you copied.",
                  },
                  {
                    n: "4",
                    title: "Go to your ESPN Fantasy league",
                    body: "Navigate to your ESPN Fantasy league page in Safari. The URL should contain ?leagueId=XXXXX.",
                  },
                  {
                    n: "5",
                    title: "Tap your bookmark",
                    body: "Open Bookmarks, tap the 'ESPN Sync' bookmark. It will fetch your league data and sync it here — a confirmation will pop up when done.",
                  },
                ].map(({ n, title, body, action }) => (
                  <div key={n} className="flex gap-3 p-3 rounded-lg border border-border bg-secondary/10">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs mt-0.5">{n}</div>
                    <div className="flex-1">
                      <p className="font-semibold text-sm mb-0.5">{title}</p>
                      {body && <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>}
                      {action}
                    </div>
                  </div>
                ))}
              </div>

              {/* Raw code block always visible for mobile */}
              <div className="space-y-2">
                <Label className="uppercase text-xs font-bold text-muted-foreground">Bookmarklet Code</Label>
                <div className="relative bg-muted rounded-md p-4">
                  <code className="text-xs break-all text-muted-foreground font-mono block pr-10 select-all" data-testid="text-bookmarklet">
                    {bookmarkletCode}
                  </code>
                  <Button size="icon" variant="ghost" className="absolute top-2 right-2" onClick={copyBookmarklet} data-testid="button-copy-bookmarklet-icon">
                    {copied ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Refresh Stats */}
      {leagues && leagues.length > 0 && (
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <BarChart2 className="w-5 h-5 text-primary" />
              <CardTitle className="uppercase tracking-wide">Refresh Real Stats</CardTitle>
            </div>
            <CardDescription>
              Pull fresh per-game stats, injury context, and news from ESPN's public API for each league. Runs in the background — takes about 1 minute per league.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {leagues.map(league => (
              <div key={league.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/20">
                <div>
                  <p className="font-semibold text-sm">{league.name}</p>
                  <p className="text-xs text-muted-foreground uppercase">{league.sport} · {league.season}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleEnrich(league.id, league.name)}
                  disabled={enrichMutation.isPending}
                  className="uppercase tracking-wide text-xs"
                >
                  <RefreshCw className={`w-3 h-3 mr-1.5 ${enrichMutation.isPending ? "animate-spin" : ""}`} />
                  Refresh Stats
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Manual form — fallback */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border-border opacity-80">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Terminal className="w-5 h-5 text-muted-foreground" />
              <CardTitle className="uppercase tracking-wide text-muted-foreground">Manual Cookie Sync</CardTitle>
              <Badge variant="outline" className="text-xs">Fallback</Badge>
            </div>
            <CardDescription>
              May not work from all environments. Use the bookmarklet above if this fails.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground mb-4 p-3 rounded bg-muted/50 border border-border flex gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-yellow-500" />
              <span>
                ESPN blocks server-to-server requests from cloud hosting providers. The bookmarklet works around this by fetching data directly from your browser.
              </span>
            </div>
            <form onSubmit={handleManualSync} className="space-y-4">
              <div className="space-y-2">
                <Label className="uppercase text-xs font-bold text-muted-foreground">Sport</Label>
                <Select value={sport} onValueChange={setSport}>
                  <SelectTrigger data-testid="select-sport">
                    <SelectValue placeholder="Select sport" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPORTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="league_id" className="uppercase text-xs font-bold text-muted-foreground">League ID</Label>
                <Input
                  id="league_id"
                  data-testid="input-league-id"
                  placeholder="e.g. 1028110717"
                  value={leagueId}
                  onChange={(e) => setLeagueId(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Find it in the URL: fantasy.espn.com/baseball/league?leagueId=<strong>XXXXX</strong>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="espn_s2" className="uppercase text-xs font-bold text-muted-foreground">ESPN_S2 Cookie</Label>
                <Input
                  id="espn_s2"
                  data-testid="input-espn-s2"
                  placeholder="AEBxxxxxxxx..."
                  value={s2}
                  onChange={(e) => setS2(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="swid" className="uppercase text-xs font-bold text-muted-foreground">SWID Cookie</Label>
                <Input
                  id="swid"
                  data-testid="input-swid"
                  placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
                  value={swid}
                  onChange={(e) => setSwid(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              <Button
                type="submit"
                variant="outline"
                data-testid="button-sync"
                className="w-full uppercase font-bold tracking-wide mt-2"
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? "Syncing..." : "Try Manual Sync"}
              </Button>

              {syncMutation.isError && (
                <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded flex items-start gap-2 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span data-testid="text-sync-error">
                    {(syncMutation.error as Error)?.message ?? "Failed to sync. Try the bookmarklet instead."}
                  </span>
                </div>
              )}

              {syncMutation.isSuccess && (
                <div className="mt-3 p-3 bg-primary/10 border border-primary/20 rounded flex items-start gap-2 text-primary text-sm">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span data-testid="text-sync-success">
                    Synced {syncMutation.data?.leaguesSynced} league(s) and {syncMutation.data?.playersSynced} players.
                  </span>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="uppercase tracking-wide text-sm">Where to find your cookies</CardTitle>
            <CardDescription>For the manual sync fallback only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {[
              { n: "1", title: "Log into ESPN Fantasy", body: "Open ESPN Fantasy in your browser and make sure you're logged in." },
              { n: "2", title: "Open DevTools", body: "Right-click the page → Inspect → Application tab → Cookies → select the ESPN domain." },
              { n: "3", title: "Copy espn_s2 and SWID", body: "Find these two cookie names in the list. Double-click each value to select it, then copy." },
            ].map(({ n, title, body }) => (
              <div key={n} className="flex gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold text-xs">{n}</div>
                <div>
                  <p className="font-semibold mb-0.5">{title}</p>
                  <p className="text-muted-foreground">{body}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
