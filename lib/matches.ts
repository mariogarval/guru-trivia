/**
 * Match data sync from football-data.org API.
 * Used in a cron job or server action to keep the `matches` table updated.
 *
 * football-data.org free tier: 10 req/min, World Cup competition ID = 2000
 */

export interface FootballDataMatch {
  id: number;
  homeTeam: { name: string; crest: string };
  awayTeam: { name: string; crest: string };
  status: "SCHEDULED" | "IN_PLAY" | "PAUSED" | "FINISHED" | "TIMED";
  utcDate: string;
  venue: string | null;
  score: {
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
}

function mapStatus(
  fdStatus: FootballDataMatch["status"]
): "scheduled" | "live" | "finished" {
  switch (fdStatus) {
    case "IN_PLAY":
    case "PAUSED":
      return "live";
    case "FINISHED":
      return "finished";
    default:
      return "scheduled";
  }
}

function formatScore(match: FootballDataMatch): string | null {
  const { home, away } = match.score.fullTime;
  if (home === null || away === null) return null;
  return `${home}-${away}`;
}

export async function fetchWorldCupMatches(): Promise<
  Array<{
    id: string;
    home_team: string;
    away_team: string;
    home_team_crest: string;
    away_team_crest: string;
    status: "scheduled" | "live" | "finished";
    kickoff_time: string;
    venue: string | null;
    current_score: string | null;
  }>
> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) throw new Error("FOOTBALL_DATA_API_KEY not set");

  const res = await fetch(
    "https://api.football-data.org/v4/competitions/2000/matches",
    {
      headers: { "X-Auth-Token": apiKey },
      next: { revalidate: 60 }, // Cache for 60 seconds
    }
  );

  if (!res.ok) {
    throw new Error(`Football data API error: ${res.status}`);
  }

  const data = await res.json();
  const matches: FootballDataMatch[] = data.matches ?? [];

  return matches.map((m) => ({
    id: m.id.toString(),
    home_team: m.homeTeam.name,
    away_team: m.awayTeam.name,
    home_team_crest: m.homeTeam.crest,
    away_team_crest: m.awayTeam.crest,
    status: mapStatus(m.status),
    kickoff_time: m.utcDate,
    venue: m.venue,
    current_score: formatScore(m),
  }));
}
