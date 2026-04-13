/**
 * POST /api/predictions/generate
 * On-demand prediction generation for a live match.
 * Called when the predict page loads and no predictions exist yet.
 * Idempotent — returns existing predictions if already generated.
 */

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { generatePredictionsForMatch } from "@/lib/predictions";

export const maxDuration = 30;

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  const { matchId, homeTeam, awayTeam, competition } = await request.json() as {
    matchId: string;
    homeTeam: string;
    awayTeam: string;
    competition: string;
  };

  if (!matchId || !homeTeam || !awayTeam) {
    return NextResponse.json({ error: "matchId, homeTeam, awayTeam required" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // Check if already generated
  const { data: existing } = await supabase
    .from("match_predictions")
    .select("id")
    .eq("match_id", matchId)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ ok: true, alreadyExisted: true });
  }

  // Check if currently generating or permanently failed
  const { data: match } = await supabase
    .from("matches")
    .select("predictions_status")
    .eq("id", matchId)
    .single();

  const status = (match as { predictions_status?: string } | null)?.predictions_status;
  if (status === "generating") {
    return NextResponse.json({ ok: true, generating: true });
  }
  if (status === "permanently_failed") {
    return NextResponse.json({ ok: false, error: "Generation permanently failed for this match" }, { status: 422 });
  }

  const ok = await generatePredictionsForMatch(
    matchId,
    homeTeam,
    awayTeam,
    competition || "Football"
  );

  return NextResponse.json({ ok });
}
