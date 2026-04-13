"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Zap, ChevronRight, Trophy, Settings } from "lucide-react";
import MatchCard from "@/components/ui/MatchCard";
import LivesDisplay from "@/components/ui/LivesDisplay";
import BottomNav from "@/components/layout/BottomNav";
import SeasonPassBanner from "@/components/paywall/SeasonPassBanner";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import type { Match } from "@/types";

interface LivesData {
  lives: number;
  nextLifeInMs: number | null;
}

const TABS = [
  { id: "play",     label: "Play",     icon: "⚡" },
  { id: "live",     label: "Live",     icon: null }, // pulsing dot
  { id: "upcoming", label: "Upcoming", icon: "📅" },
  { id: "ranks",    label: "Ranks",    icon: "🏆" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function HomePage() {
  const { isLoggedIn, loading: authLoading, avatarUrl, tier } = useAuth();
  const { t } = useLanguage();
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [livesData, setLivesData] = useState<LivesData>({ lives: 5, nextLifeInMs: null });
  const [totalPoints, setTotalPoints] = useState(0);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("play");

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

  // Track which section is in view and update active tab
  useEffect(() => {
    const ids: TabId[] = ["play", "live", "upcoming", "ranks"];
    const observers: IntersectionObserver[] = [];

    ids.forEach((id) => {
      const el = document.getElementById(`section-${id}`);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveTab(id);
        },
        { threshold: 0.25, rootMargin: "-56px 0px -40% 0px" }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [loadingMatches]);

  const scrollToSection = useCallback((id: TabId) => {
    const el = document.getElementById(`section-${id}`);
    if (!el) return;
    // Offset for the sticky tab bar (56px)
    const top = el.getBoundingClientRect().top + window.scrollY - 56;
    window.scrollTo({ top, behavior: "smooth" });
    setActiveTab(id);
  }, []);

  const visibleTabs = TABS.filter(
    (tab) => tab.id !== "live" || liveMatches.length > 0
  );

  return (
    <div className="flex-1 flex flex-col pb-20">
      {/* ── Top header (GURU logo + profile) ── */}
      <div className="px-4 pt-8 pb-3">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-3xl font-black tracking-tighter text-[#11ff99]">
            FUTGURU
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
        <p className="text-xs text-[#464a4d] tracking-wider uppercase">{t("home.subtitle")}</p>
      </div>

      {/* ── Sticky section tab bar ── */}
      <div className="sticky top-0 z-30 bg-black/90 backdrop-blur-md border-b border-white/[0.06]">
        <div className="flex gap-1.5 px-4 py-2.5 overflow-x-auto no-scrollbar">
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => scrollToSection(tab.id)}
                className={[
                  "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-all",
                  isActive
                    ? "bg-white text-black font-bold"
                    : "text-[#a1a4a5] font-medium hover:text-[#f0f0f0]",
                ].join(" ")}
              >
                {tab.id === "live" ? (
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? "bg-[#ff2047]" : "bg-[#ff2047]/60"} live-pulse`} />
                ) : tab.icon ? (
                  <span className="text-xs leading-none">{tab.icon}</span>
                ) : null}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Play section: stats card + quick play + categories ── */}
      <section id="section-play" className="px-4 pt-4 pb-4">
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

        {/* World Cup Season Pass banner (shows only during WC window) */}
        <SeasonPassBanner userTier={tier} />

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
            { id: "player", label: t("cat.player"), icon: "⚽" },
            { id: "team", label: t("cat.team"), icon: "🏟️" },
            { id: "world_cup", label: t("cat.world_cup"), icon: "🏆" },
            { id: "champions_league", label: t("cat.champions_league"), icon: "⭐" },
            { id: "nations", label: t("cat.nations"), icon: "🌍" },
            { id: "historical", label: t("cat.historical"), icon: "📜" },
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
      </section>

      {/* ── Match sections ── */}
      <div className="px-4">
        {loadingMatches ? (
          <div className="space-y-3 mb-5">
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
              <section id="section-live" className="mb-5 scroll-mt-14">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-[#ff2047] live-pulse" />
                  <h2 className="font-semibold text-[#f0f0f0]">{t("home.liveMatches")}</h2>
                </div>
                <div className="space-y-3">
                  {liveMatches.map((match) => (
                    <MatchCard key={match.id} match={match} activeGurus={Math.floor(Math.random() * 2000 + 100)} />
                  ))}
                </div>
              </section>
            )}

            {/* Upcoming Matches */}
            {upcomingMatches.length > 0 && (
              <section id="section-upcoming" className="mb-5 scroll-mt-14">
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
              </section>
            )}

            {liveMatches.length === 0 && upcomingMatches.length === 0 && (
              <div className="bg-white/[0.03] border border-[rgba(214,235,253,0.12)] rounded-2xl p-4 text-center mb-5">
                <p className="text-[#464a4d] text-sm">{t("home.noMatches")}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Leaderboard peek ── */}
      <section id="section-ranks" className="px-4 mb-4 scroll-mt-14">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-[#f0f0f0]">Top Gurus</h2>
          <Link href="/leaderboard" className="text-xs text-[#11ff99] font-medium">
            Full ranking
          </Link>
        </div>
        <Link
          href="/leaderboard"
          className="bg-white/[0.03] border border-[rgba(214,235,253,0.19)] rounded-2xl p-4 flex items-center gap-3 hover:border-[#11ff99]/25 transition-all"
        >
          <Trophy size={20} className="text-[#ffc53d]" />
          <div>
            <p className="font-semibold text-[#f0f0f0] text-sm">See global rankings</p>
            <p className="text-xs text-[#464a4d]">Compete with players worldwide</p>
          </div>
          <ChevronRight size={18} className="text-[#464a4d] ml-auto" />
        </Link>
      </section>

      <BottomNav />
    </div>
  );
}
