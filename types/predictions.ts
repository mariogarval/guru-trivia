// ── Match Prediction Types ────────────────────────────────────────────────────
// Used by the /predict/[matchId] feature (pre-game + halftime prediction flow)

export type PredictionPhase = "pregame" | "live_first_half" | "halftime" | "live_second_half" | "fulltime";
export type PredictionHalf = "first_half" | "second_half";
export type ResolutionStatus = "pending" | "correct" | "incorrect" | "void";

export interface PredictionOption {
  id: string;       // e.g. "yes", "no", "home", "away", "draw"
  label: string;    // Display text, e.g. "Yes", "Barcelona"
  votes: number;    // Simulated community vote count
}

export interface MatchPrediction {
  id: string;
  half: PredictionHalf;
  question: string;           // e.g. "Will Lamine Yamal score in the first half?"
  options: PredictionOption[];
  context?: string;           // Optional context hint, e.g. "Yamal has scored in 4 of last 5 home games"
  resolutionHint: string;     // Machine-readable hint for future auto-resolution
  // User state (stored locally)
  userAnswer?: string;        // option id the user picked
  resolution?: ResolutionStatus;
  pointsEarned?: number;
}

export interface PredictionSession {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  predictions: MatchPrediction[];    // first_half + second_half
  firstHalfLockedAt?: number;        // epoch ms
  halftimeScore?: { home: number; away: number };
  totalPoints: number;
  correctCount: number;
  createdAt: number;
}

/** Shape returned by /api/matches/live-score */
export interface LiveScoreData {
  status: "scheduled" | "live" | "finished";
  home_score: string;
  away_score: string;
  clock: string;          // e.g. "67:23"
  period: number;         // 1 or 2
  statusDetail: string;   // e.g. "67' - 2nd Half", "Half Time", "Full Time"
  home_team: string;
  away_team: string;
}

/** Simulated leaderboard entry for halftime screen */
export interface SimulatedRanker {
  rank: number;
  username: string;
  avatar: string;         // emoji
  points: number;
  correct: number;
  isYou?: boolean;
}

/**
 * A single real-time prediction shown during live match play.
 * Options are always ["Yes", "No"] and resolved from score changes.
 */
export interface LivePrediction {
  id: string;
  question: string;
  options: string[];          // e.g. ["Yes", "No"]
  windowSeconds: number;      // how long the user has to answer
  resolutionHint: string;     // "any_goal" | "home_goal" | "away_goal" | "void"
  simulatedVotes: number[];   // % per option, sums to 100
  scoreAtCreation: { home: number; away: number };
  minuteAtCreation: number;
  // Populated after answer / resolution
  userAnswer?: number;           // option index (0 = Yes, 1 = No)
  resolvedCorrectIdx?: number;   // -1 = void/unresolvable
  pointsEarned?: number;
}

/** Resolve a live prediction hint against score delta. Returns correct option index or -1 for void. */
export function resolveHint(
  hint: string,
  scoreAtCreation: { home: number; away: number },
  currentScore: { home: number; away: number }
): number {
  const homeScored = currentScore.home > scoreAtCreation.home;
  const awayScored = currentScore.away > scoreAtCreation.away;
  const anyGoal = homeScored || awayScored;
  // All live predictions use options[0]=Yes, options[1]=No
  switch (hint) {
    case "any_goal":  return anyGoal     ? 0 : 1;
    case "home_goal": return homeScored  ? 0 : 1;
    case "away_goal": return awayScored  ? 0 : 1;
    default:          return -1;
  }
}
