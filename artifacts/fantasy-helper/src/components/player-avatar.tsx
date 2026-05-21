import React, { useState } from "react";

const SPORT_CODES: Record<string, string> = {
  basketball: "nba",
  football: "nfl",
  baseball: "mlb",
  hockey: "nhl",
};

interface PlayerAvatarProps {
  espnPlayerId: string;
  sport: string;
  name: string;
  size?: "sm" | "md" | "lg";
}

export function PlayerAvatar({ espnPlayerId, sport, name, size = "md" }: PlayerAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const sportCode = SPORT_CODES[sport] ?? "nba";
  const url = `https://a.espncdn.com/combiner/i?img=/i/headshots/${sportCode}/players/full/${espnPlayerId}.png&w=96&h=70&scale=crop`;

  const sizeMap = {
    sm: "w-7 h-7 text-[10px]",
    md: "w-10 h-10 text-xs",
    lg: "w-14 h-14 text-sm",
  };

  const initials = name
    .split(" ")
    .map((n) => n[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (imgError) {
    return (
      <div className={`${sizeMap[size]} rounded-full bg-secondary flex items-center justify-center font-bold text-secondary-foreground flex-shrink-0`}>
        {initials}
      </div>
    );
  }

  return (
    <div className={`${sizeMap[size]} rounded-full overflow-hidden bg-secondary flex-shrink-0`}>
      <img
        src={url}
        alt={name}
        className="w-full h-full object-cover object-top"
        onError={() => setImgError(true)}
      />
    </div>
  );
}
