"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Lock, ChevronRight, Zap } from "lucide-react";

interface Prediction {
  id: string;
  question_text: string;
  resolves_on: string;
  yes_votes: number;
  no_votes: number;
  correct_answer: boolean | null;
  resolved_at: string | null;
}

interface PredictionsScreenProps {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  onComplete: () => void;
}

export default function PredictionsScreen({
  matchId,
  homeTeam,
  awayTeam,
  onComplete,
}: PredictionsScreenProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [userVotes, setUserVotes] = useState<Record<string, boolean>>({});
  const [lockedVotes, setLockedVotes] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/predictions?matchId=${encodeURIComponent(matchId)}`);
        const data = await res.json();
        setPredictions(data.predictions ?? []);
        setUserVotes(data.userVotes ?? {});
        // Pre-lock any previously submitted votes
        setLockedVotes(data.userVotes ?? {});
      } catch {
        // silent — show empty state
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [matchId]);

  const handleVote = async (predictionId: string, answer: boolean) => {
    if (lockedVotes[predictionId] !== undefined || submitting) return;

    setSubmitting(predictionId);
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predictionId, matchId, answer }),
      });
      const data = await res.json();

      // Update local vote counts
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
      // silent fail
    } finally {
      setSubmitting(null);
    }
  };

  const totalLocked = Object.keys(lockedVotes).length;
  const totalPredictions = predictions.length;
  const allAnswered = totalPredictions > 0 && totalLocked >= Math.min(totalPredictions, 3);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#11ff99]/20 border-t-[#11ff99] rounded-full animate-spin" />
      </div>
    );
  }

  // If no predictions generated yet (generation in-progress or failed), skip straight through
  if (predictions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-4xl mb-4">⚡</div>
        <p className="text-[#a1a4a5] text-sm mb-6">No predictions available for this match yet.</p>
        <button
          onClick={onComplete}
          className="bg-[#11ff99] text-black font-bold py-3 px-8 rounded-full"
        >
          Start Trivia
        </button>
      </div>
    );
  }

  // Show up to 3 predictions (most interesting)
  const displayed = predictions.slice(0, 3);

  return (
    <div className="flex-1 flex flex-col p-4 pb-6 overflow-y-auto">
      {/* Header */}
      <div className="pt-6 pb-4 text-center">
        <div className="inline-flex items-center gap-1.5 bg-[#ff2047]/15 border border-[#ff2047]/30 rounded-full px-3 py-1 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff2047] animate-pulse" />
          <span className="text-xs font-semibold text-[#ff2047] uppercase tracking-wide">Live</span>
        </div>
        <h2 className="text-2xl font-black text-[#f0f0f0] tracking-tight mb-1">
          Make Your Predictions
        </h2>
        <p className="text-sm text-[#a1a4a5]">
          {homeTeam} vs {awayTeam}
        </p>
        <p className="text-xs text-[#464a4d] mt-1">
          Get them all right for a <span className="text-[#ffc53d] font-semibold">2× trivia bonus</span>
        </p>
      </div>

      {/* Prediction cards */}
      <div className="space-y-3 flex-1">
        <AnimatePresence>
          {displayed.map((pred, i) => {
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
                transition={{ delay: i * 0.08 }}
                className={`rounded-2xl border p-4 transition-colors ${
                  locked
                    ? "bg-white/[0.04] border-[rgba(214,235,253,0.25)]"
                    : "bg-white/[0.02] border-[rgba(214,235,253,0.12)]"
                }`}
              >
                {/* Question */}
                <p className="text-sm font-semibold text-[#f0f0f0] leading-snug mb-3">
                  {pred.question_text}
                </p>

                {/* YES / NO buttons */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {(["YES", "NO"] as const).map((label) => {
                    const isYes = label === "YES";
                    const isSelected = locked && userAnswer === isYes;
                    const isOther = locked && userAnswer !== isYes;

                    return (
                      <button
                        key={label}
                        disabled={locked || submitting === pred.id}
                        onClick={() => handleVote(pred.id, isYes)}
                        className={`py-2.5 rounded-xl font-bold text-sm transition-all active:scale-[0.97] ${
                          isSelected
                            ? isYes
                              ? "bg-[#11ff99] text-black"
                              : "bg-[#ff2047] text-white"
                            : isOther
                            ? "bg-white/5 text-[#464a4d]"
                            : "bg-white/[0.07] text-[#f0f0f0] hover:bg-white/[0.12]"
                        }`}
                      >
                        {isSelected && <Lock size={11} className="inline mr-1 mb-0.5" />}
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Community vote bars — shown after locking */}
                {locked && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.25 }}
                    className="space-y-1.5"
                  >
                    {[
                      { label: "YES", pct: yesPct, color: "#11ff99", isUser: userAnswer === true },
                      { label: "NO", pct: noPct, color: "#ff2047", isUser: userAnswer === false },
                    ].map(({ label, pct, color, isUser }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold w-6 text-[#464a4d]">{label}</span>
                        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: color, opacity: isUser ? 1 : 0.35 }}
                          />
                        </div>
                        <span
                          className={`text-[10px] font-bold w-7 text-right ${
                            isUser ? "" : "text-[#464a4d]"
                          }`}
                          style={{ color: isUser ? color : undefined }}
                        >
                          {pct}%
                        </span>
                      </div>
                    ))}
                    <p className="text-[10px] text-[#464a4d] text-right">
                      {total} {total === 1 ? "vote" : "votes"}
                    </p>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* CTA */}
      <div className="pt-4">
        {allAnswered ? (
          <motion.button
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={onComplete}
            className="w-full bg-[#11ff99] text-black font-bold py-4 rounded-full flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Zap size={16} className="fill-black" />
            Start Trivia
            <ChevronRight size={16} />
          </motion.button>
        ) : (
          <div className="text-center">
            <p className="text-xs text-[#464a4d] mb-3">
              Answer {Math.min(totalPredictions, 3) - totalLocked} more prediction
              {Math.min(totalPredictions, 3) - totalLocked !== 1 ? "s" : ""} to unlock trivia
            </p>
            <button
              onClick={onComplete}
              className="text-xs text-[#464a4d] hover:text-[#a1a4a5] transition-colors underline underline-offset-2"
            >
              Skip predictions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
