import { v4 as uuidv4 } from "uuid";
import { MatchEvent, MatchEventType, NormalizedMatchState, TeamSide } from "../types";
import { store } from "../store/matchStore";
import { SCENARIOS, Scenario } from "../mocks/scenarios";

// Atletico Madrid is HOME, Barcelona is AWAY for this fixture
const BASE_STATE: Omit<NormalizedMatchState, "matchId" | "lastUpdatedAt"> = {
  competition: "La Liga",
  status: "live",
  minute: 1,
  period: 1,
  homeTeam: {
    id: "atletico-madrid",
    name: "Atletico Madrid",
    shortName: "ATL",
    score: 0,
  },
  awayTeam: {
    id: "barcelona",
    name: "Barcelona",
    shortName: "BAR",
    score: 0,
  },
  stats: {
    homeCorners: 0,
    awayCorners: 0,
    homeShots: 0,
    awayShots: 0,
    homeYellowCards: 0,
    awayYellowCards: 0,
    possessionHome: 50,
    possessionAway: 50,
  },
  recentEvents: [],
};

export function initSimulation(matchId: string): NormalizedMatchState {
  const state: NormalizedMatchState = {
    ...BASE_STATE,
    matchId,
    lastUpdatedAt: new Date().toISOString(),
  };
  store.setMatchState(state);
  return state;
}

export function addSimulatedEvent(matchId: string, event: MatchEvent): NormalizedMatchState {
  const current = store.getMatchState(matchId) ?? initSimulation(matchId);

  // Update running stats derived from event type
  const stats = { ...current.stats };
  if (event.type === "corner") {
    if (event.teamSide === "home") stats.homeCorners = (stats.homeCorners ?? 0) + 1;
    else stats.awayCorners = (stats.awayCorners ?? 0) + 1;
  }
  if (event.type === "shot" || event.type === "shot_on_target") {
    if (event.teamSide === "home") stats.homeShots = (stats.homeShots ?? 0) + 1;
    else stats.awayShots = (stats.awayShots ?? 0) + 1;
  }
  if (event.type === "yellow_card") {
    if (event.teamSide === "home") stats.homeYellowCards = (stats.homeYellowCards ?? 0) + 1;
    else stats.awayYellowCards = (stats.awayYellowCards ?? 0) + 1;
  }

  const homeScore =
    event.type === "goal" && event.teamSide === "home"
      ? current.homeTeam.score + 1
      : current.homeTeam.score;
  const awayScore =
    event.type === "goal" && event.teamSide === "away"
      ? current.awayTeam.score + 1
      : current.awayTeam.score;

  const recentEvents = [...current.recentEvents, event].slice(-50);

  const updated: NormalizedMatchState = {
    ...current,
    minute: Math.max(current.minute, event.minute),
    period: event.minute > 45 ? 2 : current.period,
    recentEvents,
    stats,
    homeTeam: { ...current.homeTeam, score: homeScore },
    awayTeam: { ...current.awayTeam, score: awayScore },
    lastUpdatedAt: new Date().toISOString(),
  };

  store.setMatchState(updated);
  return updated;
}

export function advanceMinute(matchId: string, toMinute: number): NormalizedMatchState {
  const current = store.getMatchState(matchId) ?? initSimulation(matchId);
  const updated: NormalizedMatchState = {
    ...current,
    minute: toMinute,
    period: toMinute > 45 ? 2 : 1,
    status: toMinute >= 45 && toMinute <= 46 ? "halftime" : "live",
    lastUpdatedAt: new Date().toISOString(),
  };
  store.setMatchState(updated);
  return updated;
}

function makeEvent(
  type: MatchEventType,
  teamSide: TeamSide,
  minute: number,
  playerName?: string
): MatchEvent {
  return {
    id: uuidv4(),
    type,
    teamSide,
    minute,
    timestamp: new Date().toISOString(),
    playerName,
  };
}

export function applyScenario(
  matchId: string,
  scenarioKey: string
): { applied: number; scenario: Scenario } | null {
  const scenario = SCENARIOS[scenarioKey];
  if (!scenario) return null;

  const current = store.getMatchState(matchId) ?? initSimulation(matchId);
  const baseMinute = current.minute;

  for (const se of scenario.events) {
    const event = makeEvent(
      se.type,
      se.teamSide,
      baseMinute + se.minuteOffset,
      se.playerName
    );
    addSimulatedEvent(matchId, event);
  }

  return { applied: scenario.events.length, scenario };
}

export { SCENARIOS };
