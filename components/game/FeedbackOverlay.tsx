"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, Flag, ArrowRight } from "lucide-react";

interface FeedbackOverlayProps {
  show: boolean;
  isCorrect: boolean;
  pointsEarned: number;
  explanation: string | null;
  speedLabel: "fast" | "medium" | "slow" | null;
  streakBonus: number;
  questionId?: string;
  onNext: () => void;
}

export default function FeedbackOverlay({
  show,
  isCorrect,
  pointsEarned,
  explanation,
  speedLabel,
  streakBonus,
  questionId,
  onNext,
}: FeedbackOverlayProps) {
  const [reported, setReported] = useState(false);

  const multiplierLabel =
    speedLabel === "fast"
      ? "2x speed bonus!"
      : speedLabel === "medium"
      ? "1.25x speed bonus"
      : null;

  const handleReport = async () => {
    if (!questionId || reported) return;
    try {
      await fetch("/api/questions/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, reason: "incorrect_answer" }),
      });
      setReported(true);
    } catch {
      // silent fail
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className={`fixed inset-x-0 bottom-0 rounded-t-3xl px-4 pt-4 pb-6 z-20 backdrop-blur-md ${
            isCorrect
              ? "bg-[#11ff99]/10 border-t border-[#11ff99]/40"
              : "bg-[#ff2047]/10 border-t border-[#ff2047]/40"
          }`}
        >
          <div className="flex items-start gap-3 mb-3">
            {isCorrect ? (
              <CheckCircle
                size={24}
                className="text-[#11ff99] flex-shrink-0 mt-0.5"
              />
            ) : (
              <XCircle
                size={24}
                className="text-[#ff2047] flex-shrink-0 mt-0.5"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`font-bold text-base ${
                    isCorrect ? "text-[#11ff99]" : "text-[#ff2047]"
                  }`}
                >
                  {isCorrect ? "Correct!" : "Wrong!"}
                </span>
                {isCorrect && pointsEarned > 0 && (
                  <span className="font-bold text-[#ffc53d] text-sm">
                    +{pointsEarned} pts
                  </span>
                )}
                {multiplierLabel && (
                  <span className="text-xs text-[#11ff99] bg-[#11ff99]/15 px-2 py-0.5 rounded-full border border-[#11ff99]/20">
                    {multiplierLabel}
                  </span>
                )}
                {streakBonus > 0 && (
                  <span className="text-xs text-[#ffc53d]">
                    +{streakBonus} streak
                  </span>
                )}
                {!isCorrect && (
                  <span className="text-xs text-[#ff2047]/80">-1 life</span>
                )}
              </div>
              {explanation && (
                <p className="text-xs text-[#a1a4a5] mt-1.5 leading-relaxed line-clamp-2">
                  {explanation}
                </p>
              )}
            </div>
          </div>

          {/* Bottom row: report + next */}
          <div className="flex items-center justify-between">
            {questionId ? (
              <button
                onClick={handleReport}
                disabled={reported}
                className="flex items-center gap-1.5 text-xs text-[#464a4d] hover:text-[#a1a4a5] transition-colors disabled:opacity-50"
              >
                <Flag size={11} />
                {reported ? "Reported" : "Report"}
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={onNext}
              className={`flex items-center gap-1.5 px-5 py-2.5 rounded-full font-bold text-sm active:scale-[0.97] transition-transform ${
                isCorrect
                  ? "bg-[#11ff99] text-black"
                  : "bg-[#ff2047] text-white"
              }`}
            >
              Next
              <ArrowRight size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
