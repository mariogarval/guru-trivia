"use client";

/**
 * Stub ad banner for free-tier users.
 * Shown between questions. Replace inner content with a real ad network later.
 */

import { Zap } from "lucide-react";

interface AdBannerProps {
  onUpgrade: () => void;
}

export default function AdBanner({ onUpgrade }: AdBannerProps) {
  return (
    <div className="mx-4 my-3 rounded-2xl border border-[rgba(214,235,253,0.12)] bg-white/[0.02] overflow-hidden">
      {/* Ad label */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-[9px] text-[#464a4d] uppercase tracking-widest font-medium">
          Advertisement
        </span>
        <button
          onClick={onUpgrade}
          className="flex items-center gap-1 text-[9px] text-[#11ff99] font-semibold uppercase tracking-wider hover:opacity-80 transition-opacity"
        >
          <Zap size={9} className="fill-[#11ff99]" />
          Remove ads
        </button>
      </div>

      {/* Placeholder ad content */}
      <div className="h-14 flex items-center justify-center bg-white/[0.02] border-t border-[rgba(214,235,253,0.06)]">
        <p className="text-xs text-[#464a4d] italic">Ad space</p>
      </div>
    </div>
  );
}
