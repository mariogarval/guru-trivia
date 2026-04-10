/**
 * Match data from ESPN's public API.
 * Fetches today's and upcoming matches from top European leagues.
 * No authentication needed.
 */

export const LEAGUES = {
  "eng.1": { name: "Premier League", country: "England", emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  "esp.1": { name: "La Liga", country: "Spain", emoji: "🇪🇸" },
  "ita.1": { name: "Serie A", country: "Italy", emoji: "🇮🇹" },
  "ger.1": { name: "Bundesliga", country: "Germany", emoji: "🇩🇪" },
} as const;

export type LeagueCode = keyof typeof LEAGUES;

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

interface ESPNTeam {
  id: string;
  displayName: string;
  shortDisplayName: string;
  logo: string;
}

interface ESPNCompetitor {
  homeAway: "home" | "away";
  team: ESPNTeam;
  score?: string;
}

interface ESPNStatusType {
  name: string; // STATUS_SCHEDULED, STATUS_IN_PROGRESS, STATUS_FINAL, etc.
  completed: boolean;
}

interface ESPNEvent {
  id: string;
  date: string;
  status: {
    type: ESPNStatusType;
    displayClock?: string;
  };
  competitions: Array<{
    competitors: ESPNCompetitor[];
    venue?: { fullName: string };
  }>;
}

interface ESPNScoreboardResponse {
  leagues?: Array<{ name: string }>;
  events?: ESPNEvent[];
}

export interface MatchRow {
  id: string;
  home_team: string;
  away_team: string;
  home_team_crest: string | null;
  away_team_crest: string | null;
  status: "scheduled" | "live" | "finished";
  kickoff_time: string;
  venue: string | null;
  current_score: string | null;
  league: string | null;
}

function mapESPNStatus(statusName: string): "scheduled" | "live" | "finished" {
  if (statusName === "STATUS_FINAL" || statusName === "STATUS_FULL_TIME") return "finished";
  if (statusName === "STATUS_IN_PROGRESS" || statusName === "STATUS_HALFTIME" || statusName === "STATUS_FIRST_HALF" || statusName === "STATUS_SECOND_HALF") return "live";
  return "scheduled";
}

function parseESPNEvents(events: ESPNEvent[], leagueName: string): MatchRow[] {
  const matches: MatchRow[] = [];

  for (const event of events) {
    const comp = event.competitions?.[0];
    if (!comp) continue;

    const home = comp.competitors?.find((c) => c.homeAway === "home");
    const away = comp.competitors?.find((c) => c.homeAway === "away");
    if (!home || !away) continue;

    const status = mapESPNStatus(event.status.type.name);
    const hasScore = status === "live" || status === "finished";
    const scoreStr = hasScore && home.score && away.score
      ? `${home.score} - ${away.score}`
      : null;

    matches.push({
      id: `espn-${event.id}`,
      home_team: home.team.displayName,
      away_team: away.team.displayName,
      home_team_crest: home.team.logo || null,
      away_team_crest: away.team.logo || null,
      status,
      kickoff_time: event.date,
      venue: comp.venue?.fullName ?? null,
      current_score: scoreStr,
      league: leagueName,
    });
  }

  return matches;
}

/**
 * Fetch today's matches from ESPN for the configured leagues.
 */
export async function fetchTodayMatches(): Promise<MatchRow[]> {
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

  const allMatches: MatchRow[] = [];
  const leagueEntries = Object.entries(LEAGUES) as [LeagueCode, (typeof LEAGUES)[LeagueCode]][];

  // Fetch all leagues in parallel
  const results = await Promise.allSettled(
    leagueEntries.map(async ([code, info]) => {
      try {
        const res = await fetch(`${ESPN_BASE}/${code}/scoreboard?dates=${dateStr}`, {
          next: { revalidate: 120 },
        });
        if (!res.ok) return [];
        const data: ESPNScoreboardResponse = await res.json();
        return parseESPNEvents(data.events ?? [], info.name);
      } catch {
        return [];
      }
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allMatches.push(...result.value);
    }
  }

  // Sort by kickoff time
  allMatches.sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

  return allMatches;
}

/**
 * Fetch upcoming matches for next 3 days (for when today has no/few matches).
 */
export async function fetchUpcomingMatches(): Promise<MatchRow[]> {
  const allMatches: MatchRow[] = [];
  const leagueEntries = Object.entries(LEAGUES) as [LeagueCode, (typeof LEAGUES)[LeagueCode]][];

  // Build date range: tomorrow to 3 days ahead
  const start = new Date();
  start.setDate(start.getDate() + 1);
  const end = new Date();
  end.setDate(end.getDate() + 3);

  const startStr = `${start.getFullYear()}${String(start.getMonth() + 1).padStart(2, "0")}${String(start.getDate()).padStart(2, "0")}`;
  const endStr = `${end.getFullYear()}${String(end.getMonth() + 1).padStart(2, "0")}${String(end.getDate()).padStart(2, "0")}`;

  const results = await Promise.allSettled(
    leagueEntries.map(async ([code, info]) => {
      try {
        const res = await fetch(`${ESPN_BASE}/${code}/scoreboard?dates=${startStr}-${endStr}`, {
          next: { revalidate: 300 },
        });
        if (!res.ok) return [];
        const data: ESPNScoreboardResponse = await res.json();
        return parseESPNEvents(data.events ?? [], info.name);
      } catch {
        return [];
      }
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allMatches.push(...result.value);
    }
  }

  allMatches.sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

  return allMatches;
}
