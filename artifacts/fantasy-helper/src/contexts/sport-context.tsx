import React, { createContext, useContext, useState } from "react";

export type Sport = "basketball" | "football" | "baseball";

export const SPORTS: { value: Sport; label: string; emoji: string }[] = [
  { value: "basketball", label: "Basketball", emoji: "🏀" },
  { value: "football", label: "Football", emoji: "🏈" },
  { value: "baseball", label: "Baseball", emoji: "⚾" },
];

interface SportContextValue {
  sport: Sport;
  setSport: (sport: Sport) => void;
}

const SportContext = createContext<SportContextValue>({
  sport: "football",
  setSport: () => {},
});

export function SportProvider({ children }: { children: React.ReactNode }) {
  const [sport, setSportState] = useState<Sport>(() => {
    try {
      const saved = window.localStorage.getItem("slayer-picks-sport");
      if (SPORTS.some(option => option.value === saved)) return saved as Sport;
    } catch { /* Browser storage may be disabled. */ }
    return "football";
  });
  const setSport = (next: Sport) => {
    setSportState(next);
    try { window.localStorage.setItem("slayer-picks-sport", next); } catch { /* Keep current page usable. */ }
  };
  return (
    <SportContext.Provider value={{ sport, setSport }}>
      {children}
    </SportContext.Provider>
  );
}

export function useSport() {
  return useContext(SportContext);
}
