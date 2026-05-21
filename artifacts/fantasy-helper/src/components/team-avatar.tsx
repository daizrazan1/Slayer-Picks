import React from "react";

const PALETTE = [
  "bg-blue-600", "bg-emerald-600", "bg-violet-600", "bg-rose-600",
  "bg-amber-600", "bg-cyan-600", "bg-pink-600", "bg-indigo-600",
  "bg-lime-600", "bg-teal-600", "bg-orange-600", "bg-fuchsia-600",
];

function pickColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length]!;
}

interface TeamAvatarProps {
  name: string;
  abbrev: string;
  size?: "sm" | "md" | "lg";
}

export function TeamAvatar({ name, abbrev, size = "md" }: TeamAvatarProps) {
  const sizeMap = {
    sm: "w-8 h-8 text-[10px]",
    md: "w-10 h-10 text-xs",
    lg: "w-14 h-14 text-base",
  };
  return (
    <div className={`${sizeMap[size]} ${pickColor(name)} rounded-lg flex items-center justify-center font-bold text-white flex-shrink-0 tracking-wide`}>
      {abbrev.slice(0, 3).toUpperCase()}
    </div>
  );
}
