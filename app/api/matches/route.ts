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

  const leagueFilter = searchParams.get("league"); // e.g. "ucl" or "Champions"

  // Helper: apply league filter to a match list
  const applyLeagueFilter = (list: any[]) => {
    if (!leagueFilter) return list;
    return list.filter((m) =>
      m.league?.toLowerCase().includes(leagueFilter.toLowerCase()) ||
      (leagueFilter === "ucl" && m.league?.toLowerCase().includes("champions"))
    );
  };

  // If DB has matches, return them (with league filter)
  if (matches && matches.length > 0) {
    return NextResponse.json({ matches: applyLeagueFilter(matches) });
  }

  // Fallback: fetch directly from ESPN if DB is empty
  try {
    let espnMatches = await fetchTodayMatches();
    if (espnMatches.length === 0) {
      espnMatches = await fetchUpcomingMatches();
    }

    // Try to persist them in DB for next time
    if (espnMatches.length > 0) {
      await supabase
        .from("matches")
        .upsert(espnMatches as any, { onConflict: "id" })
        .then(() => {});
    }

    // Apply status filter
    let filtered = espnMatches;
    if (filter === "live") {
      filtered = espnMatches.filter((m) => m.status === "live");
    } else if (filter === "upcoming") {
      filtered = espnMatches.filter((m) => m.status === "scheduled");
    } else if (filter === "past") {
      filtered = espnMatches.filter((m) => m.status === "finished");
    }

    return NextResponse.json({ matches: applyLeagueFilter(filtered) });
  } catch {
    return NextResponse.json({ matches: [] });
  }
}
