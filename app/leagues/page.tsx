"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, LogIn, Copy, Check, Users, ChevronRight, X } from "lucide-react";
import BottomNav from "@/components/layout/BottomNav";
import { useAuth } from "@/hooks/useAuth";

interface League {
  id: string;
  name: string;
  code: string;
  created_by: string;
  created_at: string;
  memberCount?: number;
}

type Modal = "create" | "join" | null;

export default function LeaguesPage() {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [leagueName, setLeagueName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchLeagues = useCallback(async () => {
    setLoadingLeagues(true);
    try {
      const res = await fetch("/api/leagues");
      if (res.ok) {
        const data = await res.json();
        setLeagues(data.leagues ?? []);
      }
    } catch {}
    setLoadingLeagues(false);
  }, []);

  useEffect(() => {
    if (!authLoading) fetchLeagues();
  }, [authLoading, fetchLeagues]);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCreate = async () => {
    if (!leagueName.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: leagueName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      setModal(null);
      setLeagueName("");
      fetchLeagues();
    } catch (e: any) {
      setError(e.message);
    }
    setSubmitting(false);
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/leagues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "League not found");
      setModal(null);
      setJoinCode("");
      fetchLeagues();
    } catch (e: any) {
      setError(e.message);
    }
    setSubmitting(false);
  };

  const closeModal = () => {
    setModal(null);
    setLeagueName("");
    setJoinCode("");
    setError("");
  };

  return (
    <div className="flex-1 flex flex-col pb-20 min-h-screen bg-black text-[#f0f0f0]">
      {/* Header */}
      <div className="px-4 pt-8 pb-4 flex items-center gap-3">
        <Link href="/" className="p-1.5 -ml-1.5 text-[#a1a4a5] hover:text-[#f0f0f0] transition-colors">
          <ArrowLeft size={20} strokeWidth={2} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-black tracking-tight">Leagues</h1>
          <p className="text-xs text-[#464a4d] mt-0.5">Compete with friends in private groups</p>
        </div>
      </div>

      {/* Auth gate */}
      {!authLoading && !isLoggedIn && (
        <div className="mx-4 mb-4 bg-white/[0.03] border border-[rgba(214,235,253,0.19)] rounded-2xl p-5 text-center">
          <p className="text-2xl mb-2">🏆</p>
          <p className="font-bold mb-1">Sign in to join leagues</p>
          <p className="text-[#464a4d] text-sm mb-4">Create a private league and compete with friends.</p>
          <Link
            href="/auth/login?next=/leagues"
            className="inline-block bg-[#11ff99] text-black font-black px-6 py-2.5 rounded-full text-sm"
          >
            Sign in with Google
          </Link>
        </div>
      )}

      {/* CTA buttons */}
      {isLoggedIn && (
        <div className="px-4 mb-5 flex gap-3">
          <button
            onClick={() => { setModal("create"); setError(""); }}
            className="flex-1 flex items-center justify-center gap-2 bg-[#11ff99] text-black font-black py-3 rounded-full text-sm hover:bg-[#11ff99]/90 transition-colors active:scale-[0.97]"
          >
            <Plus size={16} />
            Create League
          </button>
          <button
            onClick={() => { setModal("join"); setError(""); }}
            className="flex-1 flex items-center justify-center gap-2 bg-white/[0.06] border border-[rgba(214,235,253,0.19)] font-bold py-3 rounded-full text-sm hover:border-[rgba(214,235,253,0.35)] transition-colors active:scale-[0.97]"
          >
            <LogIn size={16} />
            Join by Code
          </button>
        </div>
      )}

      {/* Leagues list */}
      <div className="px-4 flex-1">
        {loadingLeagues ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-white/[0.03] rounded-2xl animate-pulse border border-[rgba(214,235,253,0.08)]" />
            ))}
          </div>
        ) : leagues.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">🏟️</p>
            <p className="font-bold text-[#a1a4a5] mb-1">No leagues yet</p>
            <p className="text-[#464a4d] text-sm">Create one or ask a friend for their invite code.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {leagues.map((league, i) => (
              <motion.div
                key={league.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white/[0.03] border border-[rgba(214,235,253,0.19)] rounded-2xl p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-8 h-8 rounded-full bg-[rgba(17,255,153,0.08)] border border-[rgba(17,255,153,0.2)] flex items-center justify-center text-sm flex-shrink-0">
                        🏆
                      </div>
                      <p className="font-bold text-[#f0f0f0] truncate">{league.name}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-10">
                      <span className="text-xs text-[#464a4d] font-mono">{league.code}</span>
                      <button
                        onClick={() => copyCode(league.code)}
                        className="flex items-center gap-1 text-xs text-[#a1a4a5] hover:text-[#11ff99] transition-colors"
                      >
                        {copiedCode === league.code ? (
                          <><Check size={11} className="text-[#11ff99]" /><span className="text-[#11ff99]">Copied!</span></>
                        ) : (
                          <><Copy size={11} /><span>Copy code</span></>
                        )}
                      </button>
                    </div>
                  </div>
                  <Link
                    href={`/leaderboard?league=${league.id}`}
                    className="flex items-center gap-1 text-xs text-[#11ff99] font-semibold whitespace-nowrap mt-1"
                  >
                    <Users size={12} />
                    Leaderboard
                    <ChevronRight size={12} />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="mx-4 mt-8 mb-4 bg-white/[0.02] border border-[rgba(214,235,253,0.08)] rounded-2xl p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[#464a4d] mb-3">How leagues work</p>
        <div className="space-y-2.5">
          {[
            ["1", "Create a league and get a 9-character invite code"],
            ["2", "Share the code with friends — they join in one tap"],
            ["3", "Play live predictions together and compete on the leaderboard"],
          ].map(([n, text]) => (
            <div key={n} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-[rgba(17,255,153,0.1)] border border-[rgba(17,255,153,0.2)] text-[#11ff99] text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                {n}
              </span>
              <p className="text-xs text-[#a1a4a5] leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm px-4 pb-8"
            onClick={closeModal}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-[#0d0d0d] border border-[rgba(214,235,253,0.19)] rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black">
                  {modal === "create" ? "Create a League" : "Join a League"}
                </h2>
                <button onClick={closeModal} className="text-[#464a4d] hover:text-[#a1a4a5] transition-colors">
                  <X size={18} />
                </button>
              </div>

              {modal === "create" ? (
                <>
                  <p className="text-[#464a4d] text-sm mb-4">Give your league a name. You'll get a unique invite code to share.</p>
                  <input
                    type="text"
                    value={leagueName}
                    onChange={(e) => setLeagueName(e.target.value)}
                    placeholder="e.g. Sunday Warriors"
                    maxLength={50}
                    className="w-full bg-white/[0.05] border border-[rgba(214,235,253,0.19)] rounded-xl px-4 py-3 text-sm text-[#f0f0f0] placeholder-[#464a4d] outline-none focus:border-[#11ff99]/50 transition-colors mb-4"
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    autoFocus
                  />
                  {error && <p className="text-[#ff2047] text-xs mb-3">{error}</p>}
                  <button
                    onClick={handleCreate}
                    disabled={submitting || !leagueName.trim()}
                    className="w-full py-3.5 bg-[#11ff99] text-black font-black rounded-full text-sm disabled:opacity-40 hover:bg-[#11ff99]/90 transition-colors"
                  >
                    {submitting ? "Creating…" : "Create League"}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[#464a4d] text-sm mb-4">Enter the invite code a friend shared with you.</p>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="e.g. GURU-AB12"
                    maxLength={10}
                    className="w-full bg-white/[0.05] border border-[rgba(214,235,253,0.19)] rounded-xl px-4 py-3 text-sm text-[#f0f0f0] placeholder-[#464a4d] outline-none focus:border-[#11ff99]/50 transition-colors mb-4 font-mono tracking-wider"
                    onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                    autoFocus
                  />
                  {error && <p className="text-[#ff2047] text-xs mb-3">{error}</p>}
                  <button
                    onClick={handleJoin}
                    disabled={submitting || !joinCode.trim()}
                    className="w-full py-3.5 bg-[#11ff99] text-black font-black rounded-full text-sm disabled:opacity-40 hover:bg-[#11ff99]/90 transition-colors"
                  >
                    {submitting ? "Joining…" : "Join League"}
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
