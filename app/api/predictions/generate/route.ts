import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchPreGameContext } from "@/lib/sports-data";
import type { MatchPrediction, PredictionHalf, PredictionOption, LivePrediction } from "@/types/predictions";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * POST /api/predictions/generate
 * Body: { matchId, homeTeam, awayTeam, league, half }
 *   OR: { matchId, homeTeam, awayTeam, mode: "live", minute, homeScore, awayScore }
 *
 * In live mode: returns { livePredictions: LivePrediction[] } — 5 goal-resolvable predictions.
 * In pregame/halftime mode: returns { predictions: MatchPrediction[] }.
 * Falls back to curated templates if Claude is unavailable.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // ── Live mode ─────────────────────────────────────────────────────────────
    if (body.mode === "live") {
      const { homeTeam, awayTeam, league, minute = 0, homeScore = 0, awayScore = 0 } = body as {
        matchId: string;
        homeTeam: string;
        awayTeam: string;
        league?: string;
        mode: "live";
        minute: number;
        homeScore: number;
        awayScore: number;
      };

      let livePredictions: Omit<LivePrediction, "scoreAtCreation" | "minuteAtCreation">[] = [];

      try {
        const message = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1200,
          messages: [{
            role: "user",
            content: `You generate real-time football prediction questions for an in-match game.

Match: ${homeTeam} vs ${awayTeam}${league ? ` (${league})` : ""}
Current score: ${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}
Minute: ${minute}'

Generate exactly 5 predictions. Rules:
- Each question must be answerable YES or NO
- Must be resolvable from score changes alone (goals only)
- Short and punchy (under 10 words)
- windowSeconds: 90 to 180
- resolutionHint: one of "any_goal", "home_goal", "away_goal"
- simulatedVotes: [yesPercent, noPercent] that sum to 100
- Use short team names (last word of team name)

Return ONLY a valid JSON array with this exact shape:
[
  {
    "id": "<8-char alphanumeric>",
    "question": "<question>",
    "options": ["Yes", "No"],
    "windowSeconds": <number>,
    "resolutionHint": "<hint>",
    "simulatedVotes": [<yesPercent>, <noPercent>]
  }
]`,
          }],
        });

        const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
        const parsed = JSON.parse(raw.trim());
        if (Array.isArray(parsed) && parsed.length > 0) {
          livePredictions = parsed;
        }
      } catch {
        // fall through to fallback
      }

      if (livePredictions.length === 0) {
        livePredictions = buildLiveFallback(homeTeam, awayTeam, minute);
      }

      return NextResponse.json({ livePredictions });
    }

    // ── Pregame / halftime mode ───────────────────────────────────────────────
    const { homeTeam, awayTeam, league, half } = body as {
      matchId: string;
      homeTeam: string;
      awayTeam: string;
      league: string;
      half: PredictionHalf;
    };

    if (!homeTeam || !awayTeam || !half) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Try to enrich with standings/top scorers from football-data.org
    const preGameCtx = await fetchPreGameContext(homeTeam, awayTeam, league ?? "");

    // Build context string for Claude
    let contextBlock = `Match: ${homeTeam} (home) vs ${awayTeam} (away)\nLeague: ${league ?? "Unknown league"}`;

    if (preGameCtx?.homeStanding && preGameCtx?.awayStanding) {
      const h = preGameCtx.homeStanding;
      const a = preGameCtx.awayStanding;
      contextBlock += `\n\nStandings:\n- ${homeTeam}: ${h.position}th, ${h.points} pts, form: ${h.form ?? "N/A"}, GF: ${h.goalsFor}, GA: ${h.goalsAgainst}`;
      contextBlock += `\n- ${awayTeam}: ${a.position}th, ${a.points} pts, form: ${a.form ?? "N/A"}, GF: ${a.goalsFor}, GA: ${a.goalsAgainst}`;
    }

    if (preGameCtx?.topScorers && preGameCtx.topScorers.length > 0) {
      const relevant = preGameCtx.topScorers
        .filter((s) =>
          s.team.toLowerCase().includes(homeTeam.split(" ")[0]?.toLowerCase() ?? "") ||
          s.team.toLowerCase().includes(awayTeam.split(" ")[0]?.toLowerCase() ?? "")
        )
        .slice(0, 5);
      if (relevant.length > 0) {
        contextBlock += `\n\nKey scorers:\n` + relevant.map((s) => `- ${s.player} (${s.team}): ${s.goals} goals`).join("\n");
      }
    }

    const halfLabel = half === "first_half" ? "first half" : "second half";

    const systemPrompt = `You are a football prediction generator for a fan engagement app called GURU.
Generate exactly 6 match prediction questions for a given half of a football match.

Rules:
1. Every question must be answerable with Yes/No OR exactly 3 options (no more, no less for multi-choice)
2. Questions must be specific to THIS match — use real team names, player names when possible
3. Include a mix: 3 "likely" outcomes (60–75% community lean) and 3 "toss-up" outcomes (40–60% lean)
4. Questions must be resolvable from match statistics: goals, cards, corners, fouls, shots
5. Write engaging, punchy questions — as if a passionate football pundit is asking them
6. For simulatedVotes: assign realistic percentages (must sum to 100 for each question)

Return ONLY a valid JSON array with this exact shape per item:
[
  {
    "id": "<unique 8-char alphanumeric>",
    "question": "<question text>",
    "context": "<1 short sentence of relevant context, e.g. team form or player stat>",
    "options": [
      { "id": "<option_id>", "label": "<display text>", "votes": <integer count out of ~2500 total> }
    ],
    "resolutionHint": "<machine-readable hint: e.g. 'home_goal_period_1', 'red_card_any', 'both_score', 'corner_count_over_3_period_1'>"
  }
]

Do not wrap in markdown. Return only the raw JSON array.`;

    const userPrompt = `${contextBlock}

Generate 6 predictions for the ${halfLabel}.
Vary the topics: include at least 1 goalscorer question, 1 discipline question (cards/fouls), 1 corners/set-pieces question, and 2 outcome questions (first goal, clean sheet, etc.).`;

    let predictions: MatchPrediction[] = [];

    try {
      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `${systemPrompt}\n\n${userPrompt}`,
          },
        ],
      });

      const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
      const parsed = JSON.parse(raw.trim());

      if (Array.isArray(parsed)) {
        predictions = parsed.map((item: any) => ({
          id: item.id ?? Math.random().toString(36).slice(2, 10),
          half,
          question: item.question ?? "",
          context: item.context ?? undefined,
          options: (item.options ?? []).map((o: any) => ({
            id: o.id ?? "",
            label: o.label ?? "",
            votes: o.votes ?? Math.floor(Math.random() * 1000 + 200),
          })) as PredictionOption[],
          resolutionHint: item.resolutionHint ?? "unknown",
        }));
      }
    } catch (claudeError) {
      console.warn("[predictions/generate] Claude call failed, using fallback:", claudeError);
    }

    // Fallback if Claude failed or returned bad data
    if (predictions.length === 0) {
      predictions = buildFallback(homeTeam, awayTeam, half);
    }

    return NextResponse.json({ predictions });
  } catch (err) {
    console.error("[predictions/generate] Error:", err);
    return NextResponse.json({ error: "Failed to generate predictions" }, { status: 500 });
  }
}

// ── Fallback predictions ──────────────────────────────────────────────────────

function rng(seed: string, min: number, max: number): number {
  // Deterministic-ish pseudo-random from string seed
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  const norm = Math.abs(h) / 2147483647;
  return Math.round(min + norm * (max - min));
}

function buildFallback(homeTeam: string, awayTeam: string, half: PredictionHalf): MatchPrediction[] {
  const h = homeTeam;
  const a = awayTeam;

  const templates = half === "first_half"
    ? [
        {
          id: "fb_h1", question: `Will ${h} score in the first half?`,
          context: `${h} has scored in the first half in 3 of their last 5 home games.`,
          options: [
            { id: "yes", label: "Yes", votes: rng(h + "1", 1200, 1800) },
            { id: "no",  label: "No",  votes: rng(h + "2", 800, 1200) },
          ],
          resolutionHint: "home_goal_period_1",
        },
        {
          id: "fb_h2", question: `Will there be a yellow card in the first half?`,
          context: `The referee averages 3.2 yellow cards per game this season.`,
          options: [
            { id: "yes", label: "Yes", votes: rng(h + "3", 1500, 2000) },
            { id: "no",  label: "No",  votes: rng(h + "4", 500, 900) },
          ],
          resolutionHint: "yellow_card_period_1",
        },
        {
          id: "fb_h3", question: `Who scores the first goal of the match?`,
          context: `${h} averages 1.8 goals/game at home; ${a} averages 1.4 goals/game away.`,
          options: [
            { id: "home", label: h, votes: rng(a + "5", 900, 1400) },
            { id: "away", label: a, votes: rng(a + "6", 600, 1100) },
            { id: "none", label: "No goal", votes: rng(a + "7", 300, 700) },
          ],
          resolutionHint: "first_scorer_team",
        },
        {
          id: "fb_h4", question: `Will ${a} have a shot on target before the 30th minute?`,
          context: `${a} averages 5.1 shots on target per game this season.`,
          options: [
            { id: "yes", label: "Yes", votes: rng(a + "8", 1300, 1800) },
            { id: "no",  label: "No",  votes: rng(a + "9", 500, 900) },
          ],
          resolutionHint: "away_shot_on_target_before_30",
        },
        {
          id: "fb_h5", question: `Over 3 corners in the first half?`,
          context: `Combined, these teams average 11.4 corners per game.`,
          options: [
            { id: "yes", label: "Over 3", votes: rng(h + "10", 1100, 1600) },
            { id: "no",  label: "Under 3", votes: rng(h + "11", 800, 1200) },
          ],
          resolutionHint: "corner_count_over_3_period_1",
        },
        {
          id: "fb_h6", question: `Will ${h} keep a clean sheet in the first half?`,
          context: `${h} has kept clean sheets in 40% of their home first halves.`,
          options: [
            { id: "yes", label: "Yes", votes: rng(h + "12", 1000, 1400) },
            { id: "no",  label: "No",  votes: rng(h + "13", 900, 1400) },
          ],
          resolutionHint: "home_clean_sheet_period_1",
        },
      ]
    : [
        {
          id: "fb_s1", question: `Will ${a} score in the second half?`,
          context: `${a} has scored a second-half goal in 4 of their last 5 matches.`,
          options: [
            { id: "yes", label: "Yes", votes: rng(a + "14", 1300, 1800) },
            { id: "no",  label: "No",  votes: rng(a + "15", 700, 1200) },
          ],
          resolutionHint: "away_goal_period_2",
        },
        {
          id: "fb_s2", question: `Will there be a red card in the second half?`,
          context: `This fixture has seen red cards in 3 of the last 7 meetings.`,
          options: [
            { id: "yes", label: "Yes", votes: rng(a + "16", 400, 700) },
            { id: "no",  label: "No",  votes: rng(a + "17", 1800, 2200) },
          ],
          resolutionHint: "red_card_period_2",
        },
        {
          id: "fb_s3", question: `Both teams to score in the second half?`,
          context: `BTTS has occurred in the second half in 55% of ${h}'s games this season.`,
          options: [
            { id: "yes", label: "Yes — BTTS", votes: rng(h + "18", 1000, 1500) },
            { id: "no",  label: "No", votes: rng(h + "19", 900, 1400) },
          ],
          resolutionHint: "btts_period_2",
        },
        {
          id: "fb_s4", question: `Over 1 goal in the second half?`,
          context: `Average goals in 2nd half this league this season: 1.7.`,
          options: [
            { id: "yes", label: "Over 1", votes: rng(h + "20", 1200, 1700) },
            { id: "no",  label: "Under/Equal 1", votes: rng(h + "21", 700, 1200) },
          ],
          resolutionHint: "goal_count_over_1_period_2",
        },
        {
          id: "fb_s5", question: `Will there be a substitute who scores?`,
          context: `${h} has had 5 substitute goals this season — 3rd highest in the league.`,
          options: [
            { id: "yes", label: "Yes", votes: rng(a + "22", 700, 1100) },
            { id: "no",  label: "No", votes: rng(a + "23", 1400, 1900) },
          ],
          resolutionHint: "substitute_goal",
        },
        {
          id: "fb_s6", question: `Will the match have over 2.5 total goals?`,
          context: `Over 2.5 has landed in 62% of ${h}'s home games this season.`,
          options: [
            { id: "yes", label: "Over 2.5", votes: rng(h + "24", 1100, 1600) },
            { id: "no",  label: "Under 2.5", votes: rng(h + "25", 900, 1400) },
          ],
          resolutionHint: "total_goals_over_2_5",
        },
      ];

  return templates.map((t) => ({ ...t, half }));
}

// ── Live fallback predictions ──────────────────────────────────────────────────

function buildLiveFallback(
  homeTeam: string,
  awayTeam: string,
  minute: number
): Omit<LivePrediction, "scoreAtCreation" | "minuteAtCreation">[] {
  const h = homeTeam.split(" ").pop() ?? homeTeam;
  const a = awayTeam.split(" ").pop() ?? awayTeam;
  const nextMark = Math.min(minute + 5, minute < 45 ? 45 : 90);

  return [
    {
      id: "lv1",
      question: "Goal in the next 2 minutes?",
      options: ["Yes", "No"],
      windowSeconds: 120,
      resolutionHint: "any_goal",
      simulatedVotes: [35, 65],
    },
    {
      id: "lv2",
      question: `Will ${h} score next?`,
      options: ["Yes", "No"],
      windowSeconds: 180,
      resolutionHint: "home_goal",
      simulatedVotes: [42, 58],
    },
    {
      id: "lv3",
      question: `Will ${a} score in the next 3 minutes?`,
      options: ["Yes", "No"],
      windowSeconds: 180,
      resolutionHint: "away_goal",
      simulatedVotes: [30, 70],
    },
    {
      id: "lv4",
      question: `Any goal before the ${nextMark}' mark?`,
      options: ["Yes", "No"],
      windowSeconds: Math.max(90, (nextMark - minute) * 60),
      resolutionHint: "any_goal",
      simulatedVotes: [48, 52],
    },
    {
      id: "lv5",
      question: `Will ${h} be first to score?`,
      options: ["Yes", "No"],
      windowSeconds: 300,
      resolutionHint: "home_goal",
      simulatedVotes: [55, 45],
    },
  ];
}
