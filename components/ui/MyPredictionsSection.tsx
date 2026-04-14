"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Clock, Zap, CheckCircle } from "lucide-react";
import type { PredictionSession } from "@/types/predictions";

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadAllSessions(): PredictionSession[] {
  if (typeof window === "undefined") return [];
  const sessions: PredictionSession[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("guru_pred_")) continue;
    try {
      const raw = localStorage.getItem(key);
      if (raw) sessions.push(JSON.parse(raw));
    } catch {}
  }
  // Most recent first
  return sessions.sort((a, b) => b.createdAt - a.createdAt);
}

function sessionLabel(session: PredictionSession): {
  text: string;
  color: string;
  icon: string;
} {
  const firstHalf = session.predictions.filter((p) => p.half === "first_half");
  const secondHalf = session.predictions.filter((p) => p.half === "second_half");
  const firstAnswered = firstHalf.filter((p) => p.userAnswer).length;
  const secondAnswered = secondHalf.filter((p) => p.userAnswer).length;

  if (secondHalf.length > 0 && secondAnswered > 0) {
    return { text: `2nd half locked · ${secondAnswered}/${secondHalf.length} predictions`, color: "text-[#ffc53d]", icon: "⏱" };
  }
  if (session.halftimeScore !== undefined) {
    return { text: "Half time — answer 2nd half predictions", color: "text-[#ffc53d]", icon: "⚡" };
  }
  if (firstAnswered === firstHalf.length && firstHalf.length > 0) {
    return { text: `All ${firstHalf.length} first-half predictions locked in`, color: "text-[#11ff99]", icon: "✓" };
  }
  if (firstAnswered > 0) {
    return { text: `${firstAnswered}/${firstHalf.length} answered · pre-match`, color: "text-[#a1a4a5]", icon: "⚽" };
  }
  return { text: "Pre-match predictions ready", color: "text-[#a1a4a5]", icon: "⚽" };
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth()
  )
    return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MyPredictionsSection() {
  const [sessions, setSessions] = useState<PredictionSession[]>([]);

  useEffect(() => {
    setSessions(loadAllSessions());
  }, []);

  if (sessions.length === 0) return null;

  return (
    <section className="px-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-[#f0f0f0] flex items-center gap-2">
          <Zap size={14} className="text-[#11ff99]" />
          My Predictions
        </h2>
        <span className="text-xs text-[#464a4d]">{sessions.length} saved</span>
      </div>

      <div className="space-y-2.5">
        {sessions.slice(0, 5).map((session, i) => {
          const label = sessionLabel(session);
          const predictParams = new URLSearchParams({
            home: session.homeTeam,
            away: session.awayTeam,
            ...(session.league ? { league: session.league } : {}),
          });
          const firstHalf = session.predictions.filter((p) => p.half === "first_half");
          const answeredCount = session.predictions.filter((p) => p.userAnswer).length;
          const totalCount = session.predictions.length;

          return (
            <motion.div
              key={session.matchId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Link
                href={`/predict/${session.matchId}?${predictParams}`}
                className="flex items-center gap-3 bg-white/[0.03] border border-[rgba(214,235,253,0.19)] rounded-2xl p-3.5 hover:border-[#11ff99]/30 transition-all active:scale-[0.98]"
              >
                {/* Left: match info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {session.league && (
                      <span className="text-[10px] text-[#464a4d] uppercase tracking-wider font-medium truncate">
                        {session.league}
                      </span>
                    )}
                    <span className="text-[10px] text-[#464a4d]">·</span>
                    <span className="text-[10px] text-[#464a4d]">{formatDate(session.createdAt)}</span>
                  </div>
                  <p className="text-sm font-bold text-[#f0f0f0] truncate">
                    {session.homeTeam} <span className="text-[#464a4d] font-normal">vs</span> {session.awayTeam}
                  </p>
                  <p className={`text-xs mt-0.5 ${label.color}`}>
                    {label.icon} {label.text}
                  </p>
                </div>

                {/* Right: progress ring + arrow */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Mini progress indicator */}
                  <div className="text-right">
                    <p className="text-sm font-black text-[#f0f0f0] tabular-nums">
                      {answeredCount}
                      <span className="text-[#464a4d] font-normal text-xs">/{totalCount}</span>
                    </p>
                    <p className="text-[10px] text-[#464a4d]">answered</p>
                  </div>
                  <ChevronRight size={16} className="text-[#464a4d]" />
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
