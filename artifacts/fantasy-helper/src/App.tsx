import React from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "./components/layout";
import { SportProvider } from "./contexts/sport-context";
import NotFound from "@/pages/not-found";

import Dashboard from "./pages/dashboard";
import Sync from "./pages/sync";
import Leagues from "./pages/leagues";
import LeagueDetail from "./pages/league-detail";
import TradeLab from "./pages/trade";
import MyTeam from "./pages/my-team";
import Standings from "./pages/standings";
import WaiverWire from "./pages/waiver-wire";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/my-team" component={MyTeam} />
        <Route path="/leagues" component={Leagues} />
        <Route path="/leagues/:id" component={LeagueDetail} />
        <Route path="/standings" component={Standings} />
        <Route path="/trade" component={TradeLab} />
        <Route path="/waiver-wire" component={WaiverWire} />
        <Route path="/sync" component={Sync} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SportProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </SportProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;