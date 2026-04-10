export type Difficulty = "easy" | "medium" | "hard";
export type Category = "historical" | "player" | "team" | "tournament" | "live" | "world_cup" | "champions_league" | "nations";
export type MatchStatus = "scheduled" | "live" | "finished";
export type Language = "en" | "es" | "fr" | "de" | "pt";

export interface Profile {
  id: string;
  username: string | null;
  country: string | null;
  preferred_language: Language;
  total_points: number;
  lives: number;
  last_life_regen: string;
  created_at: string;
}

export interface Question {
  id: string;
  match_id: string | null;
  category: Category;
  difficulty: Difficulty;
  question_text: string;
  options: string[];
  correct_answer_index: number;
  explanation: string | null;
  language: Language;
  created_at: string;
}

export interface UserAnswer {
  id: string;
  user_id: string;
  question_id: string;
  is_correct: boolean;
  time_taken: number;
  points_earned: number;
  answered_at: string;
}

export interface Match {
  id: string;
  home_team: string;
  away_team: string;
  home_team_crest?: string;
  away_team_crest?: string;
  status: MatchStatus;
  kickoff_time: string;
  venue: string | null;
  current_score: string | null;
  league?: string | null;
  active_gurus?: number;
}

export interface League {
  id: string;
  name: string;
  code: string;
  created_by: string;
  created_at: string;
}

export interface LeagueWithMembers extends League {
  member_count: number;
  members?: LeagueMember[];
}

export interface LeagueMember {
  league_id: string;
  user_id: string;
  joined_at: string;
  profile?: Profile;
}

export interface LeaderboardEntry {
  user_id: string;
  username: string | null;
  country: string | null;
  total_points: number;
  global_rank: number;
  country_rank: number;
}

// Game session state
export interface GameSession {
  matchId: string | null;
  questions: Question[];
  currentIndex: number;
  answers: AnsweredQuestion[];
  lives: number;
  totalPoints: number;
  streak: number;
  startedAt: number;
}

export interface AnsweredQuestion {
  questionId: string;
  selectedIndex: number | null; // null = timeout
  isCorrect: boolean;
  timeTaken: number;
  pointsEarned: number;
}

export interface GameResult {
  totalPoints: number;
  correctCount: number;
  totalQuestions: number;
  accuracy: number;
  bestStreak: number;
  livesLost: number;
}

// Speed bonus thresholds (seconds)
export const SPEED_BONUS = {
  FAST: { maxSeconds: 4, multiplier: 1.5 },
  MEDIUM: { maxSeconds: 8, multiplier: 1.25 },
  SLOW: { maxSeconds: 12, multiplier: 1.0 },
} as const;

export const STREAK_BONUSES: Record<number, number> = {
  5: 100,
  10: 250,
};

export const POINTS_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

export const QUESTION_TIME_LIMIT = 12; // seconds
export const QUESTIONS_PER_SET = 10;
export const MAX_LIVES = 3;
export const LIFE_REGEN_HOURS = 4;
