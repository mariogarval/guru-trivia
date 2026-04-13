/**
 * GET  /api/predictions?matchId=xxx  — fetch predictions + community vote counts for a match
 * POST /api/predictions               — submit a user's vote on a prediction
 */

import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

type MatchPredictionRow = Database["public"]["Tables"]["match_predictions"]["Row"];
type UserPredictionRow = Database["public"]["Tables"]["user_predictions"]["Row"];

export async function GET(request: NextRequest) {
  const matchId = request.nextUrl.searchParams.get("matchId");
  if (!matchId) return NextResponse.json({ error: "matchId required" }, { status: 400 });

  const supabase = createRouteHandlerClient<Database>({ cookies });

  const { data, error } = await (supabase as ReturnType<typeof createClient>)
    .from("match_predictions")
    .select("id, question_text, resolves_on, yes_votes, no_votes, correct_answer, resolved_at")
    .eq("match_id", matchId)
    .order("created_at");

  const predictions = data as Pick<
    MatchPredictionRow,
    "id" | "question_text" | "resolves_on" | "yes_votes" | "no_votes" | "correct_answer" | "resolved_at"
  >[] | null;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If the user is authenticated, also return their existing votes
  const { data: { session } } = await supabase.auth.getSession();
  let userVotes: Record<string, boolean> = {};

  if (session?.user) {
    const predIds = (predictions ?? []).map((p) => p.id);
    if (predIds.length > 0) {
      const { data: votesRaw } = await (supabase as ReturnType<typeof createClient>)
        .from("user_predictions")
        .select("prediction_id, answer")
        .eq("user_id", session.user.id)
        .in("prediction_id", predIds);

      const votes = votesRaw as Pick<UserPredictionRow, "prediction_id" | "answer">[] | null;
      for (const v of votes ?? []) {
        userVotes[v.prediction_id] = v.answer;
      }
    }
  }

  return NextResponse.json({ predictions: predictions ?? [], userVotes });
}

export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { data: { session } } = await supabase.auth.getSession();

  const body = await request.json();
  const { predictionId, matchId, answer } = body as {
    predictionId: string;
    matchId: string;
    answer: boolean;
  };

  if (!predictionId || !matchId || typeof answer !== "boolean") {
    return NextResponse.json({ error: "predictionId, matchId, answer required" }, { status: 400 });
  }

  // Use service role to increment vote counter (bypasses RLS on the counter column)
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const column = answer ? "yes_votes" : "no_votes";
  const { error: incError } = await service.rpc("increment_prediction_vote", {
    pred_id: predictionId,
    col: column,
  });

  if (incError) {
    // Fallback: fetch then update
    const { data: pred } = await service
      .from("match_predictions")
      .select("yes_votes, no_votes")
      .eq("id", predictionId)
      .single();

    if (pred) {
      await service
        .from("match_predictions")
        .update({ [column]: (answer ? (pred as MatchPredictionRow).yes_votes : (pred as MatchPredictionRow).no_votes) + 1 })
        .eq("id", predictionId);
    }
  }

  // Save user's vote if authenticated
  if (session?.user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("user_predictions")
      .upsert(
        {
          user_id: session.user.id,
          prediction_id: predictionId,
          match_id: matchId,
          answer,
        },
        { onConflict: "user_id,prediction_id" }
      );
  }

  // Return updated vote counts
  const { data: updated } = await service
    .from("match_predictions")
    .select("yes_votes, no_votes")
    .eq("id", predictionId)
    .single();

  return NextResponse.json({ ok: true, votes: updated });
}
