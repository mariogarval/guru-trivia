"use client";

import { useEffect, useState, useRef } from "react";

interface MatchBannerProps {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeCrest?: string;
  awayCrest?: string;
  league?: string;
}

interface LiveScore {
  status: "scheduled" | "live" | "finished";
  home_score: string;
  away_score: string;
  statusDetail: string;
  clock: string;
}

export default function MatchBanner({
  matchId,
  homeTeam,
  awayTeam,
  homeCrest,
  awayCrest,
  league,
}: MatchBannerProps) {
  const [score, setScore] = useState<LiveScore | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function fetchScore() {
      try {
        const res = await fetch(`/api/matches/live-score?id=${matchId}`);
        if (res.ok) {
          const data = await res.json();
          setScore(data);
        }
      } catch {
        // silent fail
      }
    }

    fetchScore();

    // Poll every 30s for live matches, 120s for scheduled
    intervalRef.current = setInterval(() => {
      fetchScore();
    }, score?.status === "live" ? 30000 : 120000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLive = score?.status === "live";

  return (
    <div className="mx-4 mb-3 bg-white/[0.03] border border-[rgba(214,235,253,0.19)] rounded-2xl p-3 overflow-hidden">
      {/* League label */}
      {league && (
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-[10px] text-[#a1a4a5] font-medium uppercase tracking-wider">
            {league}
          </span>
          {isLive && (
            <span className="flex items-center gap-1 bg-[#ff2047]/15 text-[#ff2047] text-[10px] font-semibold px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff2047] live-pulse" />
              LIVE
            </span>
          )}
        </div>
      )}

      {/* Teams + Score row */}
      <div className="flex items-center justify-between">
        {/* Home team */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {homeCrest ? (
            <img
              src={homeCrest}
              alt=""
              className="w-7 h-7 object-contain shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-xs shrink-0">
              ⚽
            </div>
          )}
          <span className="text-xs font-semibold text-[#f0f0f0] truncate">
            {homeTeam}
          </span>
        </div>

        {/* Score */}
        <div className="px-3 text-center shrink-0">
          {score && (score.status === "live" || score.status === "finished") ? (
            <div>
              <span
                className={`text-lg font-black font-mono tracking-wider ${
                  isLive ? "text-[#11ff99]" : "text-[#f0f0f0]"
                }`}
              >
                {score.home_score} - {score.away_score}
              </span>
              <p className={`text-[10px] mt-0.5 ${isLive ? "text-[#11ff99]" : "text-[#464a4d]"}`}>
                {score.statusDetail}
              </p>
            </div>
          ) : (
            <span className="text-xs text-[#464a4d] font-medium">vs</span>
          )}
        </div>

        {/* Away team */}
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-row-reverse">
          {awayCrest ? (
            <img
              src={awayCrest}
              alt=""
              className="w-7 h-7 object-contain shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-xs shrink-0">
              ⚽
            </div>
          )}
          <span className="text-xs font-semibold text-[#f0f0f0] truncate text-right">
            {awayTeam}
          </span>
        </div>
      </div>
    </div>
  );
}
