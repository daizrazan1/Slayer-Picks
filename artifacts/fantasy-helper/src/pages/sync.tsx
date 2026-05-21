import React, { useState } from "react";
import { useSyncEspn } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Terminal, CheckCircle2, AlertCircle, Info } from "lucide-react";

const SPORTS = [
  { value: "basketball", label: "Basketball (NBA)" },
  { value: "football", label: "Football (NFL)" },
  { value: "baseball", label: "Baseball (MLB)" },
  { value: "hockey", label: "Hockey (NHL)" },
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

  const handleSync = (e: React.FormEvent) => {
    e.preventDefault();
    if (!s2 || !swid) {
      toast({
        title: "Missing fields",
        description: "Please provide both espn_s2 and SWID cookies.",
        variant: "destructive",
      });
      return;
    }
    if (!leagueId || isNaN(Number(leagueId))) {
      toast({
        title: "Missing League ID",
        description: "Enter your ESPN League ID (found in your league URL).",
        variant: "destructive",
      });
      return;
    }

    syncMutation.mutate(
      { data: { s2, swid, sport, leagueId: Number(leagueId) } },
      {
        onSuccess: (result) => {
          toast({
            title: "Sync Successful",
            description: `Synced ${result.leaguesSynced} league(s) and ${result.playersSynced} players.`,
          });
          queryClient.invalidateQueries();
          setS2("");
          setSwid("");
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

  const bookmarkletCode = `javascript:(function(){const s2=document.cookie.match(/espn_s2=([^;]+)/)?.[1];const swid=document.cookie.match(/SWID=([^;]+)/)?.[1];if(s2&&swid){fetch(window.location.origin+'/api/sync-espn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({s2,swid,leagueId:new URLSearchParams(location.search).get('leagueId')|0,sport:location.pathname.split('/')[1]||'football'})}).then(r=>r.json()).then(d=>alert(d.message||'Sync Complete!')).catch(()=>alert('Sync failed'))}else{alert('Log into ESPN first!')}})();`;

  const copyBookmarklet = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Bookmarklet copied to clipboard." });
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight uppercase">Data Sync</h1>
        <p className="text-muted-foreground mt-2">
          Connect your ESPN Fantasy account to import leagues, teams, and rosters.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="uppercase tracking-wide flex items-center gap-2">
                <Terminal className="w-5 h-5 text-primary" />
                How to Sync
              </CardTitle>
              <CardDescription>
                Extract your ESPN auth cookies to import your fantasy data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4 text-sm">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold">
                    1
                  </div>
                  <div>
                    <h4 className="font-bold text-base mb-1">Find your League ID</h4>
                    <p className="text-muted-foreground">
                      Log into ESPN Fantasy and open your league. The URL will contain{" "}
                      <code className="bg-muted px-1 py-0.5 rounded text-primary">
                        ?leagueId=XXXXXX
                      </code>
                      . Copy that number.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold">
                    2
                  </div>
                  <div>
                    <h4 className="font-bold text-base mb-1">Open Developer Tools</h4>
                    <p className="text-muted-foreground">
                      Right-click anywhere on ESPN and select "Inspect", then go to the{" "}
                      <strong>Application</strong> tab → <strong>Cookies</strong> → click the ESPN
                      domain.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold">
                    3
                  </div>
                  <div>
                    <h4 className="font-bold text-base mb-1">Copy your Cookies</h4>
                    <p className="text-muted-foreground">
                      Find and copy the values for{" "}
                      <code className="bg-muted px-1 py-0.5 rounded text-primary">espn_s2</code>{" "}
                      and{" "}
                      <code className="bg-muted px-1 py-0.5 rounded text-primary">SWID</code>, then
                      paste them in the form.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-border">
                <h4 className="font-bold text-base mb-2 uppercase tracking-wide">
                  Bookmarklet (iOS Safari)
                </h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Save this as a bookmark in Safari. While on your ESPN league page, tap it to sync
                  automatically. It reads your sport and league ID from the URL.
                </p>
                <div className="relative bg-muted rounded-md p-4 group">
                  <code className="text-xs break-all text-muted-foreground font-mono block pr-8">
                    {bookmarkletCode}
                  </code>
                  <Button
                    size="icon"
                    variant="ghost"
                    data-testid="button-copy-bookmarklet"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={copyBookmarklet}
                  >
                    {copied ? (
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  data-testid="button-copy-bookmarklet-main"
                  onClick={copyBookmarklet}
                >
                  {copied ? (
                    <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />
                  ) : (
                    <Copy className="w-4 h-4 mr-2" />
                  )}
                  {copied ? "Copied!" : "Copy Bookmarklet"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="uppercase tracking-wide">Manual Sync</CardTitle>
              <CardDescription>Paste your credentials below to sync your league.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSync} className="space-y-4">
                <div className="space-y-2">
                  <Label className="uppercase text-xs font-bold text-muted-foreground">Sport</Label>
                  <Select value={sport} onValueChange={setSport}>
                    <SelectTrigger data-testid="select-sport">
                      <SelectValue placeholder="Select sport" />
                    </SelectTrigger>
                    <SelectContent>
                      {SPORTS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="league_id" className="uppercase text-xs font-bold text-muted-foreground">
                    League ID
                  </Label>
                  <Input
                    id="league_id"
                    data-testid="input-league-id"
                    placeholder="e.g. 12345678"
                    value={leagueId}
                    onChange={(e) => setLeagueId(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Found in your ESPN league URL: fantasy.espn.com/[sport]/league?leagueId=XXXXX
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="espn_s2" className="uppercase text-xs font-bold text-muted-foreground">
                    ESPN_S2 Cookie
                  </Label>
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
                  <Label htmlFor="swid" className="uppercase text-xs font-bold text-muted-foreground">
                    SWID Cookie
                  </Label>
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
                  data-testid="button-sync"
                  className="w-full uppercase font-bold tracking-wide mt-4"
                  disabled={syncMutation.isPending}
                >
                  {syncMutation.isPending ? "Syncing..." : "Sync ESPN Data"}
                </Button>

                {syncMutation.isError && (
                  <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded flex items-start gap-2 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span data-testid="text-sync-error">
                      {(syncMutation.error as { error?: string })?.error ??
                        "Failed to sync. Please check your credentials and try again."}
                    </span>
                  </div>
                )}

                {syncMutation.isSuccess && (
                  <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded flex items-start gap-2 text-primary text-sm">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span data-testid="text-sync-success">
                      Synced {syncMutation.data?.leaguesSynced} league(s) and{" "}
                      {syncMutation.data?.playersSynced} players. Head to Leagues to explore your
                      rosters.
                    </span>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
