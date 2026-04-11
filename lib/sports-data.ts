/**
 * Sports data fetching for grounding trivia questions in real facts.
 *
 * Two modes:
 * - Live match context: ESPN public API (no auth) — goals, cards, team stats
 * - Pre-game context: football-data.org free tier (requires FOOTBALL_DATA_API_KEY)
 *   → league standings, top scorers, team form
 *
 * All functions return null on failure so callers can gracefully degrade.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoalEvent {
  minute: string;
  player: string;
  team: string;
  isPenalty: boolean;
  isOwnGoal: boolean;
}

export interface CardEvent {
  minute: string;
  player: string;
  team: string;
  isRed: boolean;
}

export interface MatchStats {
  possession: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  corners: number | null;
}

/** Structured context for a live or recently-finished match. */
export interface LiveMatchContext {
  matchStatus: "live" | "scheduled" | "finished";
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  minute: string; // e.g. "67'" or ""
  goals: GoalEvent[];
  yellowCards: CardEvent[];
  redCards: CardEvent[];
  homeStats: MatchStats | null;
  awayStats: MatchStats | null;
}

export interface TeamStanding {
  position: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form: string | null; // e.g. "WWDLW"
}

export interface ScorerInfo {
  player: string;
  team: string;
  goals: number;
  assists: number | null;
}

/** Context fetched before a match starts for historical/form-based questions. */
export interface PreGameContext {
  leagueName: string;
  standings: TeamStanding[] | null; // top 20 in table
  topScorers: ScorerInfo[] | null; // top 10 scorers
  homeStanding: TeamStanding | null;
  awayStanding: TeamStanding | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FOOTBALL_DATA_LEAGUE_CODES: Record<string, string> = {
  "premier league": "PL",
  "la liga": "PD",
  "bundesliga": "BL1",
  "serie a": "SA",
  "ligue 1": "FL1",
  "eredivisie": "DED",
  "primeira liga": "PPL",
};

function mapESPNStatus(name: string): "live" | "scheduled" | "finished" {
  if (name === "STATUS_FINAL" || name === "STATUS_FULL_TIME") return "finished";
  if (
    name === "STATUS_IN_PROGRESS" ||
    name === "STATUS_HALFTIME" ||
    name.includes("IN_PROGRESS")
  )
    return "live";
  return "scheduled";
}

// ─── Live Match Context (ESPN) ────────────────────────────────────────────────

/**
 * Fetch real match events from ESPN's public soccer summary endpoint.
 * Works for live, scheduled (returns status + teams), and finished matches.
 *
 * @param espnEventId - numeric ESPN event ID (without "espn-" prefix)
 */
export async function fetchLiveMatchContext(
  espnEventId: string
): Promise<LiveMatchContext | null> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${espnEventId}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();

    const competition = data?.header?.competitions?.[0];
    if (!competition) return null;

    const competitors: any[] = competition.competitors ?? [];
    const home = competitors.find((c: any) => c.homeAway === "home");
    const away = competitors.find((c: any) => c.homeAway === "away");

    const matchStatus = mapESPNStatus(
      competition.status?.type?.name ?? "STATUS_SCHEDULED"
    );

    const homeTeamName: string = home?.team?.displayName ?? "";
    const awayTeamName: string = away?.team?.displayName ?? "";
    const homeTeamId: string = home?.team?.id ?? "";

    // ── Parse scoring/card details ──────────────────────────────────────────
    const goals: GoalEvent[] = [];
    const yellowCards: CardEvent[] = [];
    const redCards: CardEvent[] = [];

    for (const detail of competition.details ?? []) {
      const athlete = detail.athletes?.[0];
      const playerName: string = athlete?.displayName ?? "Unknown Player";
      const isHomeTeam: boolean = detail.team?.id === homeTeamId;
      const teamName = isHomeTeam ? homeTeamName : awayTeamName;
      const minute: string = detail.clock?.displayValue ?? "?";

      if (detail.scoringPlay || detail.type?.text?.toLowerCase().includes("goal")) {
        goals.push({
          minute,
          player: playerName,
          team: teamName,
          isPenalty: detail.penaltyKick === true,
          isOwnGoal: detail.ownGoal === true,
        });
      } else if (detail.redCard === true) {
        redCards.push({ minute, player: playerName, team: teamName, isRed: true });
      } else if (detail.yellowCard === true) {
        yellowCards.push({ minute, player: playerName, team: teamName, isRed: false });
      }
    }

    // ── Parse team stats from boxscore ──────────────────────────────────────
    let homeStats: MatchStats | null = null;
    let awayStats: MatchStats | null = null;

    const boxscoreTeams: any[] = data?.boxscore?.teams ?? [];
    for (const bTeam of boxscoreTeams) {
      const isHome: boolean = bTeam.team?.id === homeTeamId;
      const stats: MatchStats = {
        possession: null,
        shots: null,
        shotsOnTarget: null,
        corners: null,
      };
      for (const stat of bTeam.statistics ?? []) {
        const name: string = (stat.name ?? "").toLowerCase();
        const val = parseFloat(stat.displayValue ?? "");
        if (!isNaN(val)) {
          if (name.includes("possession")) stats.possession = val;
          else if (name === "shots" || name === "totalshots") stats.shots = val;
          else if (name.includes("shotsontarget") || name === "shotsontarget")
            stats.shotsOnTarget = val;
          else if (name.includes("corner")) stats.corners = val;
        }
      }
      if (isHome) homeStats = stats;
      else awayStats = stats;
    }

    return {
      matchStatus,
      homeTeam: homeTeamName,
      awayTeam: awayTeamName,
      homeScore: parseInt(home?.score ?? "0") || 0,
      awayScore: parseInt(away?.score ?? "0") || 0,
      minute: competition.status?.displayClock ?? "",
      goals,
      yellowCards,
      redCards,
      homeStats,
      awayStats,
    };
  } catch (err) {
    console.error("[sports-data] fetchLiveMatchContext failed:", err);
    return null;
  }
}

// ─── Pre-Game Context (football-data.org) ────────────────────────────────────

/**
 * Fetch league standings and top scorers from football-data.org.
 * Requires FOOTBALL_DATA_API_KEY env var (free tier: 10 req/min).
 * Returns null if no API key is configured or the request fails.
 *
 * Data is cached for 1 hour since standings don't change mid-match.
 */
export async function fetchPreGameContext(
  homeTeam: string,
  awayTeam: string,
  leagueName: string
): Promise<PreGameContext | null> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey || apiKey === "your_football_data_api_key") return null;

  const leagueCode = FOOTBALL_DATA_LEAGUE_CODES[leagueName.toLowerCase()];
  if (!leagueCode) return null;

  const headers = { "X-Auth-Token": apiKey };

  try {
    const [standingsRes, scorersRes] = await Promise.allSettled([
      fetch(
        `https://api.football-data.org/v4/competitions/${leagueCode}/standings`,
        { headers, next: { revalidate: 3600 } as any }
      ),
      fetch(
        `https://api.football-data.org/v4/competitions/${leagueCode}/scorers?limit=10`,
        { headers, next: { revalidate: 3600 } as any }
      ),
    ]);

    let standings: TeamStanding[] | null = null;
    let topScorers: ScorerInfo[] | null = null;

    if (standingsRes.status === "fulfilled" && standingsRes.value.ok) {
      const standingsData = await standingsRes.value.json();
      const tableEntries: any[] = standingsData?.standings?.[0]?.table ?? [];
      standings = tableEntries.slice(0, 20).map(
        (entry: any): TeamStanding => ({
          position: entry.position ?? 0,
          team: entry.team?.name ?? entry.team?.shortName ?? "",
          played: entry.playedGames ?? 0,
          won: entry.won ?? 0,
          drawn: entry.draw ?? 0,
          lost: entry.lost ?? 0,
          goalsFor: entry.goalsFor ?? 0,
          goalsAgainst: entry.goalsAgainst ?? 0,
          points: entry.points ?? 0,
          form: entry.form ?? null,
        })
      );
    }

    if (scorersRes.status === "fulfilled" && scorersRes.value.ok) {
      const scorersData = await scorersRes.value.json();
      topScorers = (scorersData?.scorers ?? [])
        .slice(0, 10)
        .map(
          (s: any): ScorerInfo => ({
            player: s.player?.name ?? "",
            team: s.team?.name ?? s.team?.shortName ?? "",
            goals: s.goals ?? 0,
            assists: s.assists ?? null,
          })
        );
    }

    // Fuzzy-match team names against standings entries
    const findStanding = (teamName: string): TeamStanding | null => {
      if (!standings) return null;
      const needle = teamName.toLowerCase().replace(/\bfc\b|\bac\b|\bsc\b/g, "").trim();
      return (
        standings.find((s) => {
          const hay = s.team.toLowerCase().replace(/\bfc\b|\bac\b|\bsc\b/g, "").trim();
          return hay.includes(needle) || needle.includes(hay);
        }) ?? null
      );
    };

    return {
      leagueName,
      standings,
      topScorers,
      homeStanding: findStanding(homeTeam),
      awayStanding: findStanding(awayTeam),
    };
  } catch (err) {
    console.error("[sports-data] fetchPreGameContext failed:", err);
    return null;
  }
}
