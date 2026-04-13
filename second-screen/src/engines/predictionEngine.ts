import { v4 as uuidv4 } from "uuid";
import {
  MatchIntensity,
  NormalizedMatchState,
  Prediction,
  PredictionOption,
  PredictionTemplateType,
} from "../types";
import { store } from "../store/matchStore";
import { logger } from "../utils/logger";

// Minimum ms between generated predictions per intensity level
const MIN_CADENCE_MS: Record<MatchIntensity, number> = {
  high: 45_000,
  medium: 60_000,
  low: 90_000,
};

const MAX_ACTIVE_PREDICTIONS = 2;
const RECENT_WINDOW_MINUTES = 5;

// ─── Intensity ───────────────────────────────────────────────────────────────

export function calculateIntensity(state: NormalizedMatchState): MatchIntensity {
  const cutoff = state.minute - RECENT_WINDOW_MINUTES;
  const recent = state.recentEvents.filter((e) => e.minute >= cutoff);

  let score = 0;
  for (const e of recent) {
    switch (e.type) {
      case "shot_on_target": score += 3; break;
      case "shot":           score += 2; break;
      case "goal":           score += 2; break;
      case "corner":         score += 1.5; break;
      case "yellow_card":    score += 2; break;
      case "red_card":       score += 3; break;
      case "foul":           score += 1; break;
    }
  }

  if (score >= 8) return "high";
  if (score >= 3) return "medium";
  return "low";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const nowMs = () => Date.now();
const nowIso = () => new Date().toISOString();
const addMs = (ms: number) => new Date(Date.now() + ms).toISOString();

function recentEventIds(state: NormalizedMatchState, withinMinutes: number): string[] {
  const cutoff = state.minute - withinMinutes;
  return state.recentEvents.filter((e) => e.minute >= cutoff).map((e) => e.id);
}

function hasActiveType(active: Prediction[], type: PredictionTemplateType): boolean {
  return active.some((p) => p.templateType === type);
}

// ─── Question builders ───────────────────────────────────────────────────────

function buildShotQuestion(
  state: NormalizedMatchState,
  intensity: MatchIntensity
): Prediction | null {
  const recentShots = state.recentEvents.filter(
    (e) =>
      (e.type === "shot" || e.type === "shot_on_target") &&
      e.minute >= state.minute - 3
  );
  const confidence =
    0.4 + recentShots.length * 0.15 + (intensity === "high" ? 0.2 : 0);
  if (confidence < 0.45) return null;

  const options: PredictionOption[] = [
    { id: "yes", label: "Yes" },
    { id: "no", label: "No" },
  ];

  return {
    id: uuidv4(),
    matchId: state.matchId,
    templateType: "shot_next_2m",
    text: "Will there be a shot in the next 2 minutes?",
    options,
    createdAt: nowIso(),
    lockAt: addMs(30_000),
    resolveBy: addMs(2 * 60_000),
    status: "active",
    confidence: Math.min(confidence, 1),
    generationReason: `${recentShots.length} shot(s) in last 3 min; intensity=${intensity}`,
    basedOnEventIds: recentEventIds(state, 3),
  };
}

function buildCornerQuestion(
  state: NormalizedMatchState,
  intensity: MatchIntensity
): Prediction | null {
  const recentCorners = state.recentEvents.filter(
    (e) => e.type === "corner" && e.minute >= state.minute - 5
  );
  const recentPressure = state.recentEvents.filter(
    (e) =>
      (e.type === "shot" || e.type === "shot_on_target" || e.type === "corner") &&
      e.minute >= state.minute - 3
  ).length;

  const confidence =
    0.35 + recentCorners.length * 0.1 + recentPressure * 0.08;
  if (confidence < 0.4) return null;

  const options: PredictionOption[] = [
    { id: "home", label: state.homeTeam.shortName },
    { id: "away", label: state.awayTeam.shortName },
    { id: "no_corner", label: "No corner in next 3 min" },
  ];

  return {
    id: uuidv4(),
    matchId: state.matchId,
    templateType: "next_corner_team",
    text: "Which team will take the next corner?",
    options,
    createdAt: nowIso(),
    lockAt: addMs(30_000),
    resolveBy: addMs(3 * 60_000),
    status: "active",
    confidence: Math.min(confidence, 1),
    generationReason: `${recentCorners.length} corner(s) in last 5 min; pressure=${recentPressure}`,
    basedOnEventIds: recentEventIds(state, 5),
  };
}

function buildFoulQuestion(
  state: NormalizedMatchState,
  intensity: MatchIntensity
): Prediction | null {
  const recentFouls = state.recentEvents.filter(
    (e) => e.type === "foul" && e.minute >= state.minute - 5
  );
  const confidence =
    0.3 + recentFouls.length * 0.12 + (intensity !== "low" ? 0.1 : 0);
  if (confidence < 0.4) return null;

  const options: PredictionOption[] = [
    { id: "yes", label: "Yes" },
    { id: "no", label: "No" },
  ];

  return {
    id: uuidv4(),
    matchId: state.matchId,
    templateType: "foul_next_60s",
    text: "Will there be a foul in the next 60 seconds?",
    options,
    createdAt: nowIso(),
    lockAt: addMs(20_000),
    resolveBy: addMs(60_000),
    status: "active",
    confidence: Math.min(confidence, 1),
    generationReason: `${recentFouls.length} foul(s) in last 5 min; intensity=${intensity}`,
    basedOnEventIds: recentEventIds(state, 5),
  };
}

function buildYellowCardQuestion(
  state: NormalizedMatchState,
  intensity: MatchIntensity
): Prediction | null {
  const recentFouls = state.recentEvents.filter(
    (e) => e.type === "foul" && e.minute >= state.minute - 5
  );
  const recentCards = state.recentEvents.filter(
    (e) => e.type === "yellow_card" && e.minute >= state.minute - 10
  );
  const confidence =
    0.3 + recentFouls.length * 0.08 + recentCards.length * 0.12;
  if (confidence < 0.35) return null;

  const options: PredictionOption[] = [
    { id: "home", label: state.homeTeam.shortName },
    { id: "away", label: state.awayTeam.shortName },
    { id: "no_card", label: "No yellow card in next 5 min" },
  ];

  return {
    id: uuidv4(),
    matchId: state.matchId,
    templateType: "next_yellow_team",
    text: "Which team gets the next yellow card?",
    options,
    createdAt: nowIso(),
    lockAt: addMs(30_000),
    resolveBy: addMs(5 * 60_000),
    status: "active",
    confidence: Math.min(confidence, 1),
    generationReason: `${recentFouls.length} foul(s), ${recentCards.length} card(s) recently; intensity=${intensity}`,
    basedOnEventIds: recentEventIds(state, 10),
  };
}

type Builder = (state: NormalizedMatchState, intensity: MatchIntensity) => Prediction | null;

// ─── Question selection ───────────────────────────────────────────────────────
// Selects the best question type based on what's happening in the match.
// Weighted by recency of relevant event types; avoids duplicating active types.

function selectBuilder(
  state: NormalizedMatchState,
  intensity: MatchIntensity,
  active: Prediction[]
): Builder | null {
  const cutoff = state.minute - 3;
  const recent = state.recentEvents.filter((e) => e.minute >= cutoff);
  const recentTypes = new Set(recent.map((e) => e.type));

  const scored: Array<{ type: PredictionTemplateType; builder: Builder; weight: number }> = [
    {
      type: "shot_next_2m",
      builder: buildShotQuestion,
      weight:
        recentTypes.has("shot") || recentTypes.has("shot_on_target") ? 3 : 1,
    },
    {
      type: "next_corner_team",
      builder: buildCornerQuestion,
      weight: recentTypes.has("corner") ? 3 : 1,
    },
    {
      type: "foul_next_60s",
      builder: buildFoulQuestion,
      weight: recentTypes.has("foul") ? 2 : 1,
    },
    {
      type: "next_yellow_team",
      builder: buildYellowCardQuestion,
      weight:
        recentTypes.has("yellow_card") || recentTypes.has("foul") ? 2 : 0.5,
    },
  ];

  // Filter out types that are already active
  const available = scored.filter((c) => !hasActiveType(active, c.type));
  if (available.length === 0) return null;

  available.sort((a, b) => b.weight - a.weight);
  return available[0]!.builder;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function maybeGeneratePrediction(
  state: NormalizedMatchState,
  lastGeneratedAt: number | null
): Prediction | null {
  // Only generate during live play
  if (state.status !== "live") return null;

  const active = store.getActivePredictions(state.matchId);
  if (active.length >= MAX_ACTIVE_PREDICTIONS) return null;

  const intensity = calculateIntensity(state);
  const minCadence = MIN_CADENCE_MS[intensity];
  if (lastGeneratedAt && nowMs() - lastGeneratedAt < minCadence) return null;

  const builder = selectBuilder(state, intensity, active);
  if (!builder) return null;

  const prediction = builder(state, intensity);
  if (!prediction) {
    logger.debug("Prediction builder returned null (confidence too low)");
    return null;
  }

  return prediction;
}
