"use client";

import { useEffect, useState, useCallback } from "react";
import MatchCard from "@/components/ui/MatchCard";
import BottomNav from "@/components/layout/BottomNav";
import type { Match } from "@/types";

type Filter = "live" | "upcoming" | "past";

export default function MatchesPage() {
  const [activeFilter, setActiveFilter] = useState<Filter>("upcoming");
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/matches?filter=${activeFilter}`);
      const data = await res.json();
      setMatches(data.matches ?? []);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const filters: { id: Filter; label: string }[] = [
    { id: "live", label: "Live" },
    { id: "upcoming", label: "Upcoming" },
    { id: "past", label: "Recent" },
  ];

  return (
    <div className="flex-1 flex flex-col pb-20">
      <div className="px-4 pt-6 pb-3">
        <h1 className="text-2xl font-black text-slate-100 mb-4">Matches</h1>

        <div className="flex bg-dark-card border border-dark-border rounded-2xl p-1 gap-1">
          {filters.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveFilter(id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                activeFilter === id
                  ? "bg-brand-green text-dark-bg"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {id === "live" && (
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 mb-0.5 ${
                    activeFilter === "live"
                      ? "bg-dark-bg"
                      : "bg-red-500 live-pulse"
                  }`}
                />
              )}
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 space-y-3 overflow-y-auto">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-32 bg-dark-card border border-dark-border rounded-2xl animate-pulse"
            />
          ))
        ) : matches.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">⚽</p>
            <p className="text-slate-400">
              {activeFilter === "live"
                ? "No matches live right now"
                : activeFilter === "upcoming"
                ? "No upcoming matches in the next 24 hours"
                : "No recent matches"}
            </p>
          </div>
        ) : (
          matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
}
