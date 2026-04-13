import {
  LeaderboardEntry,
  NormalizedMatchState,
  Prediction,
  UserAnswer,
} from "../types";

// In-memory store. Isolated behind this class so it can be replaced with
// Redis or Postgres later without touching any engine or route code.
class MatchStore {
  private matchStates = new Map<string, NormalizedMatchState>();
  private predictions = new Map<string, Prediction[]>(); // matchId → Prediction[]
  private answers = new Map<string, UserAnswer[]>(); // predictionId → UserAnswer[]
  private leaderboards = new Map<string, Map<string, LeaderboardEntry>>(); // matchId → userId → entry
  private lastGeneratedAt = new Map<string, number>(); // matchId → epoch ms
  private seenEventIds = new Map<string, Set<string>>(); // matchId → eventId set
  private scoredPredictionIds = new Set<string>(); // global, predictions are unique

  // ─── Match State ────────────────────────────────────────────────────────────

  setMatchState(state: NormalizedMatchState): void {
    this.matchStates.set(state.matchId, state);
  }

  getMatchState(matchId: string): NormalizedMatchState | undefined {
    return this.matchStates.get(matchId);
  }

  // ─── Predictions ────────────────────────────────────────────────────────────

  addPrediction(prediction: Prediction): void {
    const list = this.predictions.get(prediction.matchId) ?? [];
    list.push(prediction);
    this.predictions.set(prediction.matchId, list);
    this.lastGeneratedAt.set(prediction.matchId, Date.now());
  }

  updatePrediction(prediction: Prediction): void {
    const list = this.predictions.get(prediction.matchId);
    if (!list) return;
    const idx = list.findIndex((p) => p.id === prediction.id);
    if (idx >= 0) list[idx] = prediction;
  }

  getActivePredictions(matchId: string): Prediction[] {
    return (this.predictions.get(matchId) ?? []).filter(
      (p) => p.status === "active" || p.status === "locked"
    );
  }

  getAllPredictions(matchId: string): Prediction[] {
    return this.predictions.get(matchId) ?? [];
  }

  getPrediction(matchId: string, predictionId: string): Prediction | undefined {
    return this.getAllPredictions(matchId).find((p) => p.id === predictionId);
  }

  getLastGeneratedAt(matchId: string): number | null {
    return this.lastGeneratedAt.get(matchId) ?? null;
  }

  // ─── Answers ────────────────────────────────────────────────────────────────

  addAnswer(answer: UserAnswer): void {
    const list = this.answers.get(answer.predictionId) ?? [];
    list.push(answer);
    this.answers.set(answer.predictionId, list);
  }

  getAnswers(predictionId: string): UserAnswer[] {
    return this.answers.get(predictionId) ?? [];
  }

  hasAnswer(userId: string, predictionId: string): boolean {
    return this.getAnswers(predictionId).some((a) => a.userId === userId);
  }

  // ─── Leaderboard ────────────────────────────────────────────────────────────

  getLeaderboard(matchId: string): Map<string, LeaderboardEntry> {
    if (!this.leaderboards.has(matchId)) {
      this.leaderboards.set(matchId, new Map());
    }
    return this.leaderboards.get(matchId)!;
  }

  // ─── Event tracking (detect new events per tick) ────────────────────────────

  markEventsSeen(matchId: string, ids: string[]): Set<string> {
    if (!this.seenEventIds.has(matchId)) {
      this.seenEventIds.set(matchId, new Set());
    }
    const seen = this.seenEventIds.get(matchId)!;
    const newIds = new Set<string>();
    for (const id of ids) {
      if (!seen.has(id)) {
        newIds.add(id);
        seen.add(id);
      }
    }
    return newIds;
  }

  // ─── Scoring dedup ──────────────────────────────────────────────────────────

  hasScoredPrediction(predictionId: string): boolean {
    return this.scoredPredictionIds.has(predictionId);
  }

  markPredictionScored(predictionId: string): void {
    this.scoredPredictionIds.add(predictionId);
  }
}

export const store = new MatchStore();
