import React from "react";
import { Link, useLocation } from "wouter";
import { Activity, Trophy, ArrowRightLeft, Settings, LayoutDashboard, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leagues", label: "Leagues", icon: Trophy },
  { href: "/trade", label: "Trade Lab", icon: ArrowRightLeft },
  { href: "/sync", label: "Sync Data", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const NavLinks = () => (
    <>
      {NAV_ITEMS.map((item) => {
        const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
        return (
          <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-all text-sm font-medium ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            <item.icon className="w-5 h-5" />
            {item.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
            <Activity className="w-6 h-6" />
          </div>
          <span className="font-bold text-lg tracking-tight uppercase">FANTASY<span className="text-primary">HELPER</span></span>
        </div>
        <nav className="flex-1 px-4 space-y-1 mt-4">
          <NavLinks />
        </nav>
      </aside>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <span className="font-bold uppercase tracking-tight text-sm">FANTASYHELPER</span>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-card border-r-border">
              <div className="p-6 flex items-center gap-3">
                <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
                  <Activity className="w-6 h-6" />
                </div>
                <span className="font-bold text-lg tracking-tight uppercase">FANTASY<span className="text-primary">HELPER</span></span>
              </div>
              <nav className="px-4 space-y-1 mt-4">
                <NavLinks />
              </nav>
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}