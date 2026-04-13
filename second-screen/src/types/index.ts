export type TeamSide = "home" | "away";

export type MatchEventType =
  | "shot"
  | "shot_on_target"
  | "corner"
  | "foul"
  | "yellow_card"
  | "red_card"
  | "goal"
  | "substitution"
  | "period_start"
  | "period_end"
  | "other";

export type MatchEvent = {
  id: string;
  type: MatchEventType;
  teamSide?: TeamSide;
  minute: number;
  second?: number;
  timestamp: string;
  playerName?: string;
  raw?: unknown;
};

export type NormalizedMatchState = {
  matchId: string;
  competition?: string;
  status: "scheduled" | "live" | "halftime" | "finished" | "paused";
  minute: number;
  period: number;
  homeTeam: {
    id: string;
    name: string;
    shortName: string;
    score: number;
  };
  awayTeam: {
    id: string;
    name: string;
    shortName: string;
    score: number;
  };
  stats: {
    homeCorners?: number;
    awayCorners?: number;
    homeShots?: number;
    awayShots?: number;
    homeYellowCards?: number;
    awayYellowCards?: number;
    possessionHome?: number;
    possessionAway?: number;
  };
  recentEvents: MatchEvent[];
  lastUpdatedAt: string;
};

export type PredictionOption = {
  id: string;
  label: string;
};

export type PredictionTemplateType =
  | "shot_next_2m"
  | "next_corner_team"
  | "foul_next_60s"
  | "next_yellow_team";

export type PredictionStatus =
  | "active"
  | "locked"
  | "resolved"
  | "expired"
  | "canceled";

export type Prediction = {
  id: string;
  matchId: string;
  templateType: PredictionTemplateType;
  text: string;
  options: PredictionOption[];
  createdAt: string;
  lockAt: string;
  resolveBy: string;
  status: PredictionStatus;
  confidence: number;
  generationReason: string;
  basedOnEventIds: string[];
  resultOptionId?: string;
  resultReason?: string;
};

export type UserAnswer = {
  id: string;
  userId: string;
  predictionId: string;
  optionId: string;
  answeredAt: string;
};

export type LeaderboardEntry = {
  userId: string;
  points: number;
  correct: number;
  incorrect: number;
  streak: number;
};

export type MatchIntensity = "low" | "medium" | "high";
