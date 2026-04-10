"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle } from "lucide-react";

interface FeedbackOverlayProps {
  show: boolean;
  isCorrect: boolean;
  pointsEarned: number;
  explanation: string | null;
  speedLabel: "fast" | "medium" | "slow" | null;
  streakBonus: number;
}

export default function FeedbackOverlay({
  show,
  isCorrect,
  pointsEarned,
  explanation,
  speedLabel,
  streakBonus,
}: FeedbackOverlayProps) {
  const multiplierLabel =
    speedLabel === "fast"
      ? "2x speed bonus!"
      : speedLabel === "medium"
      ? "1.25x speed bonus"
      : null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className={`absolute inset-x-0 bottom-0 rounded-t-3xl p-6 z-20 backdrop-blur-md ${
            isCorrect
              ? "bg-[#11ff99]/10 border-t border-[#11ff99]/40"
              : "bg-[#ff2047]/10 border-t border-[#ff2047]/40"
          }`}
        >
          <div className="flex items-start gap-3">
            {isCorrect ? (
              <CheckCircle
                size={28}
                className="text-[#11ff99] flex-shrink-0 mt-0.5"
              />
            ) : (
              <XCircle
                size={28}
                className="text-[#ff2047] flex-shrink-0 mt-0.5"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`font-bold text-lg ${
                    isCorrect ? "text-[#11ff99]" : "text-[#ff2047]"
                  }`}
                >
                  {isCorrect ? "Correct!" : "Wrong!"}
                </span>
                {isCorrect && pointsEarned > 0 && (
                  <span className="font-bold text-[#ffc53d] text-base">
                    +{pointsEarned} pts
                  </span>
                )}
                {multiplierLabel && (
                  <span className="text-xs text-[#11ff99] bg-[#11ff99]/15 px-2.5 py-0.5 rounded-full border border-[#11ff99]/20">
                    {multiplierLabel}
                  </span>
                )}
              </div>
              {streakBonus > 0 && (
                <p className="text-sm text-[#ffc53d] mt-1">
                  Streak bonus: +{streakBonus} pts
                </p>
              )}
              {!isCorrect && (
                <p className="text-sm text-[#ff2047]/80 mt-1">-1 life</p>
              )}
              {explanation && (
                <p className="text-sm text-[#a1a4a5] mt-2 leading-relaxed">
                  {explanation}
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
