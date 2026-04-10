"use client";

import Link from "next/link";
import { Users, ChevronRight, Clock } from "lucide-react";
import type { Match } from "@/types";

interface MatchCardProps {
  match: Match;
  activeGurus?: number;
}

function formatKickoff(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const matchDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const timeStr = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (matchDay.getTime() === today.getTime()) {
    return `Today ${timeStr}`;
  }
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (matchDay.getTime() === tomorrow.getTime()) {
    return `Tomorrow ${timeStr}`;
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MatchCard({ match, activeGurus = 0 }: MatchCardProps) {
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";

  return (
    <Link
      href={`/play?match=${match.id}`}
      className="block bg-white/[0.03] border border-[rgba(214,235,253,0.19)] rounded-2xl p-4 hover:border-[#11ff99]/30 transition-all active:scale-[0.98]"
    >
      {/* Status row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1.5 bg-[#ff2047]/15 text-[#ff2047] text-xs font-semibold px-2.5 py-0.5 rounded-full border border-[#ff2047]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff2047] live-pulse" />
              LIVE
            </span>
          )}
          {isFinished && (
            <span className="text-xs text-[#464a4d] font-medium uppercase tracking-wider">Finished</span>
          )}
          {!isLive && !isFinished && (
            <span className="flex items-center gap-1 text-xs text-[#a1a4a5]">
              <Clock size={12} />
              {formatKickoff(match.kickoff_time)}
            </span>
          )}
        </div>
        {activeGurus > 0 && (
          <span className="flex items-center gap-1 text-xs text-[#464a4d]">
            <Users size={12} />
            {activeGurus.toLocaleString()} gurus
          </span>
        )}
      </div>

      {/* Teams row */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/[0.06] border border-[rgba(214,235,253,0.12)] flex items-center justify-center text-lg">
              🏳️
            </div>
            <div>
              <p className="font-semibold text-[#f0f0f0] text-base">
                {match.home_team}
              </p>
              {isLive && match.current_score && (
                <p className="text-[#11ff99] font-mono text-sm font-bold">
                  {match.current_score.split("-")[0]}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center px-3">
          {isLive && match.current_score ? (
            <span className="text-2xl font-black text-[#f0f0f0] font-mono tracking-wider">
              {match.current_score}
            </span>
          ) : (
            <span className="text-xs text-[#464a4d] font-medium tracking-widest uppercase">vs</span>
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-3 flex-row-reverse">
            <div className="w-10 h-10 rounded-full bg-white/[0.06] border border-[rgba(214,235,253,0.12)] flex items-center justify-center text-lg">
              🏳️
            </div>
            <div className="text-right">
              <p className="font-semibold text-[#f0f0f0] text-base">
                {match.away_team}
              </p>
              {isLive && match.current_score && (
                <p className="text-[#11ff99] font-mono text-sm font-bold">
                  {match.current_score.split("-")[1]}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Venue + CTA */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[rgba(214,235,253,0.10)]">
        <span className="text-xs text-[#464a4d] truncate">
          {match.venue ?? "TBD"}
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-[#11ff99]">
          Start Trivia <ChevronRight size={14} />
        </span>
      </div>
    </Link>
  );
}
