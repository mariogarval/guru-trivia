import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "global"; // global | country | friends
  const country = searchParams.get("country");
  const leagueId = searchParams.get("league_id");

  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (type === "friends" && !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let entries: unknown[] = [];

  if (type === "global") {
    const { data } = await supabase
      .from("leaderboard")
      .select("*")
      .order("global_rank")
      .limit(100);
    entries = data ?? [];
  } else if (type === "country" && country) {
    const { data } = await supabase
      .from("leaderboard")
      .select("*")
      .eq("country", country)
      .order("country_rank")
      .limit(100);
    entries = data ?? [];
  } else if (type === "friends" && leagueId && session) {
    // Get league members and their scores
    const { data: members } = await supabase
      .from("league_members")
      .select("user_id, profiles(id, username, country, total_points)")
      .eq("league_id", leagueId);

    if (members) {
      entries = (members as any[])
        .map((m) => {
          const p = m.profiles as {
            id: string;
            username: string | null;
            country: string | null;
            total_points: number;
          } | null;
          return p
            ? {
                user_id: p.id,
                username: p.username,
                country: p.country,
                total_points: p.total_points,
              }
            : null;
        })
        .filter(Boolean)
        .sort(
          (a, b) =>
            ((b as { total_points: number }).total_points ?? 0) -
            ((a as { total_points: number }).total_points ?? 0)
        )
        .map((e, i) => ({ ...e, global_rank: i + 1, country_rank: 0 }));
    }
  }

  // Get current user's rank if logged in
  let userRank: unknown = null;
  if (session) {
    const { data } = await supabase
      .from("leaderboard")
      .select("*")
      .eq("user_id", session.user.id)
      .single();
    userRank = data;
  }

  return NextResponse.json({ entries, userRank });
}
