/**
 * Vercel Cron: runs every 5 minutes.
 * 1. Fetches today's matches from ESPN.
 * 2. Upserts them to the DB.
 * 3. For newly-live matches without predictions → generate (with one retry).
 * 4. For newly-finished matches with unresolved predictions → resolve.
 */

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { fetchTodayMatches } from "@/lib/matches";
import { generatePredictionsForMatch, resolvePredictionsForMatch } from "@/lib/predictions";

export const runtime = "nodejs";
export const maxDuration = 60;

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: Request) {
  // Verify Vercel cron secret to prevent unauthorized calls
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const log: string[] = [];

  try {
    // 1. Fetch live match data from ESPN
    const espnMatches = await fetchTodayMatches();
    log.push(`Fetched ${espnMatches.length} matches from ESPN`);

    if (espnMatches.length > 0) {
      // 2. Upsert all matches (updates status/score)
      await supabase
        .from("matches")
        .upsert(
          espnMatches.map((m) => ({
            id: m.id,
            home_team: m.home_team,
            away_team: m.away_team,
            home_team_crest: m.home_team_crest,
            away_team_crest: m.away_team_crest,
            status: m.status,
            kickoff_time: m.kickoff_time,
            venue: m.venue,
            current_score: m.current_score,
            league: m.league,
          })),
          { onConflict: "id", ignoreDuplicates: false }
        );
    }

    // 3. Handle live matches — generate predictions if needed
    const liveMatches = espnMatches.filter((m) => m.status === "live");
    if (liveMatches.length > 0) {
      const liveIds = liveMatches.map((m) => m.id);
      const { data: dbLive } = await supabase
        .from("matches")
        .select("id, home_team, away_team, league, predictions_status, predictions_last_attempt")
        .in("id", liveIds);

      for (const match of dbLive ?? []) {
        const status = match.predictions_status as string | null;
        const lastAttempt = match.predictions_last_attempt
          ? new Date(match.predictions_last_attempt).getTime()
          : 0;
        const minsAgo = (Date.now() - lastAttempt) / 60_000;

        if (status === "generated" || status === "permanently_failed" || status === "generating") {
          // Already done, in-progress, or permanently given up
          continue;
        }

        if (status === "failed" && minsAgo < 2) {
          // Wait at least 2 minutes before retrying
          continue;
        }

        if (status === "failed" && minsAgo >= 2) {
          // Second attempt — if this fails too, mark permanently_failed
          log.push(`Retrying prediction generation for ${match.id}`);
          const ok = await generatePredictionsForMatch(
            match.id,
            match.home_team,
            match.away_team,
            match.league ?? "Football"
          );
          if (!ok) {
            await supabase
              .from("matches")
              .update({ predictions_status: "permanently_failed" })
              .eq("id", match.id);
            log.push(`Permanently failed: ${match.id}`);
          } else {
            log.push(`Retry succeeded: ${match.id}`);
          }
          continue;
        }

        // First attempt (status is null)
        log.push(`Generating predictions for ${match.id} (${match.home_team} vs ${match.away_team})`);
        await generatePredictionsForMatch(
          match.id,
          match.home_team,
          match.away_team,
          match.league ?? "Football"
        );
      }
    }

    // 4. Handle finished matches — resolve unresolved predictions
    const finishedMatches = espnMatches.filter((m) => m.status === "finished" && m.current_score);
    if (finishedMatches.length > 0) {
      const finishedIds = finishedMatches.map((m) => m.id);

      // Find matches with unresolved predictions
      const { data: unresolvedPreds } = await supabase
        .from("match_predictions")
        .select("match_id")
        .in("match_id", finishedIds)
        .is("resolved_at", null);

      const matchesNeedingResolve = Array.from(
        new Set((unresolvedPreds ?? []).map((p: { match_id: string }) => p.match_id))
      );

      for (const matchId of matchesNeedingResolve) {
        const espnMatch = finishedMatches.find((m) => m.id === matchId);
        if (!espnMatch?.current_score) continue;

        log.push(`Resolving predictions for finished match ${matchId}`);
        await resolvePredictionsForMatch(matchId, espnMatch.current_score);
      }
    }

    return NextResponse.json({ ok: true, log });
  } catch (err) {
    console.error("[cron/check-matches]", err);
    return NextResponse.json({ ok: false, error: String(err), log }, { status: 500 });
  }
}
