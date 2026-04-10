"use client";

import { useEffect, useState } from "react";
import { Heart, Clock } from "lucide-react";
import { formatTimeUntilLife } from "@/lib/lives";
import { MAX_LIVES } from "@/types";

interface LivesDisplayProps {
  lives: number;
  nextLifeInMs: number | null;
}

export default function LivesDisplay({ lives, nextLifeInMs }: LivesDisplayProps) {
  const [remaining, setRemaining] = useState(nextLifeInMs);

  useEffect(() => {
    setRemaining(nextLifeInMs);
    if (!nextLifeInMs) return;

    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (!prev || prev <= 1000) return null;
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [nextLifeInMs]);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {Array.from({ length: MAX_LIVES }).map((_, i) => (
          <Heart
            key={i}
            size={20}
            className={
              i < lives
                ? "fill-[#ff2047] text-[#ff2047]"
                : "fill-white/10 text-white/10"
            }
          />
        ))}
      </div>
      {lives < MAX_LIVES && remaining !== null && (
        <div className="flex items-center gap-1 text-xs text-[#a1a4a5] bg-white/[0.05] border border-[rgba(214,235,253,0.12)] rounded-full px-2 py-0.5">
          <Clock size={12} />
          <span>{formatTimeUntilLife(remaining)}</span>
        </div>
      )}
    </div>
  );
}
