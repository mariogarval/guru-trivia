import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

export async function GET() {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  const { data: stats } = await supabase
    .from("user_answers")
    .select("is_correct, points_earned")
    .eq("user_id", session.user.id);

  const totalAnswered = stats?.length ?? 0;
  const totalCorrect = stats?.filter((s) => s.is_correct).length ?? 0;
  const accuracy =
    totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  const { data: rankData } = await supabase
    .from("leaderboard")
    .select("global_rank, country_rank")
    .eq("user_id", session.user.id)
    .single();

  return NextResponse.json({
    profile,
    stats: {
      totalAnswered,
      totalCorrect,
      accuracy,
      globalRank: rankData?.global_rank ?? null,
      countryRank: rankData?.country_rank ?? null,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const allowed = ["username", "country", "preferred_language"];
  const update: Record<string, string> = {};

  for (const key of allowed) {
    if (body[key] !== undefined) {
      update[key] = body[key];
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", session.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
