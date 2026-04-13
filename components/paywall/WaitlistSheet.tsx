"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, ChevronRight } from "lucide-react";

export interface WaitlistSheetProps {
  tierName: string;
  tierPrice: string;
  tierDescription: string;
  tierPerks: string[];
  tierInterest: "ad_free" | "pro" | "prediction_intel";
  onDismiss: () => void;
}

export default function WaitlistSheet({
  tierName,
  tierPrice,
  tierDescription,
  tierPerks,
  tierInterest,
  onDismiss,
}: WaitlistSheetProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setErrorMsg("Enter a valid email address.");
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, tierInterest }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Something went wrong");
      }
      setStatus("success");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex flex-col justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onDismiss}
        />

        {/* Sheet */}
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="relative bg-[#0a0a0a] border-t border-[rgba(214,235,253,0.15)] rounded-t-3xl px-5 pt-5 pb-10 z-10"
        >
          {/* Drag handle */}
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />

          {/* Close */}
          <button
            onClick={onDismiss}
            className="absolute top-5 right-5 p-1.5 text-[#464a4d] hover:text-[#a1a4a5] transition-colors"
          >
            <X size={18} />
          </button>

          {/* Header */}
          <div className="mb-5">
            <div className="flex items-baseline gap-2 mb-1">
              <h2 className="text-xl font-black text-[#f0f0f0]">{tierName}</h2>
              <span className="text-[#11ff99] font-bold text-sm">{tierPrice}</span>
            </div>
            <p className="text-sm text-[#a1a4a5]">{tierDescription}</p>
          </div>

          {/* Perks */}
          <ul className="space-y-2 mb-6">
            {tierPerks.map((perk) => (
              <li key={perk} className="flex items-start gap-2.5 text-sm text-[#f0f0f0]">
                <Check size={14} className="text-[#11ff99] flex-shrink-0 mt-0.5" />
                {perk}
              </li>
            ))}
          </ul>

          {/* Coming Soon badge */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs bg-[#ffc53d]/15 border border-[#ffc53d]/30 text-[#ffc53d] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider">
              Coming Soon
            </span>
          </div>

          {/* Form */}
          {status === "success" ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <div className="w-12 h-12 rounded-full bg-[#11ff99]/15 flex items-center justify-center mx-auto mb-3">
                <Check size={22} className="text-[#11ff99]" />
              </div>
              <p className="font-bold text-[#f0f0f0] mb-1">You&apos;re on the list!</p>
              <p className="text-sm text-[#a1a4a5]">We&apos;ll let you know when {tierName} launches.</p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrorMsg(""); setStatus("idle"); }}
                placeholder="your@email.com"
                className="w-full bg-white/[0.05] border border-[rgba(214,235,253,0.19)] rounded-xl px-4 py-3 text-sm text-[#f0f0f0] placeholder-[#464a4d] focus:outline-none focus:border-[#11ff99]/50 transition-colors"
              />
              {status === "error" && (
                <p className="text-xs text-[#ff2047]">{errorMsg}</p>
              )}
              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full bg-[#11ff99] text-black font-bold py-3.5 rounded-full flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {status === "loading" ? (
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                ) : (
                  <>
                    Join the waitlist
                    <ChevronRight size={16} />
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="w-full text-center text-xs text-[#464a4d] hover:text-[#a1a4a5] transition-colors py-1"
              >
                Maybe later
              </button>
            </form>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
