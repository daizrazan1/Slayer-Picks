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
  sport: "basketball",
  setSport: () => {},
});

export function SportProvider({ children }: { children: React.ReactNode }) {
  const [sport, setSport] = useState<Sport>("basketball");
  return (
    <SportContext.Provider value={{ sport, setSport }}>
      {children}
    </SportContext.Provider>
  );
}

export function useSport() {
  return useContext(SportContext);
}
