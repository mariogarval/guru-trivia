import { EspnRawMatchData, EspnStatEntry } from "../clients/espnClient";
import {
  MatchEvent,
  MatchEventType,
  NormalizedMatchState,
  TeamSide,
} from "../types";

const ESPN_STATUS_MAP: Record<string, NormalizedMatchState["status"]> = {
  STATUS_SCHEDULED: "scheduled",
  STATUS_IN_PROGRESS: "live",
  STATUS_HALFTIME: "halftime",
  STATUS_FINAL: "finished",
  STATUS_FULL_TIME: "finished",
  STATUS_END_PERIOD: "paused",
  STATUS_POSTPONED: "paused",
};

// ESPN type.text values (lowercased) → internal event type
const ESPN_EVENT_TYPE_MAP: Record<string, MatchEventType> = {
  shot: "shot",
  "shot on goal": "shot_on_target",
  "shot on target": "shot_on_target",
  "shot saved": "shot_on_target",
  "corner kick": "corner",
  corner: "corner",
  foul: "foul",
  "yellow card": "yellow_card",
  "red card": "red_card",
  goal: "goal",
  substitution: "substitution",
  "period start": "period_start",
  "period end": "period_end",
  "kick off": "period_start",
  "final whistle": "period_end",
};

function mapEventType(rawType?: string): MatchEventType {
  if (!rawType) return "other";
  return ESPN_EVENT_TYPE_MAP[rawType.toLowerCase().trim()] ?? "other";
}

// Converts "MM:SS" display clock to absolute minute accounting for period
function parseDisplayClock(displayClock?: string, period?: number): number {
  if (!displayClock) return 0;
  const [minStr] = displayClock.split(":");
  const minutes = parseInt(minStr ?? "0", 10);
  if (isNaN(minutes)) return 0;
  // Period 2 is always >= 45
  if ((period ?? 1) === 2) return Math.max(minutes, 45);
  return minutes;
}

function getStat(stats: EspnStatEntry[], ...names: string[]): number | undefined {
  for (const name of names) {
    const stat = stats.find(
      (s) => s.name === name || s.name.toLowerCase() === name.toLowerCase()
    );
    if (stat) {
      const val = stat.value ?? parseFloat(stat.displayValue);
      if (!isNaN(val)) return val;
    }
  }
  return undefined;
}

function resolveTeamSide(
  teamId: string | undefined,
  homeId: string | undefined,
  awayId: string | undefined
): TeamSide | undefined {
  if (!teamId) return undefined;
  if (teamId === homeId) return "home";
  if (teamId === awayId) return "away";
  return undefined;
}

export function normalizeMatchData(
  raw: EspnRawMatchData,
  matchId: string
): NormalizedMatchState {
  const competition = raw.header?.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  const homeComp = competitors.find((c) => c.homeAway === "home");
  const awayComp = competitors.find((c) => c.homeAway === "away");

  const statusRaw = competition?.status;
  const statusName = statusRaw?.type?.name ?? "STATUS_SCHEDULED";
  const period = statusRaw?.period ?? 1;
  const minute = parseDisplayClock(statusRaw?.displayClock, period);

  const homeTeamId = homeComp?.team?.id;
  const awayTeamId = awayComp?.team?.id;

  // Stats can come from boxscore or from competitor.statistics
  const boxTeams = raw.boxscore?.teams ?? [];
  const homeBoxTeam = boxTeams.find((t) => t.homeAway === "home");
  const awayBoxTeam = boxTeams.find((t) => t.homeAway === "away");
  const homeStats: EspnStatEntry[] = homeBoxTeam?.statistics ?? homeComp?.statistics ?? [];
  const awayStats: EspnStatEntry[] = awayBoxTeam?.statistics ?? awayComp?.statistics ?? [];

  // Map plays → MatchEvent[], keep last 50 to bound memory
  const recentEvents: MatchEvent[] = (raw.plays ?? [])
    .slice(-50)
    .map((play): MatchEvent => {
      const playPeriod = play.period?.number ?? period;
      const eventMinute = parseDisplayClock(play.clock?.displayValue, playPeriod);
      const clockSeconds = play.clock?.value;
      const second =
        clockSeconds !== undefined ? Math.floor(clockSeconds % 60) : undefined;

      return {
        id: String(play.id ?? `espn-${Date.now()}-${Math.random().toString(36).slice(2)}`),
        type: mapEventType(play.type?.text),
        teamSide: resolveTeamSide(play.team?.id, homeTeamId, awayTeamId),
        minute: eventMinute,
        second,
        timestamp: play.wallclock ?? new Date().toISOString(),
        playerName: play.participants?.[0]?.athlete?.displayName,
        raw: play,
      };
    });

  return {
    matchId,
    competition: raw.header?.league?.name,
    status: ESPN_STATUS_MAP[statusName] ?? "scheduled",
    minute,
    period,
    homeTeam: {
      id: homeTeamId ?? "home",
      name: homeComp?.team?.displayName ?? homeComp?.team?.name ?? "Home Team",
      shortName: homeComp?.team?.abbreviation ?? "HME",
      score: parseInt(String(homeComp?.score ?? "0"), 10),
    },
    awayTeam: {
      id: awayTeamId ?? "away",
      name: awayComp?.team?.displayName ?? awayComp?.team?.name ?? "Away Team",
      shortName: awayComp?.team?.abbreviation ?? "AWY",
      score: parseInt(String(awayComp?.score ?? "0"), 10),
    },
    stats: {
      homeCorners: getStat(homeStats, "cornerKicks", "corners"),
      awayCorners: getStat(awayStats, "cornerKicks", "corners"),
      homeShots: getStat(homeStats, "totalShots", "shots"),
      awayShots: getStat(awayStats, "totalShots", "shots"),
      homeYellowCards: getStat(homeStats, "yellowCards"),
      awayYellowCards: getStat(awayStats, "yellowCards"),
      possessionHome: getStat(homeStats, "possessionPct", "possession"),
      possessionAway: getStat(awayStats, "possessionPct", "possession"),
    },
    recentEvents,
    lastUpdatedAt: new Date().toISOString(),
  };
}
