"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Zap, ChevronRight, Trophy, Settings } from "lucide-react";
import MatchCard from "@/components/ui/MatchCard";
import LivesDisplay from "@/components/ui/LivesDisplay";
import BottomNav from "@/components/layout/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import type { Match } from "@/types";

interface LivesData {
  lives: number;
  nextLifeInMs: number | null;
}

export default function HomePage() {
  const { isLoggedIn, loading: authLoading, avatarUrl } = useAuth();
  const { t } = useLanguage();
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [livesData, setLivesData] = useState<LivesData>({ lives: 5, nextLifeInMs: null });
  const [totalPoints, setTotalPoints] = useState(0);
  const [loadingMatches, setLoadingMatches] = useState(true);

  useEffect(() => {
    fetch("/api/game/lives")
      .then((r) => r.json())
      .then((d) => setLivesData(d))
      .catch(() => {});

    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.profile) setTotalPoints(data.profile.total_points ?? 0);
      })
      .catch(() => {});

    Promise.all([
      fetch("/api/matches?filter=live").then((r) => r.json()),
      fetch("/api/matches?filter=upcoming").then((r) => r.json()),
    ])
      .then(([liveData, upcomingData]) => {
        setLiveMatches(liveData.matches ?? []);
        setUpcomingMatches(upcomingData.matches ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingMatches(false));
  }, []);

  return (
    <div className="flex-1 flex flex-col pb-20">
      {/* Header */}
      <div className="px-4 pt-8 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-3xl font-black tracking-tighter text-[#11ff99]">
            GURU
          </h1>
          <Link href="/profile" className="-mr-1">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="w-8 h-8 rounded-full object-cover border border-[rgba(214,235,253,0.19)]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="p-2 text-[#a1a4a5] hover:text-[#f0f0f0] transition-colors">
                <Settings size={20} strokeWidth={1.5} />
              </div>
            )}
          </Link>
        </div>
        <p className="text-xs text-[#464a4d] mb-6 tracking-wider uppercase">{t("home.subtitle")}</p>

        {/* Stats card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/[0.03] border border-[rgba(214,235,253,0.19)] rounded-2xl p-4 mb-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[11px] text-[#464a4d] mb-1.5 uppercase tracking-wider font-medium">{t("home.yourLives")}</p>
              <LivesDisplay
                lives={livesData.lives}
                nextLifeInMs={livesData.nextLifeInMs}
              />
            </div>
            <div className="text-right">
              <p className="text-[11px] text-[#464a4d] mb-1.5 uppercase tracking-wider font-medium">{t("home.totalPoints")}</p>
              <p className="text-2xl font-black text-[#ffc53d]">
                {totalPoints.toLocaleString()}
              </p>
            </div>
          </div>
          {!authLoading && !isLoggedIn && (
            <Link
              href="/auth/login"
              className="text-xs text-[#a1a4a5] hover:text-[#f0f0f0] transition-colors"
            >
              {t("home.signInPrompt")}
            </Link>
          )}
        </motion.div>

        {/* Quick Play CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-4"
        >
          <Link
            href="/play"
            className="flex items-center justify-between bg-[#11ff99] text-black rounded-full p-4 px-6 font-bold hover:bg-[#11ff99]/90 transition-colors active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <Zap size={22} className="fill-black" />
              <div>
                <p className="text-base font-black">{t("home.quickPlay")}</p>
                <p className="text-xs opacity-60 font-medium">
                  {t("home.quickPlaySub")}
                </p>
              </div>
            </div>
            <ChevronRight size={22} />
          </Link>
        </motion.div>

        {/* Category grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: "player", label: t("cat.player"), icon: "⚽", color: "#11ff99" },
            { id: "team", label: t("cat.team"), icon: "🏟️", color: "#3b9eff" },
            { id: "world_cup", label: t("cat.world_cup"), icon: "🏆", color: "#ffc53d" },
            { id: "champions_league", label: t("cat.champions_league"), icon: "⭐", color: "#ff801f" },
            { id: "nations", label: t("cat.nations"), icon: "🌍", color: "#11ff99" },
            { id: "historical", label: t("cat.historical"), icon: "📜", color: "#a1a4a5" },
          ].map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.03 }}
            >
              <Link
                href={`/play?category=${cat.id}`}
                className="flex items-center gap-2.5 bg-white/[0.03] border border-[rgba(214,235,253,0.12)] rounded-2xl p-3.5 hover:border-[rgba(214,235,253,0.25)] transition-all active:scale-[0.97]"
              >
                <span className="text-lg">{cat.icon}</span>
                <span className="text-sm font-medium text-[#f0f0f0]">{cat.label}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Today's Matches */}
      <section className="px-4 mb-5">
        {loadingMatches ? (
          <div className="space-y-3">
            <div className="h-6 w-32 bg-white/[0.03] rounded animate-pulse mb-3" />
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-28 bg-white/[0.03] border border-[rgba(214,235,253,0.12)] rounded-2xl animate-pulse"
              />
            ))}
          </div>
        ) : (
          <>
            {/* Live Matches */}
            {liveMatches.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-[#ff2047] live-pulse" />
                  <h2 className="font-semibold text-[#f0f0f0]">{t("home.liveMatches")}</h2>
                </div>
                <div className="space-y-3">
                  {liveMatches.map((match) => (
                    <MatchCard key={match.id} match={match} activeGurus={Math.floor(Math.random() * 2000 + 100)} />
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Matches */}
            {upcomingMatches.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-[#f0f0f0]">{t("home.upcoming")}</h2>
                  <Link
                    href="/matches"
                    className="text-xs text-[#11ff99] font-medium"
                  >
                    {t("home.seeAll")}
                  </Link>
                </div>
                <div className="space-y-3">
                  {upcomingMatches.slice(0, 5).map((match) => (
                    <MatchCard key={match.id} match={match} />
                  ))}
                </div>
              </div>
            )}

            {liveMatches.length === 0 && upcomingMatches.length === 0 && (
              <div className="bg-white/[0.03] border border-[rgba(214,235,253,0.12)] rounded-2xl p-4 text-center">
                <p className="text-[#464a4d] text-sm">{t("home.noMatches")}</p>
              </div>
            )}
          </>
        )}
      </section>

      {/* Leaderboard peek */}
      <section className="px-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-[#f0f0f0]">Top Gurus</h2>
          <Link
            href="/leaderboard"
            className="text-xs text-[#11ff99] font-medium"
          >
            Full ranking
          </Link>
        </div>
        <Link
          href="/leaderboard"
          className="bg-white/[0.03] border border-[rgba(214,235,253,0.19)] rounded-2xl p-4 flex items-center gap-3 hover:border-[#11ff99]/25 transition-all"
        >
          <Trophy size={20} className="text-[#ffc53d]" />
          <div>
            <p className="font-semibold text-[#f0f0f0] text-sm">
              See global rankings
            </p>
            <p className="text-xs text-[#464a4d]">
              Compete with players worldwide
            </p>
          </div>
          <ChevronRight size={18} className="text-[#464a4d] ml-auto" />
        </Link>
      </section>

      <BottomNav />
    </div>
  );
}
