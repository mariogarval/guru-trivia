"use client";

import { useEffect, useRef, useState } from "react";
import { QUESTION_TIME_LIMIT } from "@/types";

interface CountdownBarProps {
  duration?: number;
  onExpire: () => void;
  running: boolean;
}

export default function CountdownBar({
  duration = QUESTION_TIME_LIMIT,
  onExpire,
  running,
}: CountdownBarProps) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!running) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    expiredRef.current = false;
    startRef.current = performance.now();
    setElapsed(0);

    const tick = (now: number) => {
      const elapsed = (now - startRef.current!) / 1000;
      setElapsed(elapsed);

      if (elapsed >= duration && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, duration, onExpire]);

  const pct = Math.max(0, Math.min(100, (1 - elapsed / duration) * 100));
  const isUrgent = elapsed > duration * 0.67;

  return (
    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-none ${
          isUrgent
            ? "bg-[#ff2047] " + (elapsed > duration * 0.85 ? "animate-pulse-fast" : "")
            : elapsed > duration * 0.33
            ? "bg-[#ffc53d]"
            : "bg-[#11ff99]"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
