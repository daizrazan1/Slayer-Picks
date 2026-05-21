import React, { useState } from "react";
import { useSyncEspn } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, Terminal, CheckCircle2, AlertCircle, Info, Star, Smartphone } from "lucide-react";

const SPORTS = [
  { value: "basketball", label: "Basketball (NBA)", gameId: "fba" },
  { value: "football", label: "Football (NFL)", gameId: "ffl" },
  { value: "baseball", label: "Baseball (MLB)", gameId: "flb" },
  { value: "hockey", label: "Hockey (NHL)", gameId: "fhl" },
];

export default function Sync() {
  const [s2, setS2] = useState("");
  const [swid, setSwid] = useState("");
  const [sport, setSport] = useState("basketball");
  const [leagueId, setLeagueId] = useState("");
  const [copied, setCopied] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const syncMutation = useSyncEspn();

  // The bookmarklet runs ON ESPN's website in the user's browser.
  // It fetches the league data directly from ESPN (browser-side, no CORS issues)
  // then POSTs the raw data to our server at /api/sync-espn-push.
  // The app URL is baked in at render time so it works from any ESPN page.
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
    `var yr=(gid==='fba'||gid==='fhl')?(mo<8?cy-1:cy):(gid==='ffl')?(mo<7?cy-1:cy):cy;` +
    `var urls=[` +
    `'https://lm-api-reads.fantasy.espn.com/apis/v3/games/'+gid+'/seasons/'+yr+'/segments/0/leagues/'+lid+'?view=mTeam&view=mRoster&view=mSettings',` +
    `'https://fantasy.espn.com/apis/v3/games/'+gid+'/seasons/'+yr+'/segments/0/leagues/'+lid+'?view=mTeam&view=mRoster&view=mSettings'` +
    `];` +
    `function sendData(data){` +
    `fetch('${appOrigin}/api/sync-espn-push',{` +
    `method:'POST',` +
    `headers:{'Content-Type':'application/json'},` +
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

  const copyBookmarklet = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    toast({ title: "Bookmarklet copied!", description: "Now paste it as a new bookmark URL in your browser." });
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
          toast({
            title: "Sync Failed",
            description: (error as { error?: string }).error ?? "An unknown error occurred.",
            variant: "destructive",
          });
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
          <div className="flex items-center gap-3">
            <Star className="w-5 h-5 text-primary fill-primary" />
            <CardTitle className="uppercase tracking-wide">Bookmarklet Sync</CardTitle>
            <Badge className="bg-primary text-primary-foreground text-xs">Recommended</Badge>
          </div>
          <CardDescription>
            Runs entirely in your browser — works on desktop and iOS Safari. No cookie pasting required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            {[
              { n: "1", title: "Open your ESPN league", body: "Log into ESPN Fantasy and navigate to your league page. The URL must contain ?leagueId=XXXXX." },
              { n: "2", title: "Save the bookmarklet", body: "Copy the code below and save it as a bookmark — use the code as the URL, not a web address." },
              { n: "3", title: "Click it on ESPN", body: "While on your ESPN league page, click the bookmark. It fetches your data and syncs it here automatically." },
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

          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
              <Label className="uppercase text-xs font-bold text-muted-foreground flex items-center gap-1">
                <Smartphone className="w-3 h-3" /> Bookmarklet Code
              </Label>
              <span className="text-xs text-muted-foreground">Pre-configured for this app's URL</span>
            </div>
            <div className="relative bg-muted rounded-md p-4 group">
              <code className="text-xs break-all text-muted-foreground font-mono block pr-10 select-all" data-testid="text-bookmarklet">
                {bookmarkletCode}
              </code>
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2"
                onClick={copyBookmarklet}
                data-testid="button-copy-bookmarklet-icon"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <Button
              className="w-full"
              onClick={copyBookmarklet}
              data-testid="button-copy-bookmarklet"
            >
              {copied ? (
                <><CheckCircle2 className="w-4 h-4 mr-2" /> Copied to clipboard</>
              ) : (
                <><Copy className="w-4 h-4 mr-2" /> Copy Bookmarklet</>
              )}
            </Button>
          </div>

          <div className="p-3 rounded bg-muted border border-border text-xs text-muted-foreground flex gap-2">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              <strong>How to save as a bookmark:</strong> In Chrome/Safari, open Bookmarks → Add Bookmark, then edit the URL field and paste this code. On iOS Safari, bookmark any page, then edit the bookmark and replace the URL with this code.
            </span>
          </div>
        </CardContent>
      </Card>

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
                  In your ESPN league URL: fantasy.espn.com/[sport]/league?leagueId=XXXXX
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
                    {(syncMutation.error as { error?: string })?.error ?? "Failed to sync. Try the bookmarklet instead."}
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
