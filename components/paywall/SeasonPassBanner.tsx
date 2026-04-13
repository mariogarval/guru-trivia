"use client";

/**
 * World Cup Season Pass promotional banner.
 * Shown on the home screen during the World Cup window: June 11 – July 19, 2026.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Trophy, X, ChevronRight } from "lucide-react";
import WaitlistSheet from "./WaitlistSheet";

const WC_START = new Date("2026-06-11T00:00:00Z").getTime();
const WC_END   = new Date("2026-07-20T00:00:00Z").getTime(); // day after final

export function isWorldCupWindow(): boolean {
  const now = Date.now();
  return now >= WC_START && now < WC_END;
}

interface SeasonPassBannerProps {
  userTier: "free" | "ad_free" | "pro";
}

export default function SeasonPassBanner({ userTier }: SeasonPassBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [showSheet, setShowSheet] = useState(false);

  if (userTier === "pro" || dismissed || !isWorldCupWindow()) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="mx-4 mb-4 rounded-2xl bg-gradient-to-br from-[#ffc53d]/15 to-[#11ff99]/10 border border-[#ffc53d]/30 p-4 relative overflow-hidden"
      >
        {/* Dismiss */}
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-3 right-3 p-1 text-[#464a4d] hover:text-[#a1a4a5] transition-colors"
        >
          <X size={14} />
        </button>

        <div className="flex items-start gap-3 pr-4">
          <div className="w-10 h-10 rounded-xl bg-[#ffc53d]/20 flex items-center justify-center flex-shrink-0">
            <Trophy size={18} className="text-[#ffc53d]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-[#f0f0f0] mb-0.5">
              World Cup Season Pass
            </p>
            <p className="text-xs text-[#a1a4a5] leading-relaxed mb-3">
              Ad-free tournament, prediction intel for every match, +1 daily life, and the exclusive{" "}
              <span className="text-[#ffc53d] font-semibold">World Cup Guru</span> badge.
            </p>
            <button
              onClick={() => setShowSheet(true)}
              className="flex items-center gap-1.5 bg-[#ffc53d] text-black text-xs font-bold px-3.5 py-2 rounded-full active:scale-[0.97] transition-transform"
            >
              Get it — $4.99
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </motion.div>

      {showSheet && (
        <WaitlistSheet
          tierName="World Cup Season Pass"
          tierPrice="$4.99 one-time"
          tierDescription="Everything you need for World Cup 2026 — one price, full tournament."
          tierPerks={[
            "Ad-free for the entire tournament (Jun 11 – Jul 19)",
            "Prediction intel for every match",
            "+1 bonus life every day",
            'Exclusive "World Cup Guru" leaderboard badge',
          ]}
          tierInterest="pro"
          onDismiss={() => setShowSheet(false)}
        />
      )}
    </>
  );
}
