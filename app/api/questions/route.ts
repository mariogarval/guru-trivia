import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  fetchQuestionsForGame,
  generatePreGameQuestions,
  generateLiveMatchQuestions,
  type GeneratedQuestion,
} from "@/lib/questions";
import { createClient } from "@/lib/supabase/client";
import {
  fetchLiveMatchContext,
  fetchPreGameContext,
} from "@/lib/sports-data";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("match_id");
  const count = Math.min(parseInt(searchParams.get("count") ?? "10"), 10);
  const category = searchParams.get("category");
  const teams = searchParams.get("teams"); // "Home Team,Away Team"
  const league = searchParams.get("league"); // "Premier League"
  // force=1: skip DB cache and always generate fresh match-specific questions via Claude.
  // Set by MatchCard Trivia links so players always get questions about the actual game.
  const forceGenerate = searchParams.get("force") === "1";

  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user?.id ?? null;
  const serverSupabase = supabase as ReturnType<typeof createClient>;

  // ── Determine generation strategy based on real match data ───────────────
  let generateFn: ((homeTeam: string, awayTeam: string) => Promise<GeneratedQuestion[]>) | undefined;

  if (matchId && teams) {
    const teamNames = teams.split(",").map((t) => t.trim());
    const homeTeam = teamNames[0] ?? "";
    const awayTeam = teamNames[1] ?? "";

    // ESPN event IDs are prefixed "espn-{id}"
    const espnId = matchId.startsWith("espn-") ? matchId.slice(5) : null;

    if (espnId) {
      // Fetch real match context from ESPN (goals, cards, stats, and status)
      const liveCtx = await fetchLiveMatchContext(espnId);

      if (liveCtx && (liveCtx.matchStatus === "live" || liveCtx.matchStatus === "finished")) {
        // ── LIVE / FINISHED: questions about actual match events ────────────
        console.log(
          `[questions] Live match context fetched: ${liveCtx.goals.length} goals, ` +
          `${liveCtx.yellowCards.length} yellows, status=${liveCtx.matchStatus}`
        );
        generateFn = (_ht, _at) =>
          generateLiveMatchQuestions(homeTeam, awayTeam, liveCtx, count);
      } else {
        // ── PRE-GAME: questions grounded in standings + top scorers ─────────
        const preCtx = await fetchPreGameContext(homeTeam, awayTeam, league ?? "");
        if (preCtx) {
          console.log(
            `[questions] Pre-game context fetched: league=${preCtx.leagueName}, ` +
            `standings=${preCtx.standings?.length ?? 0} teams, ` +
            `scorers=${preCtx.topScorers?.length ?? 0}`
          );
        } else {
          console.log(
            "[questions] No pre-game context available (no FOOTBALL_DATA_API_KEY or unsupported league) — " +
            "falling back to conservative prompt"
          );
        }
        generateFn = (_ht, _at) =>
          generatePreGameQuestions(homeTeam, awayTeam, preCtx, count);
      }
    } else {
      // Non-ESPN match ID — use pre-game generation with no context
      generateFn = (_ht, _at) =>
        generatePreGameQuestions(homeTeam, awayTeam, null, count);
    }
  }

  // ── Force-generate: skip DB entirely, return fresh Claude questions ──────────
  if (forceGenerate && generateFn && teams) {
    try {
      const teamNames = teams.split(",").map((t) => t.trim());
      const homeTeam = teamNames[0] ?? "";
      const awayTeam = teamNames[1] ?? "";
      const generated = await generateFn(homeTeam, awayTeam);

      if (generated.length > 0) {
        const now = new Date().toISOString();
        const questions = generated.slice(0, count).map((g, i) => ({
          id: `gen-${Date.now()}-${i}`,
          match_id: matchId ?? null,
          category: g.category,
          difficulty: g.difficulty,
          question_text: g.question,
          options: g.options,
          correct_answer_index: -1, // hidden from client
          explanation: g.explanation,
          language: "en" as const,
          created_at: now,
        }));
        return NextResponse.json({ questions });
      }
    } catch (err) {
      console.error("[questions] force-generate failed, falling through to DB:", err);
    }
  }

  const questions = await fetchQuestionsForGame(
    serverSupabase,
    userId,
    matchId,
    count,
    category,
    teams ?? undefined,
    league ?? undefined,
    generateFn
  );

  // Sanitize: never expose correct_answer_index to client until answered
  const sanitized = questions.map(({ correct_answer_index: _, ...q }) => ({
    ...q,
    correct_answer_index: -1, // hidden — validated server-side on submit
  }));

  return NextResponse.json({ questions: sanitized });
}
