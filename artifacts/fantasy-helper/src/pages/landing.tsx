import React from "react";
import { useLocation } from "wouter";
import { Activity, Zap, BarChart3, RefreshCw, ArrowRight, Trophy, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: RefreshCw,
    title: "ESPN Sync",
    description: "Connect your ESPN fantasy leagues instantly. One bookmarklet pulls all your teams, rosters, and stats into one place.",
  },
  {
    icon: Brain,
    title: "AI Trade Lab",
    description: "Get AI-powered trade evaluations with win scores, real stat context, and injury awareness across NBA, NFL, and MLB.",
  },
  {
    icon: Trophy,
    title: "Multi-Sport",
    description: "Manage all your fantasy leagues in one dashboard — basketball, football, baseball, all synced and analyzed together.",
  },
];

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="w-full border-b border-border/40 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
              <Activity className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight uppercase">
              Slayer<span className="text-primary">Picks</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/login")}>
              Log In
            </Button>
            <Button size="sm" onClick={() => setLocation("/register")} className="gap-1.5">
              Get Started <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="relative overflow-hidden pt-24 pb-20 px-6">
          {/* Background glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/10 rounded-full blur-[120px] opacity-60" />
          </div>

          <div className="relative max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-sm text-primary font-medium mb-8">
              <Zap className="w-3.5 h-3.5" />
              Powered by Groq AI
            </div>

            <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-none">
              Win your{" "}
              <span className="text-primary">fantasy</span>
              <br />
              leagues.
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              SlayerPicks syncs your ESPN leagues and uses AI to evaluate trades, analyze rosters,
              and give you the edge — across NFL, NBA, and MLB.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" onClick={() => setLocation("/register")} className="h-12 px-8 text-base gap-2">
                Create Free Account <ArrowRight className="w-4 h-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => setLocation("/login")} className="h-12 px-8 text-base">
                Sign In
              </Button>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 pb-24">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl font-bold tracking-tight mb-3">Everything you need to dominate</h2>
              <p className="text-muted-foreground text-lg">Built for serious fantasy players who want real data and smarter decisions.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="group p-6 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all duration-200"
                >
                  <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <f.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats bar */}
        <section className="border-y border-border bg-muted/30 py-10 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-3 gap-8 text-center">
              {[
                { value: "3", label: "Sports Supported" },
                { value: "AI", label: "Trade Evaluations" },
                { value: "Free", label: "To Get Started" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-3xl font-black text-primary mb-1">{s.value}</div>
                  <div className="text-sm text-muted-foreground font-medium">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 py-24">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-4xl font-black tracking-tight mb-4">
              Ready to <span className="text-primary">slay</span> your league?
            </h2>
            <p className="text-muted-foreground mb-8 text-lg">
              Join SlayerPicks and start making smarter fantasy decisions today.
            </p>
            <Button size="lg" onClick={() => setLocation("/register")} className="h-12 px-10 text-base gap-2">
              Get Started Free <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold uppercase tracking-tight">
              Slayer<span className="text-primary">Picks</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground">AI-powered fantasy sports analytics</p>
        </div>
      </footer>
    </div>
  );
}
