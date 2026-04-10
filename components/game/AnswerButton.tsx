"use client";

import { motion } from "framer-motion";

interface AnswerButtonProps {
  text: string;
  index: number;
  state: "idle" | "correct" | "wrong" | "revealed";
  disabled: boolean;
  onClick: () => void;
}

const letters = ["A", "B", "C", "D"];

export default function AnswerButton({
  text,
  index,
  state,
  disabled,
  onClick,
}: AnswerButtonProps) {
  const baseClasses =
    "w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all font-medium text-base min-h-[56px]";

  const stateClasses = {
    idle: "bg-transparent border-[rgba(214,235,253,0.19)] text-[#f0f0f0] hover:bg-white/5 hover:border-[rgba(214,235,253,0.35)] active:scale-[0.97]",
    correct:
      "bg-[#11ff99]/10 border-[#11ff99]/60 text-[#11ff99]",
    wrong: "bg-[#ff2047]/10 border-[#ff2047]/60 text-[#ff2047]",
    revealed:
      "bg-[#11ff99]/5 border-[#11ff99]/30 text-[#11ff99]/80",
  };

  return (
    <motion.button
      whileTap={!disabled ? { scale: 0.97 } : undefined}
      className={`${baseClasses} ${stateClasses[state]}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${
          state === "idle"
            ? "bg-white/10 text-[#a1a4a5]"
            : state === "correct"
            ? "bg-[#11ff99] text-black"
            : state === "wrong"
            ? "bg-[#ff2047] text-white"
            : "bg-[#11ff99]/20 text-[#11ff99]"
        }`}
      >
        {letters[index]}
      </span>
      <span className="flex-1 leading-snug">{text}</span>
    </motion.button>
  );
}
