import type { Difficulty } from "@/types";

interface DifficultyDistribution {
  easy: number;
  medium: number;
  hard: number;
}

/**
 * Dynamic difficulty based on last 20 questions accuracy.
 * >75% correct  → more hard questions
 * 50-75% correct → balanced
 * <50% correct  → more easy questions
 */
export function getDifficultyDistribution(
  recentAccuracy: number
): DifficultyDistribution {
  if (recentAccuracy > 0.75) {
    return { easy: 2, medium: 3, hard: 5 };
  } else if (recentAccuracy >= 0.5) {
    return { easy: 3, medium: 4, hard: 3 };
  } else {
    return { easy: 5, medium: 3, hard: 2 };
  }
}

export function pickDifficulty(distribution: DifficultyDistribution): Difficulty {
  const total = distribution.easy + distribution.medium + distribution.hard;
  const rand = Math.random() * total;

  if (rand < distribution.easy) return "easy";
  if (rand < distribution.easy + distribution.medium) return "medium";
  return "hard";
}

export function getRecentAccuracy(
  answers: Array<{ is_correct: boolean }>
): number {
  if (answers.length === 0) return 0.6; // default to balanced
  const recent = answers.slice(-20);
  const correct = recent.filter((a) => a.is_correct).length;
  return correct / recent.length;
}
