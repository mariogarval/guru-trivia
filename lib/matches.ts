/**
 * Match data from FotMob's unofficial API.
 * Fetches today's matches from top European leagues.
 * No authentication needed.
 */

export const LEAGUES = {
  47: { name: "Premier League", country: "England", emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  87: { name: "La Liga", country: "Spain", emoji: "🇪🇸" },
  55: { name: "Serie A", country: "Italy", emoji: "🇮🇹" },
  54: { name: "Bundesliga", country: "Germany", emoji: "🇩🇪" },
} as const;

export type LeagueId = keyof typeof LEAGUES;

interface FotMobMatch {
  id: number;
  home: { name: string; id: number };
  away: { name: string; id: number };
  status: { started: boolean; finished: boolean; cancelled: boolean; scoreStr?: string; liveTime?: { long: string } };
  timeTS?: number;
  tournamentStage?: string;
}

interface FotMobLeagueResponse {
  matches?: {
    allMatches?: FotMobMatch[];
    firstUnplayedMatch?: { firstUnplayedMatchIndex: number };
  };
  details?: { name: string };
}

function mapFotMobStatus(status: FotMobMatch["status"]): "scheduled" | "live" | "finished" {
  if (status.finished) return "finished";
  if (status.started && !status.finished) return "live";
  return "scheduled";
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

/**
 * Fetch today's matches from FotMob for the given leagues.
 * Uses the matches-by-date endpoint for efficiency.
 */
export async function fetchTodayMatches(): Promise<MatchRow[]> {
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

  try {
    const res = await fetch(`https://www.fotmob.com/api/matches?date=${dateStr}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      next: { revalidate: 120 },
    });

    if (!res.ok) {
      console.error(`FotMob matches API error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const allMatches: MatchRow[] = [];
    const leagueIds = new Set(Object.keys(LEAGUES).map(Number));

    // The response has leagues[] array with matches inside
    const leagues = data?.leagues ?? [];
    for (const league of leagues) {
      const leagueId = league.id;
      if (!leagueIds.has(leagueId)) continue;

      const leagueInfo = LEAGUES[leagueId as LeagueId];
      const matches: FotMobMatch[] = league.matches ?? [];

      for (const m of matches) {
        const kickoff = m.timeTS
          ? new Date(m.timeTS * 1000).toISOString()
          : today.toISOString();

        allMatches.push({
          id: `fotmob-${m.id}`,
          home_team: m.home.name,
          away_team: m.away.name,
          home_team_crest: `https://images.fotmob.com/image_resources/logo/teamlogo/${m.home.id}_small.png`,
          away_team_crest: `https://images.fotmob.com/image_resources/logo/teamlogo/${m.away.id}_small.png`,
          status: mapFotMobStatus(m.status),
          kickoff_time: kickoff,
          venue: null,
          current_score: m.status.scoreStr ?? null,
          league: leagueInfo?.name ?? null,
        });
      }
    }

    return allMatches;
  } catch (err) {
    console.error("FotMob fetch error:", err);
    return [];
  }
}

/**
 * Fetch upcoming matches for next 3 days (for when today has no matches).
 */
export async function fetchUpcomingMatches(): Promise<MatchRow[]> {
  const allMatches: MatchRow[] = [];

  for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;

    try {
      const res = await fetch(`https://www.fotmob.com/api/matches?date=${dateStr}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        next: { revalidate: 300 },
      });

      if (!res.ok) continue;
      const data = await res.json();
      const leagueIds = new Set(Object.keys(LEAGUES).map(Number));
      const leagues = data?.leagues ?? [];

      for (const league of leagues) {
        if (!leagueIds.has(league.id)) continue;
        const leagueInfo = LEAGUES[league.id as LeagueId];
        const matches: FotMobMatch[] = league.matches ?? [];

        for (const m of matches) {
          const kickoff = m.timeTS
            ? new Date(m.timeTS * 1000).toISOString()
            : date.toISOString();

          allMatches.push({
            id: `fotmob-${m.id}`,
            home_team: m.home.name,
            away_team: m.away.name,
            home_team_crest: `https://images.fotmob.com/image_resources/logo/teamlogo/${m.home.id}_small.png`,
            away_team_crest: `https://images.fotmob.com/image_resources/logo/teamlogo/${m.away.id}_small.png`,
            status: mapFotMobStatus(m.status),
            kickoff_time: kickoff,
            venue: null,
            current_score: m.status.scoreStr ?? null,
            league: leagueInfo?.name ?? null,
          });
        }
      }
    } catch {
      continue;
    }

    // If we found matches, stop looking further ahead
    if (allMatches.length > 0) break;
  }

  return allMatches;
}
