import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { fetchTodayMatches, fetchUpcomingMatches } from "@/lib/matches";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") ?? "all"; // live | upcoming | past | all | today

  const supabase = createRouteHandlerClient<Database>({ cookies });
  const now = new Date().toISOString();

  // First try from DB
  let query = supabase.from("matches").select("*").order("kickoff_time");

  switch (filter) {
    case "live":
      query = query.eq("status", "live");
      break;
    case "upcoming": {
      const in72h = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      query = query
        .eq("status", "scheduled")
        .gte("kickoff_time", now)
        .lte("kickoff_time", in72h);
      break;
    }
    case "today": {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      query = query
        .gte("kickoff_time", startOfDay.toISOString())
        .lte("kickoff_time", endOfDay.toISOString());
      break;
    }
    case "past": {
      const minus48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      query = query
        .eq("status", "finished")
        .gte("kickoff_time", minus48h);
      break;
    }
  }

  const { data: matches } = await query.limit(30);

  // If DB has matches, return them
  if (matches && matches.length > 0) {
    return NextResponse.json({ matches });
  }

  // Fallback: fetch directly from FotMob if DB is empty
  try {
    let fotmobMatches = await fetchTodayMatches();
    if (fotmobMatches.length === 0) {
      fotmobMatches = await fetchUpcomingMatches();
    }

    // Try to persist them in DB for next time
    if (fotmobMatches.length > 0) {
      await supabase
        .from("matches")
        .upsert(fotmobMatches as any, { onConflict: "id" })
        .then(() => {});
    }

    // Apply filter to the fetched matches
    let filtered = fotmobMatches;
    if (filter === "live") {
      filtered = fotmobMatches.filter((m) => m.status === "live");
    } else if (filter === "upcoming") {
      filtered = fotmobMatches.filter((m) => m.status === "scheduled");
    } else if (filter === "past") {
      filtered = fotmobMatches.filter((m) => m.status === "finished");
    }

    return NextResponse.json({ matches: filtered });
  } catch {
    return NextResponse.json({ matches: [] });
  }
}
