import React, { useState } from "react";
import { useSyncEspn } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Terminal, CheckCircle2, AlertCircle } from "lucide-react";

export default function Sync() {
  const [s2, setS2] = useState("");
  const [swid, setSwid] = useState("");
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
        variant: "destructive"
      });
      return;
    }

    syncMutation.mutate({ data: { s2, swid } }, {
      onSuccess: (result) => {
        toast({
          title: "Sync Successful",
          description: `Synced ${result.leaguesSynced} leagues and ${result.playersSynced} players.`,
        });
        queryClient.invalidateQueries();
        setS2("");
        setSwid("");
      },
      onError: (error) => {
        toast({
          title: "Sync Failed",
          description: error.error || "An unknown error occurred during sync.",
          variant: "destructive"
        });
      }
    });
  };

  const bookmarkletCode = `javascript:(function(){const s2=document.cookie.match(/espn_s2=([^;]+)/)?.[1];const swid=document.cookie.match(/SWID=([^;]+)/)?.[1];if(s2&&swid){fetch(window.location.origin+'/api/sync-espn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({s2,swid})}).then(()=>alert('Sync Complete!'))}else{alert('Log into ESPN first!')}})();`;

  const copyBookmarklet = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied!",
      description: "Bookmarklet copied to clipboard.",
    });
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight uppercase">Data Sync</h1>
        <p className="text-muted-foreground mt-2">Connect your ESPN Fantasy account to import leagues, teams, and rosters.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="uppercase tracking-wide flex items-center gap-2">
                <Terminal className="w-5 h-5 text-primary" />
                How to Sync
              </CardTitle>
              <CardDescription>Follow these steps to extract your authentication cookies from ESPN.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4 text-sm">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold">1</div>
                  <div>
                    <h4 className="font-bold text-base mb-1">Log into ESPN</h4>
                    <p className="text-muted-foreground">Go to ESPN Fantasy in your browser and log into your account.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold">2</div>
                  <div>
                    <h4 className="font-bold text-base mb-1">Open Developer Tools</h4>
                    <p className="text-muted-foreground">Right-click anywhere on the page and select "Inspect", then navigate to the "Application" or "Storage" tab.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold">3</div>
                  <div>
                    <h4 className="font-bold text-base mb-1">Find your Cookies</h4>
                    <p className="text-muted-foreground">Look for the "Cookies" section on the left sidebar, select the ESPN domain, and find the values for <code className="bg-muted px-1 py-0.5 rounded text-primary">espn_s2</code> and <code className="bg-muted px-1 py-0.5 rounded text-primary">SWID</code>.</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-border">
                <h4 className="font-bold text-base mb-2 uppercase tracking-wide">Or Use the Bookmarklet (Recommended)</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Drag this link to your bookmarks bar, then click it while on the ESPN website to auto-sync. It uses your current app URL automatically.
                </p>
                <div className="relative bg-muted rounded-md p-4 group">
                  <code className="text-xs break-all text-muted-foreground font-mono block pr-8">
                    {bookmarkletCode}
                  </code>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={copyBookmarklet}
                  >
                    {copied ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="uppercase tracking-wide">Manual Input</CardTitle>
              <CardDescription>Paste your cookies here to sync manually.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSync} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="espn_s2" className="uppercase text-xs font-bold text-muted-foreground">ESPN_S2 Cookie</Label>
                  <Input 
                    id="espn_s2" 
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
                    placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}" 
                    value={swid}
                    onChange={(e) => setSwid(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full uppercase font-bold tracking-wide mt-4"
                  disabled={syncMutation.isPending}
                >
                  {syncMutation.isPending ? "Syncing..." : "Sync ESPN Data"}
                </Button>
                
                {syncMutation.isError && (
                  <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded flex items-start gap-2 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{syncMutation.error?.error || "Failed to sync. Please check your cookies and try again."}</span>
                  </div>
                )}
                
                {syncMutation.isSuccess && (
                  <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded flex items-start gap-2 text-primary text-sm">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>Successfully synced data. You can now use the Trade Lab.</span>
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