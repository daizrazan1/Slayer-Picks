import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "./components/layout";
import { SportProvider } from "./contexts/sport-context";
import { AuthProvider, useAuth } from "./contexts/auth-context";
import NotFound from "@/pages/not-found";

import Dashboard from "./pages/dashboard";
import Sync from "./pages/sync";
import Leagues from "./pages/leagues";
import LeagueDetail from "./pages/league-detail";
import TradeLab from "./pages/trade";
import MyTeam from "./pages/my-team";
import Standings from "./pages/standings";
import WaiverWire from "./pages/waiver-wire";
import Landing from "./pages/landing";
import Login from "./pages/login";
import Register from "./pages/register";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect to="/login" />;
  return <Component />;
}

function PublicOnlyRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Redirect to="/dashboard" />;
  return <Component />;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/" component={() => <PublicOnlyRoute component={Landing} />} />
      <Route path="/login" component={() => <PublicOnlyRoute component={Login} />} />
      <Route path="/register" component={() => <PublicOnlyRoute component={Register} />} />

      {user ? (
        <Route>
          <Layout>
            <Switch>
              <Route path="/dashboard" component={Dashboard} />
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
        </Route>
      ) : (
        <Route>
          <Redirect to="/login" />
        </Route>
      )}
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <SportProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AppRoutes />
            </WouterRouter>
            <Toaster />
          </SportProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
