"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Trophy, Settings, Target, Users } from "lucide-react";
import MatchCard from "@/components/ui/MatchCard";
import BottomNav from "@/components/layout/BottomNav";
import MyPredictionsSection from "@/components/ui/MyPredictionsSection";
import { useAuth } from "@/hooks/useAuth";
import type { Match } from "@/types";
import { FAKE_LEADERBOARD_USERS } from "@/lib/fake-data";

const TABS = [
  { id: "predict", label: "Predict", icon: "⚽" },
  { id: "picks",   label: "My Picks", icon: "⚡" },
  { id: "ranks",   label: "Ranks",    icon: "🏆" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Featured leagues shown on home, in display order
const LEAGUE_GROUPS = [
  {
    key: "ucl",
    label: "Champions League",
    emoji: "⭐",
    test: (l: string) => l.toLowerCase().includes("champions"),
  },
  {
    key: "epl",
    label: "Premier League",
    emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    test: (l: string) => l.toLowerCase().includes("premier"),
  },
  {
    key: "lla",
    label: "La Liga",
    emoji: "🇪🇸",
    test: (l: string) => l.toLowerCase().includes("la liga"),
  },
] as const;

function isFeatured(league: string | null | undefined): boolean {
  if (!league) return false;
  return LEAGUE_GROUPS.some((g) => g.test(league));
}

function countryFlag(country: string): string {
  const flags: Record<string, string> = {
    Spain: "🇪🇸", Argentina: "🇦🇷", England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", France: "🇫🇷",
    Germany: "🇩🇪", Portugal: "🇵🇹", Netherlands: "🇳🇱", Belgium: "🇧🇪",
    Brazil: "🇧🇷", Japan: "🇯🇵", Italy: "🇮🇹", Mexico: "🇲🇽",
    Uruguay: "🇺🇾", Morocco: "🇲🇦",
  };
  return flags[country] ?? "🌍";
}

export default function HomePage() {
  const { avatarUrl } = useAuth();
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("predict");

  useEffect(() => {
    // Fetch all live + upcoming, filter to featured leagues client-side
    Promise.all([
      fetch("/api/matches?filter=live").then((r) => r.json()),
      fetch("/api/matches?filter=upcoming").then((r) => r.json()),
    ])
      .then(([liveData, upcomingData]) => {
        setLiveMatches((liveData.matches ?? []).filter((m: Match) => isFeatured(m.league)));
        setUpcomingMatches((upcomingData.matches ?? []).filter((m: Match) => isFeatured(m.league)));
      })
      .catch(() => {})
      .finally(() => setLoadingMatches(false));
  }, []);

  // IntersectionObserver — updates active tab as user scrolls
  useEffect(() => {
    const ids: TabId[] = ["predict", "picks", "ranks"];
    const observers: IntersectionObserver[] = [];

    ids.forEach((id) => {
      const el = document.getElementById(`section-${id}`);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveTab(id); },
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
    const top = el.getBoundingClientRect().top + window.scrollY - 56;
    window.scrollTo({ top, behavior: "smooth" });
    setActiveTab(id);
  }, []);

  // Group matches by league for the predict section
  const matchesByLeague = useMemo(() => {
    const all = [...liveMatches, ...upcomingMatches];
    return LEAGUE_GROUPS.map((g) => ({
      ...g,
      matches: all.filter((m) => g.test(m.league ?? "")),
    })).filter((g) => g.matches.length > 0);
  }, [liveMatches, upcomingMatches]);

  const totalFans = 4_829 + liveMatches.length * 312;

  return (
    <div className="flex-1 flex flex-col pb-20">

      {/* ── Header ── */}
      <div className="px-4 pt-8 pb-3">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-3xl font-black tracking-tighter text-[#11ff99]">GURU</h1>
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
        <p className="text-xs text-[#464a4d] tracking-wider uppercase">Live Match Predictions</p>
      </div>

      {/* ── Sticky tabs ── */}
      <div className="sticky top-0 z-30 bg-black/90 backdrop-blur-md border-b border-white/[0.06]">
        <div className="flex gap-1.5 px-4 py-2.5 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => {
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
                <span className="text-xs leading-none">{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          SECTION: Predict — today's featured league games
          ══════════════════════════════════════════════════ */}
      <section id="section-predict" className="px-4 pt-5 pb-2 scroll-mt-14">

        {loadingMatches ? (
          <div className="space-y-3">
            <div className="h-5 w-36 bg-white/[0.03] rounded animate-pulse mb-4" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 bg-white/[0.03] border border-[rgba(214,235,253,0.12)] rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : matchesByLeague.length === 0 ? (
          <div className="bg-white/[0.03] border border-[rgba(214,235,253,0.12)] rounded-2xl p-6 text-center">
            <p className="text-2xl mb-2">⚽</p>
            <p className="text-[#a1a4a5] text-sm font-medium">No featured matches today</p>
            <p className="text-[#464a4d] text-xs mt-1">UCL · Premier League · La Liga</p>
            <Link href="/matches" className="mt-3 inline-block text-xs text-[#11ff99] font-medium">
              Browse all matches →
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {matchesByLeague.map((group) => (
              <div key={group.key}>
                {/* League header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm">{group.emoji}</span>
                  <h2 className="font-semibold text-[#f0f0f0] text-sm">{group.label}</h2>
                  {group.matches.some((m) => m.status === "live") && (
                    <span className="flex items-center gap-1 text-[10px] text-[#ff2047] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ff2047] live-pulse" />
                      LIVE
                    </span>
                  )}
                </div>
                <div className="space-y-3">
                  {group.matches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      activeGurus={match.status === "live" ? Math.floor(Math.random() * 2000 + 100) : 0}
                    />
                  ))}
                </div>
              </div>
            ))}

            <Link
              href="/matches"
              className="flex items-center justify-center gap-1.5 text-xs text-[#464a4d] hover:text-[#a1a4a5] transition-colors py-1"
            >
              See all matches <ChevronRight size={13} />
            </Link>
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════
          SECTION: My Picks
          ══════════════════════════════════════════════════ */}
      <section id="section-picks" className="scroll-mt-14 pt-4">
        <MyPredictionsSection />
        {/* Empty state CTA */}
        <div className="px-4 mb-4">
          <Link
            href="/matches"
            className="flex items-center justify-between bg-white/[0.03] border border-[rgba(214,235,253,0.12)] rounded-2xl p-4 hover:border-[#11ff99]/25 transition-all"
          >
            <div className="flex items-center gap-3">
              <Target size={18} className="text-[#11ff99]" />
              <div>
                <p className="font-semibold text-[#f0f0f0] text-sm">Make your predictions</p>
                <p className="text-xs text-[#464a4d]">Pick winners before kick-off</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-[#464a4d]" />
          </Link>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          SECTION: Ranks — leaderboard teaser with fake users
          ══════════════════════════════════════════════════ */}
      <section id="section-ranks" className="px-4 mb-5 scroll-mt-14">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-[#f0f0f0]">Top Gurus</h2>
            <p className="text-xs text-[#464a4d] mt-0.5">{totalFans.toLocaleString()} fans competing</p>
          </div>
          <Link href="/leaderboard" className="text-xs text-[#11ff99] font-medium">
            Full ranking →
          </Link>
        </div>

        <div className="space-y-2 mb-3">
          {FAKE_LEADERBOARD_USERS.slice(0, 5).map((user, i) => (
            <motion.div
              key={user.user_id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 bg-white/[0.03] border border-[rgba(214,235,253,0.12)] rounded-2xl px-3.5 py-2.5"
            >
              <span className="text-base w-6 text-center flex-shrink-0">
                {i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
              </span>
              <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-[rgba(214,235,253,0.10)] flex items-center justify-center text-sm flex-shrink-0">
                {countryFlag(user.country)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#f0f0f0] text-sm truncate">{user.username}</p>
                <p className="text-[10px] text-[#464a4d]">{user.country}</p>
              </div>
              <p className="font-bold text-[#ffc53d] tabular-nums text-sm">
                {user.total_points.toLocaleString()}
              </p>
            </motion.div>
          ))}
        </div>

        <Link
          href="/leaderboard"
          className="flex items-center justify-center gap-2 w-full bg-white/[0.03] border border-[rgba(214,235,253,0.12)] rounded-full py-3 text-sm font-semibold text-[#a1a4a5] hover:text-[#f0f0f0] hover:border-[rgba(214,235,253,0.25)] transition-all mb-3"
        >
          <Trophy size={15} className="text-[#ffc53d]" />
          Join the competition
        </Link>

        {/* Private leagues teaser */}
        <Link
          href="/leagues"
          className="flex items-center justify-between bg-white/[0.03] border border-[rgba(214,235,253,0.12)] rounded-2xl p-4 hover:border-[rgba(17,255,153,0.2)] transition-all"
        >
          <div className="flex items-center gap-3">
            <Users size={18} className="text-[#11ff99]" />
            <div>
              <p className="font-semibold text-[#f0f0f0] text-sm">Private Leagues</p>
              <p className="text-xs text-[#464a4d]">Compete with friends</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-[#464a4d]" />
        </Link>
      </section>

      <BottomNav />
    </div>
  );
}
