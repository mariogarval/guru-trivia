"use client";

import Link from "next/link";
import { Users, Clock, Zap, Calendar, Target } from "lucide-react";
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
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MatchCard({ match, activeGurus = 0 }: MatchCardProps) {
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const isPreGame = !isLive && !isFinished;

  // Build play link with team names + league for question context
  const playParams = new URLSearchParams();
  playParams.set("match", match.id);
  playParams.set("teams", `${match.home_team},${match.away_team}`);
  if (match.league) playParams.set("league", match.league);
  if (match.home_team_crest) playParams.set("homeCrest", match.home_team_crest);
  if (match.away_team_crest) playParams.set("awayCrest", match.away_team_crest);

  // Build predict link
  const predictParams = new URLSearchParams();
  predictParams.set("home", match.home_team);
  predictParams.set("away", match.away_team);
  if (match.league) predictParams.set("league", match.league);

  return (
    <div
      className={[
        "block rounded-2xl p-4 transition-all",
        isLive
          ? "bg-[#ff2047]/[0.06] border border-[#ff2047]/40"
          : "bg-white/[0.03] border border-[rgba(214,235,253,0.19)]",
      ].join(" ")}
    >
      {/* League + Status row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {match.league && (
            <span className={`text-[10px] font-medium uppercase tracking-wider ${isLive ? "text-[#ff2047]/70" : "text-[#a1a4a5]"}`}>
              {match.league}
            </span>
          )}
          {isLive && (
            <span className="flex items-center gap-1.5 bg-[#ff2047]/15 text-[#ff2047] text-xs font-semibold px-2.5 py-0.5 rounded-full border border-[#ff2047]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff2047] live-pulse" />
              LIVE
            </span>
          )}
          {isFinished && (
            <span className="text-xs text-[#464a4d] font-medium uppercase tracking-wider">FT</span>
          )}
          {isPreGame && (
            <span className="flex items-center gap-1 text-xs text-[#a1a4a5]">
              <Clock size={12} />
              {formatKickoff(match.kickoff_time)}
            </span>
          )}
        </div>
        {activeGurus > 0 && (
          <span className={`flex items-center gap-1 text-xs ${isLive ? "text-[#ff2047]/50" : "text-[#464a4d]"}`}>
            <Users size={12} />
            {activeGurus.toLocaleString()}
          </span>
        )}
      </div>

      {/* Teams row */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {match.home_team_crest ? (
              <img
                src={match.home_team_crest}
                alt=""
                className="w-8 h-8 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-[rgba(214,235,253,0.12)] flex items-center justify-center text-sm">
                ⚽
              </div>
            )}
            <p className="font-semibold text-[#f0f0f0] text-sm leading-tight">
              {match.home_team}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center px-3 min-w-[60px]">
          {(isLive || isFinished) && match.current_score ? (
            <span className={`text-xl font-black font-mono tracking-wider ${isLive ? "text-[#ff6b7a]" : "text-[#f0f0f0]"}`}>
              {match.current_score}
            </span>
          ) : (
            <span className="text-xs text-[#464a4d] font-medium tracking-widest uppercase">vs</span>
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-3 flex-row-reverse">
            {match.away_team_crest ? (
              <img
                src={match.away_team_crest}
                alt=""
                className="w-8 h-8 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-[rgba(214,235,253,0.12)] flex items-center justify-center text-sm">
                ⚽
              </div>
            )}
            <p className="font-semibold text-[#f0f0f0] text-sm leading-tight text-right">
              {match.away_team}
            </p>
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div className={`mt-3 pt-3 border-t flex gap-2 ${isLive ? "border-[#ff2047]/20" : "border-[rgba(214,235,253,0.10)]"}`}>
        {/* Predict button — primary CTA for pre-game + live */}
        {!isFinished && (
          <Link
            href={`/predict/${match.id}?${predictParams}`}
            className="flex-1 flex items-center justify-center gap-1.5 bg-[rgba(17,255,153,0.08)] border border-[rgba(17,255,153,0.25)] text-[#11ff99] font-bold text-sm py-2.5 rounded-xl hover:bg-[rgba(17,255,153,0.14)] transition-colors active:scale-[0.97]"
            onClick={(e) => e.stopPropagation()}
          >
            <Target size={13} />
            Predict
          </Link>
        )}
        {/* Trivia button */}
        <Link
          href={`/play?${playParams}`}
          className={[
            "flex items-center justify-center gap-1.5 font-bold text-sm py-2.5 rounded-xl transition-colors active:scale-[0.97]",
            isFinished
              ? "flex-1 bg-white/[0.04] border border-[rgba(214,235,253,0.12)] text-[#a1a4a5] hover:text-[#f0f0f0]"
              : "px-3 bg-white/[0.04] border border-[rgba(214,235,253,0.12)] text-[#a1a4a5] hover:text-[#f0f0f0]",
          ].join(" ")}
          onClick={(e) => e.stopPropagation()}
        >
          {isLive ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff2047] live-pulse flex-shrink-0" />
              <Zap size={12} />
            </>
          ) : (
            <Calendar size={13} />
          )}
          {isFinished ? "Play Trivia" : "Trivia"}
        </Link>
      </div>
    </div>
  );
}
