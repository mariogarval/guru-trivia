import { MatchEvent, NormalizedMatchState, Prediction } from "../types";
import { logger } from "../utils/logger";

type ResolutionResult = {
  resultOptionId: string;
  resultReason: string;
};

// Events that happened after the prediction was created
function eventsAfter(state: NormalizedMatchState, createdAt: string): MatchEvent[] {
  const created = new Date(createdAt).getTime();
  return state.recentEvents.filter(
    (e) => new Date(e.timestamp).getTime() > created
  );
}

// ─── Per-type resolvers ───────────────────────────────────────────────────────

function resolveShot(
  prediction: Prediction,
  post: MatchEvent[]
): ResolutionResult | null {
  const shot = post.find(
    (e) => e.type === "shot" || e.type === "shot_on_target"
  );
  if (shot) {
    return {
      resultOptionId: "yes",
      resultReason: `Shot by ${shot.teamSide ?? "unknown"} at min ${shot.minute}`,
    };
  }
  if (Date.now() > new Date(prediction.resolveBy).getTime()) {
    return { resultOptionId: "no", resultReason: "No shot before window closed" };
  }
  return null;
}

function resolveCorner(
  prediction: Prediction,
  post: MatchEvent[]
): ResolutionResult | null {
  const corner = post.find((e) => e.type === "corner");
  if (corner) {
    const optionId = corner.teamSide === "home" ? "home" : "away";
    return {
      resultOptionId: optionId,
      resultReason: `Corner by ${corner.teamSide ?? "unknown"} at min ${corner.minute}`,
    };
  }
  if (Date.now() > new Date(prediction.resolveBy).getTime()) {
    return {
      resultOptionId: "no_corner",
      resultReason: "No corner in 3-minute window",
    };
  }
  return null;
}

function resolveFoul(
  prediction: Prediction,
  post: MatchEvent[]
): ResolutionResult | null {
  const foul = post.find((e) => e.type === "foul");
  if (foul) {
    return {
      resultOptionId: "yes",
      resultReason: `Foul at min ${foul.minute}`,
    };
  }
  if (Date.now() > new Date(prediction.resolveBy).getTime()) {
    return {
      resultOptionId: "no",
      resultReason: "No foul in 60-second window",
    };
  }
  return null;
}

function resolveYellowCard(
  prediction: Prediction,
  post: MatchEvent[]
): ResolutionResult | null {
  const card = post.find((e) => e.type === "yellow_card");
  if (card) {
    const optionId = card.teamSide === "home" ? "home" : "away";
    return {
      resultOptionId: optionId,
      resultReason: `Yellow card to ${card.teamSide ?? "unknown"} at min ${card.minute}`,
    };
  }
  if (Date.now() > new Date(prediction.resolveBy).getTime()) {
    return {
      resultOptionId: "no_card",
      resultReason: "No yellow card in 5-minute window",
    };
  }
  return null;
}

const RESOLVERS: Record<
  string,
  (p: Prediction, events: MatchEvent[]) => ResolutionResult | null
> = {
  shot_next_2m: resolveShot,
  next_corner_team: resolveCorner,
  foul_next_60s: resolveFoul,
  next_yellow_team: resolveYellowCard,
};

// ─── Public ───────────────────────────────────────────────────────────────────

export function resolveActivePredictions(
  predictions: Prediction[],
  state: NormalizedMatchState
): Prediction[] {
  const now = new Date();

  return predictions.map((prediction) => {
    if (prediction.status !== "active" && prediction.status !== "locked") {
      return prediction;
    }

    // Transition active → locked when lockAt passes
    let p = prediction;
    if (p.status === "active" && now > new Date(p.lockAt)) {
      p = { ...p, status: "locked" };
    }

    const resolver = RESOLVERS[p.templateType];
    if (!resolver) {
      logger.warn(`No resolver for templateType=${p.templateType}`);
      return { ...p, status: "canceled", resultReason: "No resolver registered" };
    }

    // Only consider events that occurred after this prediction was created
    const post = eventsAfter(state, p.createdAt);
    const result = resolver(p, post);

    if (result) {
      logger.info(
        `Resolved ${p.id} (${p.templateType}): ${result.resultOptionId} — ${result.resultReason}`
      );
      return {
        ...p,
        status: "resolved",
        resultOptionId: result.resultOptionId,
        resultReason: result.resultReason,
      };
    }

    // Grace period: expire if well past resolveBy and nothing resolved
    if (now > new Date(new Date(p.resolveBy).getTime() + 30_000)) {
      logger.debug(`Expiring ${p.id} (past grace period)`);
      return {
        ...p,
        status: "expired",
        resultReason: "No resolution event within window",
      };
    }

    return p;
  });
}
