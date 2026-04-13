import { LeaderboardEntry, Prediction, UserAnswer } from "../types";

const BASE_POINTS = 10;

// streak=0 → ×1, streak=1 → ×1, streak=2 → ×1.5, streak=3 → ×2, streak=4 → ×2.5, streak≥5 → ×3
const STREAK_MULTIPLIERS = [1, 1, 1.5, 2, 2.5, 3];

function getStreakMultiplier(streak: number): number {
  return STREAK_MULTIPLIERS[Math.min(streak, STREAK_MULTIPLIERS.length - 1)] ?? 1;
}

export function scoreAnswer(
  answer: UserAnswer,
  prediction: Prediction,
  leaderboard: Map<string, LeaderboardEntry>
): { points: number; correct: boolean } {
  const existing = leaderboard.get(answer.userId) ?? {
    userId: answer.userId,
    points: 0,
    correct: 0,
    incorrect: 0,
    streak: 0,
  };

  const correct = prediction.resultOptionId === answer.optionId;

  if (correct) {
    const multiplier = getStreakMultiplier(existing.streak);
    const points = Math.round(BASE_POINTS * multiplier);
    leaderboard.set(answer.userId, {
      ...existing,
      points: existing.points + points,
      correct: existing.correct + 1,
      streak: existing.streak + 1,
    });
    return { points, correct: true };
  }

  // Wrong answer: no points, streak resets
  leaderboard.set(answer.userId, {
    ...existing,
    incorrect: existing.incorrect + 1,
    streak: 0,
  });
  return { points: 0, correct: false };
}

export function getSortedLeaderboard(
  leaderboard: Map<string, LeaderboardEntry>
): LeaderboardEntry[] {
  return Array.from(leaderboard.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.correct - a.correct;
  });
}
