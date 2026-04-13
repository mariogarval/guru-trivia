import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { store } from "../store/matchStore";
import { espnClient } from "../clients/espnClient";
import { normalizeMatchData } from "../engines/matchNormalizer";
import { maybeGeneratePrediction } from "../engines/predictionEngine";
import { resolveActivePredictions } from "../engines/resolutionEngine";
import { scoreAnswer, getSortedLeaderboard } from "../engines/scoringEngine";
import {
  addSimulatedEvent,
  applyScenario,
  initSimulation,
  advanceMinute,
  SCENARIOS,
} from "../engines/simulationEngine";
import { config } from "../config";
import { logger } from "../utils/logger";
import { MatchEvent, MatchEventType, TeamSide, UserAnswer } from "../types";

const router = Router();

// ─── GET /api/match/:id/state ─────────────────────────────────────────────────

router.get("/:id/state", (req: Request, res: Response) => {
  const state = store.getMatchState(req.params.id);
  if (!state) {
    return res
      .status(404)
      .json({ error: "Match not found. POST to /tick or /simulate-event first." });
  }
  return res.json(state);
});

// ─── GET /api/match/:id/predictions/active ────────────────────────────────────

router.get("/:id/predictions/active", (req: Request, res: Response) => {
  const active = store.getActivePredictions(req.params.id);
  return res.json({ predictions: active, count: active.length });
});

// ─── GET /api/match/:id/predictions ───────────────────────────────────────────

router.get("/:id/predictions", (req: Request, res: Response) => {
  const all = store.getAllPredictions(req.params.id);
  return res.json({ predictions: all, count: all.length });
});

// ─── POST /api/match/:id/predictions/:predictionId/answer ─────────────────────

router.post(
  "/:id/predictions/:predictionId/answer",
  (req: Request, res: Response) => {
    const { id, predictionId } = req.params;
    const { userId, optionId } = req.body as {
      userId?: string;
      optionId?: string;
    };

    if (!userId || !optionId) {
      return res
        .status(400)
        .json({ error: "userId and optionId are required" });
    }

    const prediction = store.getPrediction(id, predictionId);
    if (!prediction) {
      return res.status(404).json({ error: "Prediction not found" });
    }

    if (prediction.status !== "active") {
      return res.status(409).json({
        error: `Prediction is ${prediction.status} — cannot accept new answers`,
      });
    }

    if (!prediction.options.find((o) => o.id === optionId)) {
      return res.status(400).json({
        error: `Invalid optionId. Valid options: ${prediction.options
          .map((o) => `"${o.id}" (${o.label})`)
          .join(", ")}`,
      });
    }

    if (store.hasAnswer(userId, predictionId)) {
      return res
        .status(409)
        .json({ error: "User already answered this prediction" });
    }

    const answer: UserAnswer = {
      id: uuidv4(),
      userId,
      predictionId,
      optionId,
      answeredAt: new Date().toISOString(),
    };
    store.addAnswer(answer);
    logger.info(`Answer: user=${userId} prediction=${predictionId} option=${optionId}`);

    return res.status(201).json({ message: "Answer recorded", answer });
  }
);

// ─── GET /api/match/:id/leaderboard ──────────────────────────────────────────

router.get("/:id/leaderboard", (req: Request, res: Response) => {
  const lb = store.getLeaderboard(req.params.id);
  return res.json({ leaderboard: getSortedLeaderboard(lb) });
});

// ─── POST /api/match/:id/tick ─────────────────────────────────────────────────
// One engine cycle: fetch → normalize → resolve → score → generate

router.post("/:id/tick", async (req: Request, res: Response) => {
  const { id } = req.params;
  const log: string[] = [];

  try {
    let state = store.getMatchState(id);

    if (config.useMocks) {
      if (!state) {
        state = initSimulation(id);
        log.push("Initialized mock match state");
      } else {
        // Advance by 1 minute each tick in mock mode so state evolves
        state = advanceMinute(id, state.minute + 1);
        log.push(`Tick: advanced to minute ${state.minute}`);
      }
    } else {
      const raw = await espnClient.fetchMatch(id);
      if (!raw) {
        return res
          .status(503)
          .json({ error: "ESPN API unavailable", log });
      }
      state = normalizeMatchData(raw, id);
      store.setMatchState(state);
      log.push(`Fetched ESPN data (status=${state.status}, min=${state.minute})`);
    }

    // Track new events to inform resolution
    const allEventIds = state.recentEvents.map((e) => e.id);
    const newEventIds = store.markEventsSeen(id, allEventIds);
    log.push(`New events: ${newEventIds.size}`);

    // Resolve active/locked predictions
    const activePreds = store.getActivePredictions(id);
    if (activePreds.length > 0) {
      const resolved = resolveActivePredictions(activePreds, state);
      for (const p of resolved) {
        store.updatePrediction(p);
      }

      // Score only newly-resolved predictions (deduped)
      const nowResolved = resolved.filter((p) => p.status === "resolved");
      for (const p of nowResolved) {
        if (store.hasScoredPrediction(p.id)) continue;
        const answers = store.getAnswers(p.id);
        const lb = store.getLeaderboard(id);
        for (const answer of answers) {
          scoreAnswer(answer, p, lb);
        }
        store.markPredictionScored(p.id);
        log.push(
          `Resolved & scored prediction ${p.id} (${p.templateType}): result=${p.resultOptionId}`
        );
      }
    }

    // Maybe generate a new prediction
    const newPrediction = maybeGeneratePrediction(state, store.getLastGeneratedAt(id));
    if (newPrediction) {
      store.addPrediction(newPrediction);
      log.push(
        `Generated: "${newPrediction.text}" [${newPrediction.templateType}] confidence=${newPrediction.confidence.toFixed(2)}`
      );
    }

    return res.json({
      matchId: id,
      minute: state.minute,
      status: state.status,
      score: `${state.homeTeam.shortName} ${state.homeTeam.score}–${state.awayTeam.score} ${state.awayTeam.shortName}`,
      newEvents: newEventIds.size,
      activePredictions: store.getActivePredictions(id).length,
      log,
    });
  } catch (err) {
    logger.error(`Tick error for match ${id}: ${err}`);
    return res.status(500).json({ error: "Tick failed", log });
  }
});

// ─── POST /api/match/:id/simulate-event ──────────────────────────────────────

const VALID_EVENT_TYPES: MatchEventType[] = [
  "shot",
  "shot_on_target",
  "corner",
  "foul",
  "yellow_card",
  "red_card",
  "goal",
  "substitution",
  "period_start",
  "period_end",
  "other",
];

router.post("/:id/simulate-event", (req: Request, res: Response) => {
  const { id } = req.params;
  const { type, teamSide, minute, playerName } = req.body as {
    type?: string;
    teamSide?: string;
    minute?: number;
    playerName?: string;
  };

  if (!type) {
    return res.status(400).json({
      error: "type is required",
      validTypes: VALID_EVENT_TYPES,
    });
  }
  if (!VALID_EVENT_TYPES.includes(type as MatchEventType)) {
    return res.status(400).json({
      error: `Invalid type "${type}"`,
      validTypes: VALID_EVENT_TYPES,
    });
  }

  if (!store.getMatchState(id)) {
    initSimulation(id);
  }

  const currentMinute = store.getMatchState(id)?.minute ?? 1;
  const event: MatchEvent = {
    id: uuidv4(),
    type: type as MatchEventType,
    teamSide: teamSide as TeamSide | undefined,
    minute: typeof minute === "number" ? minute : currentMinute,
    timestamp: new Date().toISOString(),
    playerName,
  };

  const updated = addSimulatedEvent(id, event);
  return res.json({ event, matchState: updated });
});

// ─── POST /api/match/:id/simulate-scenario ────────────────────────────────────

router.post("/:id/simulate-scenario", (req: Request, res: Response) => {
  const { id } = req.params;
  const { scenario } = req.body as { scenario?: string };

  if (!scenario) {
    return res.status(400).json({
      error: "scenario is required",
      available: Object.keys(SCENARIOS),
    });
  }

  if (!store.getMatchState(id)) {
    initSimulation(id);
  }

  const result = applyScenario(id, scenario);
  if (!result) {
    return res.status(404).json({
      error: `Scenario "${scenario}" not found`,
      available: Object.keys(SCENARIOS),
    });
  }

  logger.info(`Applied scenario "${scenario}" (${result.applied} events) to match ${id}`);

  return res.json({
    matchId: id,
    applied: result.applied,
    scenarioName: result.scenario.name,
    description: result.scenario.description,
    matchState: store.getMatchState(id),
  });
});

// ─── GET /api/match/:id/scenarios ────────────────────────────────────────────

router.get("/:id/scenarios", (_req: Request, res: Response) => {
  return res.json({
    scenarios: Object.entries(SCENARIOS).map(([key, s]) => ({
      key,
      name: s.name,
      description: s.description,
      eventCount: s.events.length,
    })),
  });
});

export default router;
