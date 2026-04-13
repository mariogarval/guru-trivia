"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Check } from "lucide-react";

interface UpsellModalProps {
  onUpgrade: () => void;
  onDismiss: () => void;
}

export default function UpsellModal({ onUpgrade, onDismiss }: UpsellModalProps) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onDismiss}
        />

        {/* Card */}
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 280 }}
          className="relative w-full max-w-md bg-[#0a0a0a] border-t border-[rgba(214,235,253,0.15)] rounded-t-3xl px-5 pt-5 pb-10 z-10"
        >
          {/* Handle */}
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />

          {/* Close */}
          <button
            onClick={onDismiss}
            className="absolute top-5 right-5 p-1.5 text-[#464a4d] hover:text-[#a1a4a5] transition-colors"
          >
            <X size={18} />
          </button>

          {/* Icon */}
          <div className="w-12 h-12 rounded-2xl bg-[#11ff99]/15 flex items-center justify-center mb-4">
            <Zap size={22} className="fill-[#11ff99] text-[#11ff99]" />
          </div>

          <h2 className="text-xl font-black text-[#f0f0f0] mb-1">
            Enjoying FUTGURU?
          </h2>
          <p className="text-sm text-[#a1a4a5] mb-5">
            Go Ad-Free for an uninterrupted experience — just{" "}
            <span className="text-[#f0f0f0] font-semibold">$2.99/month</span>.
          </p>

          <ul className="space-y-2 mb-6">
            {[
              "Zero ads between questions",
              "Same great trivia, cleaner experience",
              "Cancel anytime",
            ].map((perk) => (
              <li key={perk} className="flex items-center gap-2.5 text-sm text-[#f0f0f0]">
                <Check size={14} className="text-[#11ff99] flex-shrink-0" />
                {perk}
              </li>
            ))}
          </ul>

          <button
            onClick={onUpgrade}
            className="w-full bg-[#11ff99] text-black font-bold py-3.5 rounded-full active:scale-[0.98] transition-transform mb-2"
          >
            Join the waitlist — $2.99/mo
          </button>
          <button
            onClick={onDismiss}
            className="w-full text-center text-xs text-[#464a4d] hover:text-[#a1a4a5] transition-colors py-1"
          >
            Maybe later
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
