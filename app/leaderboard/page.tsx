"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Flag, Users, Plus, Copy, Check, Share2, X, ChevronDown } from "lucide-react";
import BottomNav from "@/components/layout/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import type { LeaderboardEntry } from "@/types";

type TabType = "global" | "country" | "friends";

interface League {
  id: string;
  name: string;
  code: string;
  created_by: string;
  created_at: string;
}

const CROWN = ["👑", "🥈", "🥉"];

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return <span className="text-xl">{CROWN[rank - 1]}</span>;
  }
  return (
    <span className="text-sm font-bold text-[#464a4d] w-7 text-center tabular-nums">
      #{rank}
    </span>
  );
}

export default function LeaderboardPage() {
  const { isLoggedIn } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>("global");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);

  // League state
  const [showLeagueModal, setShowLeagueModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "join">("create");
  const [leagueCode, setLeagueCode] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [leagues, setLeagues] = useState<League[]>([]);
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null);
  const [showLeagueSelector, setShowLeagueSelector] = useState(false);

  // League action state
  const [creatingLeague, setCreatingLeague] = useState(false);
  const [joiningLeague, setJoiningLeague] = useState(false);
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const [createdLeague, setCreatedLeague] = useState<League | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [joinSuccess, setJoinSuccess] = useState(false);

  // Fetch user's leagues
  const fetchLeagues = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const res = await fetch("/api/leagues");
      const data = await res.json();
      setLeagues(data.leagues ?? []);
      if (!activeLeagueId && data.leagues?.length > 0) {
        setActiveLeagueId(data.leagues[0].id);
      }
    } catch {
      // ignore
    }
  }, [isLoggedIn, activeLeagueId]);

  useEffect(() => {
    fetchLeagues();
  }, [fetchLeagues]);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/leaderboard?type=${activeTab}`;
      if (activeTab === "friends" && activeLeagueId) {
        url += `&league_id=${activeLeagueId}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setEntries(data.entries ?? []);
      setUserRank(data.userRank ?? null);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, activeLeagueId]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const handleCreateLeague = async () => {
    if (!leagueName.trim()) return;
    setCreatingLeague(true);
    setLeagueError(null);
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: leagueName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create league");
      setCreatedLeague(data.league);
      setLeagueName("");
      fetchLeagues();
    } catch (err) {
      setLeagueError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreatingLeague(false);
    }
  };

  const handleJoinLeague = async () => {
    if (!leagueCode.trim()) return;
    setJoiningLeague(true);
    setLeagueError(null);
    setJoinSuccess(false);
    try {
      const res = await fetch("/api/leagues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: leagueCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to join league");
      setJoinSuccess(true);
      setLeagueCode("");
      fetchLeagues();
      setTimeout(() => {
        setShowLeagueModal(false);
        setJoinSuccess(false);
        setActiveTab("friends");
        if (data.leagueId) setActiveLeagueId(data.leagueId);
      }, 1500);
    } catch (err) {
      setLeagueError(err instanceof Error ? err.message : "Failed to join");
    } finally {
      setJoiningLeague(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const [shareSuccess, setShareSuccess] = useState(false);

  const shareLeague = async (league: League) => {
    const text = `Join my GURU Trivia league "${league.name}"! Use code: ${league.code}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "GURU Trivia League", text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    } catch {
      // Fallback: copy to clipboard if share fails
      try {
        await navigator.clipboard.writeText(text);
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 2000);
      } catch {
        // Last resort fallback
        window.prompt("Copy this code:", league.code);
      }
    }
  };

  const openModal = (mode: "create" | "join") => {
    setModalMode(mode);
    setLeagueError(null);
    setCreatedLeague(null);
    setJoinSuccess(false);
    setShowLeagueModal(true);
  };

  const activeLeague = leagues.find((l) => l.id === activeLeagueId);

  const tabs = [
    { id: "global" as const, label: t("lb.global"), icon: Globe },
    { id: "country" as const, label: t("lb.country"), icon: Flag },
    { id: "friends" as const, label: t("lb.friends"), icon: Users },
  ];

  return (
    <div className="flex-1 flex flex-col pb-20">
      {/* Header */}
      <div className="px-4 pt-8 pb-2">
        <h1 className="text-2xl font-black text-[#f0f0f0] mb-5 tracking-tight">
          {t("lb.title")}
        </h1>

        {/* Tabs */}
        <div className="flex bg-white/[0.03] border border-[rgba(214,235,253,0.19)] rounded-full p-1 gap-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                activeTab === id
                  ? "bg-[#11ff99] text-black"
                  : "text-[#464a4d] hover:text-[#a1a4a5]"
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {activeTab === "friends" && (
          <div className="mt-3 space-y-2">
            {/* League selector */}
            {leagues.length > 0 && (
              <div className="relative">
                <div className="w-full flex items-center justify-between bg-white/[0.03] border border-[rgba(214,235,253,0.19)] rounded-xl px-4 py-3">
                  <button
                    onClick={() => setShowLeagueSelector(!showLeagueSelector)}
                    className="flex-1 flex items-center justify-between min-w-0"
                  >
                    <span className="text-sm font-medium text-[#f0f0f0] truncate">
                      {activeLeague?.name ?? t("lb.selectLeague")}
                    </span>
                    <ChevronDown size={16} className={`text-[#464a4d] transition-transform shrink-0 ${showLeagueSelector ? "rotate-180" : ""}`} />
                  </button>
                  {activeLeague && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        shareLeague(activeLeague);
                      }}
                      className="ml-2 p-2 -mr-1 text-[#a1a4a5] hover:text-[#11ff99] active:text-[#11ff99] transition-colors shrink-0"
                      aria-label="Share league"
                    >
                      {shareSuccess ? <Check size={16} className="text-[#11ff99]" /> : <Share2 size={16} />}
                    </button>
                  )}
                </div>

                <AnimatePresence>
                  {showLeagueSelector && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute top-full left-0 right-0 mt-1 bg-black border border-[rgba(214,235,253,0.19)] rounded-xl overflow-hidden z-10"
                    >
                      {leagues.map((league) => (
                        <button
                          key={league.id}
                          onClick={() => {
                            setActiveLeagueId(league.id);
                            setShowLeagueSelector(false);
                          }}
                          className={`w-full flex items-center justify-between px-4 py-3 text-sm transition-colors ${
                            league.id === activeLeagueId
                              ? "bg-[#11ff99]/5 text-[#11ff99]"
                              : "text-[#f0f0f0] hover:bg-white/5"
                          }`}
                        >
                          <span className="font-medium">{league.name}</span>
                          <span className="text-xs text-[#464a4d] font-mono">{league.code}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Create / Join buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => openModal("create")}
                className="flex-1 flex items-center justify-center gap-2 bg-transparent border border-[#11ff99]/30 text-[#11ff99] rounded-full py-2.5 text-sm font-semibold hover:bg-[#11ff99]/5 transition-colors"
              >
                <Plus size={16} />
                {t("lb.create")}
              </button>
              <button
                onClick={() => openModal("join")}
                className="flex-1 bg-transparent border border-[rgba(214,235,253,0.19)] text-[#a1a4a5] rounded-full py-2.5 text-sm font-semibold hover:bg-white/5 transition-colors"
              >
                {t("lb.joinByCode")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 px-4 mt-3 space-y-2 overflow-y-auto">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-16 bg-white/[0.03] border border-[rgba(214,235,253,0.10)] rounded-2xl animate-pulse"
            />
          ))
        ) : entries.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#464a4d] text-sm">
              {activeTab === "friends"
                ? leagues.length === 0
                  ? t("lb.createOrJoin")
                  : t("lb.noScores")
                : t("lb.noRankings")}
            </p>
          </div>
        ) : (
          entries.map((entry, i) => {
            const isUser = userRank?.user_id === entry.user_id;
            return (
              <motion.div
                key={entry.user_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`flex items-center gap-3 p-3 rounded-2xl border ${
                  isUser
                    ? "bg-[#11ff99]/5 border-[#11ff99]/25"
                    : "bg-white/[0.03] border-[rgba(214,235,253,0.12)]"
                }`}
              >
                <div className="w-8 flex-shrink-0 flex items-center justify-center">
                  <RankBadge rank={entry.global_rank} />
                </div>
                <div className="w-10 h-10 rounded-full bg-white/[0.06] border border-[rgba(214,235,253,0.12)] flex items-center justify-center text-base flex-shrink-0">
                  {entry.country ? countryFlag(entry.country) : "🌍"}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-semibold truncate ${
                      isUser ? "text-[#11ff99]" : "text-[#f0f0f0]"
                    }`}
                  >
                    {isUser ? "You" : (entry.username ?? "Anonymous")}
                  </p>
                  {entry.country && (
                    <p className="text-xs text-[#464a4d]">{entry.country}</p>
                  )}
                </div>
                <p className="font-bold text-[#ffc53d] tabular-nums">
                  {entry.total_points.toLocaleString()}
                </p>
              </motion.div>
            );
          })
        )}
      </div>

      {/* User's rank (sticky) */}
      {userRank && !entries.find((e) => e.user_id === userRank.user_id) && (
        <div className="px-4 py-3 border-t border-[rgba(214,235,253,0.12)] bg-black">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#11ff99]/5 border border-[#11ff99]/25">
            <div className="w-8 flex-shrink-0">
              <RankBadge rank={userRank.global_rank} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-[#11ff99] text-sm">You</p>
            </div>
            <p className="font-bold text-[#ffc53d]">
              {userRank.total_points.toLocaleString()} pts
            </p>
          </div>
        </div>
      )}

      {/* League modal */}
      <AnimatePresence>
        {showLeagueModal && (
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end"
            onClick={() => setShowLeagueModal(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md mx-auto bg-black border-t border-[rgba(214,235,253,0.19)] rounded-t-3xl p-6 pb-24"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-[#f0f0f0]">
                  {createdLeague ? t("lb.leagueCreated") : modalMode === "create" ? t("lb.createLeague") : t("lb.joinLeague")}
                </h3>
                <button
                  onClick={() => setShowLeagueModal(false)}
                  className="p-1 text-[#464a4d] hover:text-[#f0f0f0] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Created league success */}
              {createdLeague ? (
                <div className="space-y-4">
                  <div className="bg-[#11ff99]/5 border border-[#11ff99]/20 rounded-2xl p-4 text-center">
                    <p className="text-sm text-[#a1a4a5] mb-1">{t("lb.shareCode")}</p>
                    <p className="text-3xl font-mono font-bold text-[#11ff99] tracking-wider mb-3">
                      {createdLeague.code}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => copyCode(createdLeague.code)}
                        className="flex-1 flex items-center justify-center gap-2 bg-white/[0.06] border border-[rgba(214,235,253,0.19)] rounded-full py-2.5 text-sm font-medium text-[#f0f0f0] hover:bg-white/10 transition-colors"
                      >
                        {codeCopied ? <Check size={15} className="text-[#11ff99]" /> : <Copy size={15} />}
                        {codeCopied ? t("play.copied") : t("lb.copyCode")}
                      </button>
                      <button
                        onClick={() => shareLeague(createdLeague)}
                        className="flex-1 flex items-center justify-center gap-2 bg-[#11ff99] text-black rounded-full py-2.5 text-sm font-bold active:scale-[0.98] transition-transform"
                      >
                        <Share2 size={15} />
                        {t("lb.inviteFriends")}
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowLeagueModal(false);
                      setCreatedLeague(null);
                      setActiveTab("friends");
                      setActiveLeagueId(createdLeague.id);
                    }}
                    className="w-full text-center text-sm text-[#a1a4a5] hover:text-[#f0f0f0] py-2 transition-colors"
                  >
                    {t("lb.goToLeague")}
                  </button>
                </div>
              ) : modalMode === "create" ? (
                /* Create form */
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-[#464a4d] mb-1.5 block uppercase tracking-wider font-medium">
                      {t("lb.leagueName")}
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Office Champions"
                      value={leagueName}
                      onChange={(e) => setLeagueName(e.target.value)}
                      maxLength={50}
                      className="w-full bg-transparent border border-[rgba(214,235,253,0.19)] rounded-xl px-4 py-3 text-sm text-[#f0f0f0] placeholder-[#464a4d] focus:outline-none focus:border-[#11ff99]/50"
                    />
                  </div>
                  {leagueError && (
                    <p className="text-xs text-[#ff2047]">{leagueError}</p>
                  )}
                  <button
                    onClick={handleCreateLeague}
                    disabled={creatingLeague || !leagueName.trim()}
                    className="w-full bg-[#11ff99] text-black font-bold py-3 rounded-full text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
                  >
                    {creatingLeague ? t("lb.creating") : t("lb.createLeague")}
                  </button>
                  <button
                    onClick={() => { setModalMode("join"); setLeagueError(null); }}
                    className="w-full text-center text-sm text-[#464a4d] hover:text-[#a1a4a5] py-1 transition-colors"
                  >
                    {t("lb.haveCode")}
                  </button>
                </div>
              ) : (
                /* Join form */
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-[#464a4d] mb-1.5 block uppercase tracking-wider font-medium">
                      {t("lb.leagueCode")}
                    </label>
                    <input
                      type="text"
                      placeholder="GURU-XXXX"
                      value={leagueCode}
                      onChange={(e) => setLeagueCode(e.target.value.toUpperCase())}
                      maxLength={9}
                      className="w-full bg-transparent border border-[rgba(214,235,253,0.19)] rounded-xl px-4 py-3 text-sm text-[#f0f0f0] placeholder-[#464a4d] uppercase font-mono tracking-widest text-center text-lg focus:outline-none focus:border-[#11ff99]/50"
                    />
                  </div>
                  {leagueError && (
                    <p className="text-xs text-[#ff2047]">{leagueError}</p>
                  )}
                  {joinSuccess && (
                    <p className="text-xs text-[#11ff99]">{t("lb.joinedSuccess")}</p>
                  )}
                  <button
                    onClick={handleJoinLeague}
                    disabled={joiningLeague || leagueCode.length < 9}
                    className="w-full bg-[#11ff99] text-black font-bold py-3 rounded-full text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
                  >
                    {joiningLeague ? t("lb.joining") : t("lb.joinLeague")}
                  </button>
                  <button
                    onClick={() => { setModalMode("create"); setLeagueError(null); }}
                    className="w-full text-center text-sm text-[#464a4d] hover:text-[#a1a4a5] py-1 transition-colors"
                  >
                    {t("lb.wantCreate")}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}

function countryFlag(country: string): string {
  const flags: Record<string, string> = {
    Brazil: "🇧🇷",
    Argentina: "🇦🇷",
    France: "🇫🇷",
    England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    Germany: "🇩🇪",
    Spain: "🇪🇸",
    Portugal: "🇵🇹",
    Netherlands: "🇳🇱",
    Belgium: "🇧🇪",
    Uruguay: "🇺🇾",
    Mexico: "🇲🇽",
    USA: "🇺🇸",
    Canada: "🇨🇦",
    Morocco: "🇲🇦",
    Japan: "🇯🇵",
    Guatemala: "🇬🇹",
    Colombia: "🇨🇴",
    Ecuador: "🇪🇨",
  };
  return flags[country] ?? "🌍";
}
