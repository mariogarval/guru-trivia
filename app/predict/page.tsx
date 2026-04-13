"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Lock, ChevronRight, Zap, TrendingUp } from "lucide-react";
import Link from "next/link";
import WaitlistSheet from "@/components/paywall/WaitlistSheet";
import { useAuth } from "@/hooks/useAuth";

interface Prediction {
  id: string;
  question_text: string;
  resolves_on: string;
  yes_votes: number;
  no_votes: number;
  correct_answer: boolean | null;
  resolved_at: string | null;
}

export default function PredictPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#11ff99]/20 border-t-[#11ff99] rounded-full animate-spin" />
      </div>
    }>
      <PredictContent />
    </Suspense>
  );
}

function PredictContent() {
  const searchParams = useSearchParams();
  const matchId = searchParams.get("match") ?? "";
  const teams = searchParams.get("teams") ?? "";
  const league = searchParams.get("league") ?? "Football";
  const homeCrest = searchParams.get("homeCrest") ?? "";
  const awayCrest = searchParams.get("awayCrest") ?? "";
  const score = searchParams.get("score") ?? null;

  const teamNames = teams.split(",").map((t) => t.trim());
  const homeTeam = teamNames[0] ?? "Home";
  const awayTeam = teamNames[1] ?? "Away";

  const { tier } = useAuth();
  const intelLocked = tier === "free";

  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [userVotes, setUserVotes] = useState<Record<string, boolean>>({});
  const [lockedVotes, setLockedVotes] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "generating" | "ready" | "empty">("loading");
  const [showIntelSheet, setShowIntelSheet] = useState(false);

  useEffect(() => {
    if (!matchId) { setStatus("empty"); return; }
    loadPredictions();
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPredictions() {
    setStatus("loading");
    try {
      const res = await fetch(`/api/predictions?matchId=${encodeURIComponent(matchId)}`);
      const data = await res.json();

      if (data.predictions?.length > 0) {
        setPredictions(data.predictions);
        setUserVotes(data.userVotes ?? {});
        setLockedVotes(data.userVotes ?? {});
        setStatus("ready");
        return;
      }

      // No predictions yet — generate on-demand
      setStatus("generating");
      const genRes = await fetch("/api/predictions/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, homeTeam, awayTeam, competition: league }),
      });
      const genData = await genRes.json();

      if (genData.ok) {
        // Fetch the newly generated predictions
        const res2 = await fetch(`/api/predictions?matchId=${encodeURIComponent(matchId)}`);
        const data2 = await res2.json();
        if (data2.predictions?.length > 0) {
          setPredictions(data2.predictions);
          setStatus("ready");
          return;
        }
      }

      setStatus("empty");
    } catch {
      setStatus("empty");
    }
  }

  async function handleVote(predictionId: string, answer: boolean) {
    if (lockedVotes[predictionId] !== undefined || submitting) return;
    setSubmitting(predictionId);
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predictionId, matchId, answer }),
      });
      const data = await res.json();
      if (data.votes) {
        setPredictions((prev) =>
          prev.map((p) =>
            p.id === predictionId
              ? { ...p, yes_votes: data.votes.yes_votes, no_votes: data.votes.no_votes }
              : p
          )
        );
      }
      setUserVotes((prev) => ({ ...prev, [predictionId]: answer }));
      setLockedVotes((prev) => ({ ...prev, [predictionId]: answer }));
    } catch {
      // silent
    } finally {
      setSubmitting(null);
    }
  }

  // Build trivia play link
  const playParams = new URLSearchParams();
  playParams.set("match", matchId);
  playParams.set("teams", teams);
  if (league) playParams.set("league", league);
  if (homeCrest) playParams.set("homeCrest", homeCrest);
  if (awayCrest) playParams.set("awayCrest", awayCrest);

  const votedCount = Object.keys(lockedVotes).length;
  const totalCount = predictions.length;

  return (
    <div className="flex-1 flex flex-col bg-black min-h-screen">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <Link href="/" className="p-2 -ml-2 text-[#464a4d] hover:text-[#f0f0f0] transition-colors">
          <ArrowLeft size={20} strokeWidth={1.5} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 bg-[#ff2047]/15 border border-[#ff2047]/30 rounded-full px-2.5 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff2047] live-pulse" />
              <span className="text-[10px] font-bold text-[#ff2047] uppercase tracking-wide">Live</span>
            </span>
            <span className="text-xs text-[#464a4d] truncate">{league}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingUp size={14} className="text-[#11ff99]" />
          <span className="text-xs font-semibold text-[#11ff99]">Predict</span>
        </div>
      </div>

      {/* Match scoreboard */}
      <div className="px-4 pb-4">
        <div className="bg-white/[0.03] border border-[rgba(214,235,253,0.12)] rounded-2xl p-4">
          <div className="flex items-center justify-between">
            {/* Home */}
            <div className="flex-1 flex flex-col items-center gap-2">
              {homeCrest ? (
                <img src={homeCrest} alt="" className="w-10 h-10 object-contain" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center text-lg">⚽</div>
              )}
              <p className="text-xs font-semibold text-[#f0f0f0] text-center leading-tight">{homeTeam}</p>
            </div>

            {/* Score */}
            <div className="flex flex-col items-center px-4">
              {score ? (
                <span className="text-2xl font-black font-mono text-[#ff6b7a] tracking-widest">{score}</span>
              ) : (
                <span className="text-sm text-[#464a4d] font-medium">vs</span>
              )}
              <span className="text-[10px] text-[#ff2047] font-semibold uppercase tracking-wider mt-1">Live</span>
            </div>

            {/* Away */}
            <div className="flex-1 flex flex-col items-center gap-2">
              {awayCrest ? (
                <img src={awayCrest} alt="" className="w-10 h-10 object-contain" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center text-lg">⚽</div>
              )}
              <p className="text-xs font-semibold text-[#f0f0f0] text-center leading-tight">{awayTeam}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 px-4 flex flex-col">
        {/* Section title */}
        <div className="mb-4">
          <h2 className="text-lg font-black text-[#f0f0f0]">Match Predictions</h2>
          <p className="text-xs text-[#464a4d] mt-0.5">
            Get all right for a <span className="text-[#ffc53d] font-semibold">2× trivia score bonus</span>
          </p>
        </div>

        {/* States */}
        {(status === "loading" || status === "generating") && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 pb-20">
            <div className="w-8 h-8 border-2 border-[#11ff99]/20 border-t-[#11ff99] rounded-full animate-spin" />
            <p className="text-sm text-[#464a4d]">
              {status === "generating" ? "Generating predictions…" : "Loading…"}
            </p>
          </div>
        )}

        {status === "empty" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 pb-20 text-center">
            <p className="text-[#464a4d] text-sm">No predictions available for this match.</p>
            <Link
              href={`/play?${playParams}`}
              className="bg-[#11ff99] text-black font-bold py-3 px-8 rounded-full"
            >
              Play Trivia
            </Link>
          </div>
        )}

        {status === "ready" && (
          <>
            <div className="space-y-3 pb-4">
              <AnimatePresence>
                {predictions.map((pred, i) => {
                  const locked = lockedVotes[pred.id] !== undefined;
                  const userAnswer = lockedVotes[pred.id];
                  const total = pred.yes_votes + pred.no_votes;
                  const yesPct = total > 0 ? Math.round((pred.yes_votes / total) * 100) : 50;
                  const noPct = 100 - yesPct;

                  return (
                    <motion.div
                      key={pred.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className={`rounded-2xl border p-4 ${
                        locked
                          ? "bg-white/[0.04] border-[rgba(214,235,253,0.22)]"
                          : "bg-white/[0.02] border-[rgba(214,235,253,0.10)]"
                      }`}
                    >
                      {/* Question */}
                      <p className="text-sm font-semibold text-[#f0f0f0] leading-snug mb-4">
                        {pred.question_text}
                      </p>

                      {/* YES / NO */}
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        {([true, false] as const).map((val) => {
                          const label = val ? "YES" : "NO";
                          const isSelected = locked && userAnswer === val;
                          const isOther = locked && userAnswer !== val;
                          return (
                            <button
                              key={label}
                              disabled={locked || !!submitting}
                              onClick={() => handleVote(pred.id, val)}
                              className={`py-3 rounded-xl font-black text-base tracking-wide transition-all active:scale-[0.96] ${
                                isSelected
                                  ? val
                                    ? "bg-[#11ff99] text-black"
                                    : "bg-[#ff2047] text-white"
                                  : isOther
                                  ? "bg-white/[0.04] text-[#464a4d]"
                                  : `border ${val ? "border-[#11ff99]/30 text-[#11ff99] bg-[#11ff99]/5 hover:bg-[#11ff99]/10" : "border-[#ff2047]/30 text-[#ff2047] bg-[#ff2047]/5 hover:bg-[#ff2047]/10"}`
                              }`}
                            >
                              {isSelected && <Lock size={11} className="inline mr-1 mb-0.5" />}
                              {label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Community split — shown after voting */}
                      {locked && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          transition={{ duration: 0.3 }}
                          className="relative"
                        >
                          <div className={`space-y-2 ${intelLocked ? "blur-sm select-none pointer-events-none" : ""}`}>
                            {/* YES bar */}
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-[#11ff99] w-8">YES</span>
                              <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${yesPct}%` }}
                                  transition={{ duration: 0.6, ease: "easeOut" }}
                                  className="h-full rounded-full bg-[#11ff99]"
                                  style={{ opacity: userAnswer === true ? 1 : 0.4 }}
                                />
                              </div>
                              <span className={`text-xs font-bold w-8 text-right ${userAnswer === true ? "text-[#11ff99]" : "text-[#464a4d]"}`}>
                                {yesPct}%
                              </span>
                            </div>
                            {/* NO bar */}
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-[#ff2047] w-8">NO</span>
                              <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${noPct}%` }}
                                  transition={{ duration: 0.6, ease: "easeOut" }}
                                  className="h-full rounded-full bg-[#ff2047]"
                                  style={{ opacity: userAnswer === false ? 1 : 0.4 }}
                                />
                              </div>
                              <span className={`text-xs font-bold w-8 text-right ${userAnswer === false ? "text-[#ff2047]" : "text-[#464a4d]"}`}>
                                {noPct}%
                              </span>
                            </div>
                            <p className="text-[10px] text-[#464a4d] text-right">
                              {total.toLocaleString()} {total === 1 ? "vote" : "votes"}
                            </p>
                          </div>

                          {/* Paywall lock overlay */}
                          {intelLocked && (
                            <button
                              onClick={() => setShowIntelSheet(true)}
                              className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-lg"
                            >
                              <div className="flex items-center gap-1.5 bg-black/80 backdrop-blur-sm px-3 py-1.5 rounded-full border border-[#ffc53d]/30">
                                <Lock size={11} className="text-[#ffc53d]" />
                                <span className="text-xs font-semibold text-[#ffc53d]">
                                  Unlock community vote — $0.99
                                </span>
                              </div>
                            </button>
                          )}
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Progress + play CTA */}
            <div className="pb-8 pt-2">
              {votedCount < totalCount && (
                <p className="text-xs text-[#464a4d] text-center mb-3">
                  {votedCount}/{totalCount} predictions made
                </p>
              )}
              <Link
                href={`/play?${playParams}`}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-full font-bold text-base active:scale-[0.98] transition-all ${
                  votedCount > 0
                    ? "bg-[#11ff99] text-black"
                    : "bg-white/[0.07] border border-[rgba(214,235,253,0.15)] text-[#a1a4a5]"
                }`}
              >
                <Zap size={16} className={votedCount > 0 ? "fill-black" : ""} />
                {votedCount > 0 ? "Play Trivia" : "Skip to Trivia"}
                <ChevronRight size={16} />
              </Link>
            </div>
          </>
        )}
      </div>

      {/* Prediction Intel waitlist */}
      {showIntelSheet && (
        <WaitlistSheet
          tierName="Prediction Intel"
          tierPrice="$0.99 per match"
          tierDescription="See how the community is voting on every prediction in real time."
          tierPerks={[
            "Community vote percentages revealed instantly",
            "See which side the crowd is on before you commit",
            "Included free in World Cup Season Pass",
          ]}
          tierInterest="prediction_intel"
          onDismiss={() => setShowIntelSheet(false)}
        />
      )}
    </div>
  );
}
