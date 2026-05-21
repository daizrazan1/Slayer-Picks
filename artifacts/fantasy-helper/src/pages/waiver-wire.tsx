import React from "react";
import { Link } from "wouter";
import { useSport, SPORTS } from "@/contexts/sport-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Zap, RefreshCw, Info } from "lucide-react";

export default function WaiverWire() {
  const { sport } = useSport();
  const sportLabel = SPORTS.find((s) => s.value === sport)?.label ?? sport;

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight uppercase">Waiver Wire</h1>
        <p className="text-muted-foreground mt-1">Available free agents in your {sportLabel} league.</p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-primary" />
            <CardTitle className="uppercase tracking-wide">Coming Soon</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Waiver wire data requires fetching ESPN's <strong>free agent pool</strong>, which is a separate API call beyond what the current bookmarklet syncs. The current sync captures your league's rostered players only.
          </p>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Info className="w-4 h-4" /> What's needed to enable waiver wire
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold mt-0.5">1.</span>
                An updated bookmarklet that fetches the free agent player pool in addition to rostered players
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold mt-0.5">2.</span>
                A new database table to store available players separately from rostered players
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold mt-0.5">3.</span>
                Filtering by position, availability, and projected points
              </li>
            </ul>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 border border-border text-sm">
            <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <span className="text-muted-foreground">
              In the meantime, you can check available players directly on ESPN Fantasy and use the <strong className="text-foreground">AI Trade Lab</strong> to evaluate pickups against your current roster.
            </span>
          </div>

          <div className="flex gap-3 pt-2">
            <Link href="/trade">
              <Button className="uppercase font-bold tracking-wide">
                <RefreshCw className="w-4 h-4 mr-2" />
                Go to Trade Lab
              </Button>
            </Link>
            <Link href="/sync">
              <Button variant="outline" className="uppercase font-bold tracking-wide">
                Sync Data
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
