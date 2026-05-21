import React, { useState } from "react";
import { Link } from "wouter";
import { useListLeagues, useDeleteLeague } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, ChevronRight, X } from "lucide-react";
import { useSport, SPORTS } from "@/contexts/sport-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getListLeaguesQueryKey } from "@workspace/api-client-react";

export default function Leagues() {
  const { sport } = useSport();
  const sportLabel = SPORTS.find(s => s.value === sport)?.label ?? sport;
  const { data: leagues, isLoading } = useListLeagues({ sport });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);

  const deleteMutation = useDeleteLeague({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeaguesQueryKey() });
        toast({ title: "League removed", description: `"${pendingDelete?.name}" has been deleted.` });
        setPendingDelete(null);
      },
      onError: () => {
        toast({ title: "Error", description: "Could not delete the league.", variant: "destructive" });
        setPendingDelete(null);
      },
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight uppercase">Leagues</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      </div>
    );
  }

  if (!leagues || leagues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 text-center">
        <Trophy className="w-16 h-16 text-muted-foreground opacity-20" />
        <h2 className="text-2xl font-bold">No leagues found</h2>
        <p className="text-muted-foreground">Sync your ESPN account to import your leagues.</p>
        <Link href="/sync" className="text-primary hover:underline font-bold uppercase mt-4 block">
          Go to Sync
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight uppercase">Your {sportLabel} Leagues</h1>
        <p className="text-muted-foreground mt-2">Manage and view rosters for all your synced ESPN {sportLabel.toLowerCase()} leagues.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {leagues.map(league => (
          <div key={league.id} className="relative group/card">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPendingDelete({ id: league.id, name: league.name });
              }}
              className="absolute top-3 right-3 z-10 w-6 h-6 rounded-full bg-muted/80 hover:bg-destructive hover:text-destructive-foreground text-muted-foreground flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all"
              aria-label="Remove league"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <Link href={`/leagues/${league.id}`}>
              <Card className="hover:border-primary transition-colors cursor-pointer border-border group bg-card h-full flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="bg-secondary text-xs font-bold px-2 py-1 rounded uppercase tracking-wider text-secondary-foreground inline-flex w-fit">
                      {league.sport} {league.season}
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <CardTitle className="text-xl mt-4 line-clamp-2">{league.name}</CardTitle>
                  <CardDescription className="text-xs uppercase tracking-wide">ESPN ID: {league.espnLeagueId}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground uppercase text-xs font-bold">Teams</span>
                      <span className="font-bold text-lg">{league.teamCount || "?"}</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-muted-foreground uppercase text-xs font-bold">Last Sync</span>
                      <span className="font-mono text-xs mt-1">{new Date(league.syncedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        ))}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove league?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-semibold text-foreground">"{pendingDelete?.name}"</span> and all its teams and players from SlayerPicks. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) deleteMutation.mutate({ id: pendingDelete.id });
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
