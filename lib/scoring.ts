import {
  SPEED_BONUS,
  STREAK_BONUSES,
  POINTS_BY_DIFFICULTY,
} from "@/types";
import type { Difficulty } from "@/types";

export interface PointsResult {
  base: number;
  multiplier: number;
  speedLabel: "fast" | "medium" | "slow";
  streakBonus: number;
  total: number;
}

export function calculatePoints(
  difficulty: Difficulty,
  timeTaken: number,
  currentStreak: number
): PointsResult {
  const base = POINTS_BY_DIFFICULTY[difficulty];

  let multiplier = SPEED_BONUS.SLOW.multiplier;
  let speedLabel: "fast" | "medium" | "slow" = "slow";

  if (timeTaken < SPEED_BONUS.FAST.maxSeconds) {
    multiplier = SPEED_BONUS.FAST.multiplier;
    speedLabel = "fast";
  } else if (timeTaken < SPEED_BONUS.MEDIUM.maxSeconds) {
    multiplier = SPEED_BONUS.MEDIUM.multiplier;
    speedLabel = "medium";
  }

  // Streak bonus is awarded at exactly 5 and 10
  const streakBonus = STREAK_BONUSES[currentStreak + 1] ?? 0;
  const subtotal = Math.floor(base * multiplier * 100) / 100;
  const total = Math.round(subtotal) + streakBonus;

  return { base, multiplier, speedLabel, streakBonus, total };
}

export function getDifficultyColor(difficulty: Difficulty): string {
  switch (difficulty) {
    case "easy":
      return "text-[#11ff99]";
    case "medium":
      return "text-[#ffc53d]";
    case "hard":
      return "text-[#ff2047]";
  }
}

export function getDifficultyLabel(difficulty: Difficulty): string {
  switch (difficulty) {
    case "easy":
      return "Easy";
    case "medium":
      return "Medium";
    case "hard":
      return "Hard";
  }
}

export function formatPoints(points: PointsResult): string {
  let msg = `+${points.total} pts`;
  if (points.multiplier > 1) {
    msg += ` (${points.multiplier}x speed)`;
  }
  if (points.streakBonus > 0) {
    msg += ` 🔥 +${points.streakBonus} streak!`;
  }
  return msg;
}
